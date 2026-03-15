#!/usr/bin/env pwsh
# Aloop Loop — Generic Multi-Provider Autonomous Coding Loop
# Usage: loop.ps1 -PromptsDir <path> -SessionDir <path> -WorkDir <path> [-Mode plan-build-review] [-Provider claude] [-MaxIterations 50]
#
# Modes:
#   plan               - planning only (gap analysis, update TODO)
#   build              - building only (implement tasks from TODO)
#   review             - review only (audit last build against quality gates)
#   plan-build         - alternating: plan -> build -> plan -> build -> ...
#   plan-build-review  - full cycle: plan -> build x3 -> proof -> review -> ... (DEFAULT)
#
# Providers:
#   claude, codex, gemini, copilot, round-robin

param(
    [Parameter(Mandatory)]
    [string]$PromptsDir,

    [Parameter(Mandatory)]
    [string]$SessionDir,

    [Parameter(Mandatory)]
    [string]$WorkDir,

    [ValidateSet('plan', 'build', 'review', 'plan-build', 'plan-build-review')]
    [string]$Mode = 'plan-build-review',

    [ValidateSet('claude', 'opencode', 'codex', 'gemini', 'copilot', 'round-robin')]
    [string]$Provider = 'claude',

    [string[]]$RoundRobinProviders = @('claude', 'opencode', 'codex', 'gemini', 'copilot'),

    # Model defaults — keep in sync with ~/.aloop/config.yml (source of truth)
    [string]$ClaudeModel = 'opus',
    [string]$CodexModel = 'gpt-5.3-codex',
    [string]$GeminiModel = 'gemini-3.1-pro-preview',
    [string]$CopilotModel = 'gpt-5.3-codex',
    [string]$CopilotRetryModel = 'claude-sonnet-4.6',

    [int]$MaxIterations = 50,
    [int]$MaxStuck = 3,

    [int]$ProviderTimeoutSec = $(if ($env:ALOOP_PROVIDER_TIMEOUT) { [int]$env:ALOOP_PROVIDER_TIMEOUT } else { 600 }),

    [ValidateSet('start', 'restart', 'resume')]
    [string]$LaunchMode = 'start',

    [switch]$BackupEnabled,
    [switch]$DryRun,
    [switch]$DangerouslySkipContainer
)

$ErrorActionPreference = 'Stop'

# Defense in depth: clear CLAUDECODE from the process environment at script entry.
if (Test-Path Env:CLAUDECODE) {
    Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
}

# ============================================================================
# PATH NORMALIZATION — tolerate POSIX-style paths from Git Bash / MSYS
# ============================================================================

function ConvertTo-NativePath {
    param([string]$Value)
    # Match POSIX-style /c/... or /C/... (single letter after leading slash, not UNC \\)
    if ($Value -match '^[\\/](?![\\/])([a-zA-Z])(?:[\\/](.*))?$') {
        $drive = $Matches[1].ToUpper()
        $tail  = if ($Matches[2]) { $Matches[2] -replace '/', '\' } else { '' }
        if ($tail.Length -gt 0) { return "${drive}:\${tail}" } else { return "${drive}:\" }
    }
    return $Value
}

$PromptsDir = ConvertTo-NativePath $PromptsDir
$SessionDir = ConvertTo-NativePath $SessionDir
$WorkDir    = ConvertTo-NativePath $WorkDir
$sessionId  = Split-Path -Leaf $SessionDir

# ============================================================================
# VALIDATION
# ============================================================================

if (-not (Test-Path $PromptsDir)) {
    Write-Error "Prompts directory not found: $PromptsDir"
    exit 1
}

if (-not (Test-Path $WorkDir)) {
    Write-Error "Work directory not found: $WorkDir"
    exit 1
}

# Create session directory if it doesn't exist
if (-not (Test-Path $SessionDir)) {
    New-Item -ItemType Directory -Path $SessionDir -Force | Out-Null
}

# ============================================================================
# DEVCONTAINER AUTO-ROUTING — detect and route provider calls through container
# ============================================================================

$script:useDevcontainer = $false
$devcontainerJsonPath = Join-Path $WorkDir '.devcontainer' 'devcontainer.json'

function Initialize-DevcontainerRouting {
    if (-not (Test-Path $devcontainerJsonPath)) {
        Write-Host "No devcontainer found. Run /aloop:devcontainer to set up isolated agent execution."
        return
    }

    if ($DangerouslySkipContainer) {
        Write-Warning "DANGER: Running agents directly on host without container isolation. Agents have full access to your filesystem, network, and credentials."
        return
    }

    # Check if devcontainer CLI is available
    $dcCmd = Get-Command 'devcontainer' -ErrorAction SilentlyContinue
    if (-not $dcCmd) {
        Write-Warning "devcontainer CLI not found on PATH. Running agents directly on host. Install with: npm install -g @devcontainers/cli"
        return
    }

    # Check if container is already running
    Write-Host "Checking devcontainer status..."
    $checkResult = $null
    try {
        $checkResult = & devcontainer exec --workspace-folder $WorkDir -- echo ok 2>&1
    } catch { }

    if (-not ($checkResult -match 'ok')) {
        Write-Host "Starting devcontainer..."
        $upResult = & devcontainer up --workspace-folder $WorkDir 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "devcontainer up failed (exit $LASTEXITCODE). Running agents directly on host."
            Write-Warning ($upResult | Out-String)
            return
        }
        Write-Host "Devcontainer started successfully."
    } else {
        Write-Host "Devcontainer already running."
    }

    $script:useDevcontainer = $true
    Write-Host "Provider calls will be routed through devcontainer."
}

Initialize-DevcontainerRouting

# ============================================================================
# SESSION LOCKING — prevent multiple loops on same session files
# ============================================================================

$sessionLockFile = Join-Path $SessionDir "session.lock"

function Test-SessionLockAlive {
    if (-not (Test-Path $sessionLockFile)) { return $false }
    $lockPid = (Get-Content $sessionLockFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if (-not $lockPid -or $lockPid -notmatch '^\d+$') { return $false }
    $proc = Get-Process -Id ([int]$lockPid) -ErrorAction SilentlyContinue
    return ($null -ne $proc)
}

if (Test-SessionLockAlive) {
    $existingPid = (Get-Content $sessionLockFile | Select-Object -First 1).Trim()
    Write-Error "Session is already locked by PID $existingPid (still alive). Another loop is running on this session directory: $SessionDir"
    exit 1
}

# Write our PID to the lockfile
$PID | Set-Content -Encoding utf8 $sessionLockFile

function Remove-SessionLock {
    if (Test-Path $sessionLockFile) {
        $lockPid = (Get-Content $sessionLockFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
        if ($lockPid -eq "$PID") {
            Remove-Item $sessionLockFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# ============================================================================
# PROVIDER PROCESS TRACKING — kill hung/zombie provider on timeout or exit
# ============================================================================

$script:activeProviderProcess = $null

function Stop-ActiveProvider {
    if ($null -ne $script:activeProviderProcess) {
        try {
            if (-not $script:activeProviderProcess.HasExited) {
                $childPid = $script:activeProviderProcess.Id
                # Kill the entire process tree (provider may spawn children)
                & taskkill /F /T /PID $childPid 2>$null | Out-Null
                Write-Warning "Killed active provider process tree (PID $childPid)"
            }
        } catch { }
        $script:activeProviderProcess = $null
    }
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Normalize-ProviderList {
    param([string[]]$RawProviders)
    $normalized = @()
    foreach ($raw in $RawProviders) {
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        foreach ($item in ($raw -split ',')) {
            $trimmed = $item.Trim().ToLowerInvariant()
            if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                $normalized += $trimmed
            }
        }
    }
    return $normalized
}

function Resolve-IterationProvider {
    param([int]$IterationNumber)
    if ($Provider -eq 'round-robin') {
        $startIndex = ($IterationNumber - 1) % $RoundRobinProviders.Count
        return Resolve-HealthyProvider -StartIndex $startIndex
    }
    return $Provider
}

function Resolve-IterationMode {
    param([int]$IterationNumber)
    $script:lastModeWasForced = $false
    $script:resolvedPromptName = $null
    if (Resolve-CyclePromptFromPlan) {
        return (Get-ModeFromPromptName -PromptName $script:resolvedPromptName)
    }
    $requestedMode = $Mode
    if ($Mode -eq 'plan-build') {
        $phase = $script:cyclePosition % 2
        if ($phase -eq 0) { $requestedMode = 'plan' } else { $requestedMode = 'build' }
    }
    if ($Mode -eq 'plan-build-review') {
        # 6-step cycle: plan -> build -> build -> build -> proof -> review
        $phase = $script:cyclePosition % 6
        switch ($phase) {
            0 { $requestedMode = 'plan' }
            1 { $requestedMode = 'build' }
            2 { $requestedMode = 'build' }
            3 { $requestedMode = 'build' }
            4 { $requestedMode = 'proof' }
            5 { $requestedMode = 'review' }
        }
    }

    if ($Mode -in @('plan-build', 'plan-build-review')) {
        $actualMode = Check-PhasePrerequisite -RequestedPhase $requestedMode
        if ($actualMode -ne $requestedMode) {
            $script:lastModeWasForced = $true
        }
        return $actualMode
    }

    return $requestedMode
}

function Get-ModeFromPromptName {
    param([Parameter(Mandatory)][string]$PromptName)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($PromptName)
    if ($base.StartsWith('PROMPT_')) {
        $base = $base.Substring('PROMPT_'.Length)
    }
    if ($base.Contains('_')) {
        return $base.Split('_')[0]
    }
    return $base
}

function Resolve-CyclePromptFromPlan {
    $loopPlanFile = Join-Path $SessionDir "loop-plan.json"
    if (-not (Test-Path $loopPlanFile)) { return $false }
    try {
        $plan = Get-Content -Path $loopPlanFile -Raw | ConvertFrom-Json
        if (-not $plan.cycle -or $plan.cycle.Count -eq 0) { return $false }
        $script:cycleLength = [int]$plan.cycle.Count
        $rawCyclePos = if ($null -ne $plan.cyclePosition) { [int]$plan.cyclePosition } else { $script:cyclePosition }
        $script:cyclePosition = $rawCyclePos
        $promptIndex = $rawCyclePos % $script:cycleLength
        $script:resolvedPromptName = [string]$plan.cycle[$promptIndex]
        return (-not [string]::IsNullOrWhiteSpace($script:resolvedPromptName))
    } catch {
        return $false
    }
}

function Parse-Frontmatter {
    param([Parameter(Mandatory)][string]$PromptFile)
    $script:frontmatter = @{
        provider = ''
        model = ''
        agent = ''
        reasoning = ''
    }
    if (-not (Test-Path $PromptFile)) { return }
    $content = Get-Content -Path $PromptFile -Raw
    if (-not $content.StartsWith("---")) { return }
    $parts = $content -split "(?ms)^---\s*$"
    if ($parts.Count -lt 3) { return }
    $header = $parts[1] -split "`r?`n"
    foreach ($line in $header) {
        if ($line -match '^\s*(provider|model|agent|reasoning)\s*:\s*(.+?)\s*$') {
            $script:frontmatter[$Matches[1].ToLowerInvariant()] = $Matches[2].Trim()
        }
    }
}

function Persist-LoopPlanState {
    param([int]$Iteration = 0)
    $loopPlanFile = Join-Path $SessionDir "loop-plan.json"
    if (-not (Test-Path $loopPlanFile)) { return }
    
    # Update script:allTasksMarkedDone before persisting
    $script:allTasksMarkedDone = Check-AllTasksComplete

    try {
        $plan = Get-Content -Path $loopPlanFile -Raw | ConvertFrom-Json
        $plan.cyclePosition = [int]$script:cyclePosition
        if ($Iteration -gt 0) {
            $plan.iteration = [int]$Iteration
        }
        $plan.allTasksMarkedDone = [bool]$script:allTasksMarkedDone
        $plan | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 $loopPlanFile
    } catch { }
}

function Assert-ProviderInstalled {
    param([string]$ProviderName)
    if (-not (Get-Command $ProviderName -ErrorAction SilentlyContinue)) {
        throw "CLI '$ProviderName' not found on PATH."
    }
}

function Assert-CopilotAuth {
    param([string]$CopilotOutputText)
    if ($CopilotOutputText -match 'No authentication information found|Failed to log in to github\.com|run the ''/login'' command|not logged in') {
        throw "copilot is not authenticated. Run 'copilot' then use the /login slash command."
    }
}

function Invoke-WithSanitizedClaudeCodeEnv {
    param(
        [Parameter(Mandatory)]
        [scriptblock]$Action
    )

    $hadClaudeCode = Test-Path Env:CLAUDECODE
    $claudeCodeValue = $null
    if ($hadClaudeCode) {
        $claudeCodeValue = $env:CLAUDECODE
    }

    Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
    try {
        return & $Action
    }
    finally {
        if ($hadClaudeCode) {
            $env:CLAUDECODE = $claudeCodeValue
        } else {
            Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
        }
    }
}

$script:ghBlockDir = $null

function Setup-GhBlock {
    if ($script:ghBlockDir -and (Test-Path $script:ghBlockDir)) {
        return $script:ghBlockDir
    }
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) "aloop-ghblock-$PID"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    # Create gh shim that blocks execution
    $shimContent = @'
@echo off
echo gh: blocked by aloop PATH hardening 1>&2
exit /b 127
'@
    Set-Content -Path (Join-Path $dir 'gh.cmd') -Value $shimContent -NoNewline
    Set-Content -Path (Join-Path $dir 'gh.bat') -Value $shimContent -NoNewline
    # Also create a bash-style shim for MSYS/Git Bash environments
    $bashShim = "#!/bin/sh`necho `"gh: blocked by aloop PATH hardening`" >&2`nexit 127"
    Set-Content -Path (Join-Path $dir 'gh') -Value $bashShim -NoNewline
    Set-Content -Path (Join-Path $dir 'gh.exe') -Value $bashShim -NoNewline
    $script:ghBlockDir = $dir
    return $dir
}

function Cleanup-GhBlock {
    if ($script:ghBlockDir -and (Test-Path $script:ghBlockDir -ErrorAction SilentlyContinue)) {
        Remove-Item -Recurse -Force $script:ghBlockDir -ErrorAction SilentlyContinue
        $script:ghBlockDir = $null
    }
}

function Invoke-ProviderProcess {
    param(
        [string]$Command,
        [string]$Arguments,
        [string]$StdinContent
    )

    if ($script:useDevcontainer) {
        $cmdPath = (Get-Command 'devcontainer' -ErrorAction Stop).Source
        $dcArgs = "exec --workspace-folder `"$WorkDir`" -- $Command $Arguments"
    } else {
        $cmdPath = (Get-Command $Command -ErrorAction Stop).Source
        $dcArgs = $Arguments
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $cmdPath
    $psi.Arguments = $dcArgs
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardInput = ($null -ne $StdinContent)
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = (Get-Location).Path

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $proc.Start() | Out-Null
    $script:activeProviderProcess = $proc

    try {
        if ($null -ne $StdinContent) {
            $proc.StandardInput.Write($StdinContent)
            $proc.StandardInput.Close()
        }

        # Read output asynchronously to avoid deadlocks
        $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
        $stderrTask = $proc.StandardError.ReadToEndAsync()

        $timeoutMs = $ProviderTimeoutSec * 1000
        $exited = $proc.WaitForExit($timeoutMs)
        if (-not $exited) {
            Stop-ActiveProvider
            throw "Provider '$Command' timed out after $ProviderTimeoutSec seconds"
        }
        # Ensure async reads have flushed
        $proc.WaitForExit()

        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        $exitCode = $proc.ExitCode
        $script:activeProviderProcess = $null

        # Display buffered provider output
        if ($stdout) { Write-Host $stdout }

        return @{
            ExitCode = $exitCode
            Output   = $stdout
            Error    = $stderr
        }
    }
    finally {
        if ($null -ne $proc) { $proc.Dispose() }
    }
}

function Invoke-Provider {
    param(
        [string]$ProviderName,
        [string]$PromptContent,
        [string]$ModelOverride = ''
    )

    # PATH hardening: prepend gh-blocking shim directory so gh resolves to a
    # non-functional wrapper while provider binaries in the same directories
    # remain reachable.
    $ghBlockDir = Setup-GhBlock
    $savedPath = $env:PATH
    $env:PATH = "$ghBlockDir$([System.IO.Path]::PathSeparator)$env:PATH"

    # Sanitize CLAUDECODE env before spawning child process (inherits env)
    $hadClaudeCode = Test-Path Env:CLAUDECODE
    $claudeCodeValue = $null
    if ($hadClaudeCode) { $claudeCodeValue = $env:CLAUDECODE }
    Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue

    # Provenance: export for prepare-commit-msg hook
    $env:ALOOP_AGENT = if ($script:frontmatter -and $script:frontmatter.agent) { [string]$script:frontmatter.agent } else { 'unknown' }
    $env:ALOOP_ITERATION = if ($script:iteration) { "$script:iteration" } else { '0' }
    $env:ALOOP_SESSION = $sessionId

    try {
        $result = $null
        switch ($ProviderName) {
            'claude' {
                $selectedModel = if ([string]::IsNullOrWhiteSpace($ModelOverride)) { $ClaudeModel } else { $ModelOverride }
                $result = Invoke-ProviderProcess -Command 'claude' `
                    -Arguments "--model $selectedModel --dangerously-skip-permissions --print" `
                    -StdinContent $PromptContent
                if ($result.ExitCode -ne 0) {
                    $script:lastProviderOutputText = $result.Output
                    throw "claude exited with code $($result.ExitCode)`nStderr: $($result.Error)"
                }
            }
            'opencode' {
                $opencodeArgs = "run"
                if (-not [string]::IsNullOrWhiteSpace($ModelOverride)) {
                    $opencodeArgs = "run -m $ModelOverride"
                }
                $result = Invoke-ProviderProcess -Command 'opencode' `
                    -Arguments $opencodeArgs `
                    -StdinContent $PromptContent
                if ($result.ExitCode -ne 0) {
                    $script:lastProviderOutputText = $result.Output
                    throw "opencode exited with code $($result.ExitCode)`nStderr: $($result.Error)"
                }
            }
            'codex' {
                $selectedModel = if ([string]::IsNullOrWhiteSpace($ModelOverride)) { $CodexModel } else { $ModelOverride }
                $result = Invoke-ProviderProcess -Command 'codex' `
                    -Arguments "exec -m $selectedModel --dangerously-bypass-approvals-and-sandbox -" `
                    -StdinContent $PromptContent
                if ($result.ExitCode -ne 0) {
                    $script:lastProviderOutputText = $result.Output
                    throw "codex exited with code $($result.ExitCode)`nStderr: $($result.Error)"
                }
            }
            'gemini' {
                $selectedModel = if ([string]::IsNullOrWhiteSpace($ModelOverride)) { $GeminiModel } else { $ModelOverride }
                $result = Invoke-ProviderProcess -Command 'gemini' `
                    -Arguments "-m $selectedModel --yolo" `
                    -StdinContent $PromptContent
                if ($result.ExitCode -ne 0) {
                    Write-Warning "Gemini -m $selectedModel failed (exit $($result.ExitCode)). Retrying without explicit model."
                    $result = Invoke-ProviderProcess -Command 'gemini' `
                        -Arguments "--yolo" `
                        -StdinContent $PromptContent
                    if ($result.ExitCode -ne 0) {
                        $script:lastProviderOutputText = $result.Output
                        throw "gemini exited with code $($result.ExitCode)`nStderr: $($result.Error)"
                    }
                }
            }
            'copilot' {
                $selectedModel = if ([string]::IsNullOrWhiteSpace($ModelOverride)) { $CopilotModel } else { $ModelOverride }
                $result = Invoke-ProviderProcess -Command 'copilot' `
                    -Arguments "--model $selectedModel --yolo" `
                    -StdinContent $PromptContent
                $outputText = $result.Output
                if ($result.ExitCode -ne 0) {
                    Write-Warning "Copilot --model $selectedModel failed (exit $($result.ExitCode)). Retrying with --model $CopilotRetryModel."
                    $result = Invoke-ProviderProcess -Command 'copilot' `
                        -Arguments "--model $CopilotRetryModel --yolo" `
                        -StdinContent $PromptContent
                    $outputText = $result.Output
                    if ($result.ExitCode -ne 0) {
                        Write-Warning "Copilot --model $CopilotRetryModel failed (exit $($result.ExitCode)). Retrying without explicit model."
                        $result = Invoke-ProviderProcess -Command 'copilot' `
                            -Arguments "--yolo" `
                            -StdinContent $PromptContent
                        $outputText = $result.Output
                    }
                    if ($result.ExitCode -ne 0) {
                        $script:lastProviderOutputText = $outputText
                        throw "copilot exited with code $($result.ExitCode)`nStderr: $($result.Error)"
                    }
                }
                Assert-CopilotAuth -CopilotOutputText $outputText
            }
            default {
                throw "Unsupported provider '$ProviderName'"
            }
        }

        $script:lastProviderOutputText = $null
        # Return output as array of lines for Show-AgentSummary compatibility
        return ($result.Output -split "`n")

    } finally {
        # Restore original PATH after provider execution
        $env:PATH = $savedPath
        # Restore CLAUDECODE env
        if ($hadClaudeCode) {
            $env:CLAUDECODE = $claudeCodeValue
        } else {
            Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
        }
    }
}

function Show-AgentSummary {
    param(
        [string]$ProviderName,
        [object[]]$ProviderOutput
    )

    if (-not $ProviderOutput -or $ProviderOutput.Count -eq 0) { return }

    $rawLines = @()
    foreach ($item in $ProviderOutput) {
        if ($null -eq $item) { continue }
        $line = ($item | Out-String).TrimEnd()
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        # Strip ANSI escape sequences
        $line = [regex]::Replace($line, '\x1B\[[0-9;]*[A-Za-z]', '')
        $rawLines += $line
    }

    if ($rawLines.Count -eq 0) { return }

    $noisePatterns = @(
        '^YOLO mode is enabled\.',
        '^Loaded cached credentials\.$',
        '^WARNING: proceeding, even though we could not update PATH',
        '^OpenAI Codex v',
        '^[-]{3,}$',
        '^workdir:',
        '^model:',
        '^provider:',
        '^approval:',
        '^sandbox:',
        '^reasoning effort:',
        '^reasoning summaries:',
        '^session id:',
        '^mcp startup:',
        '^Reading prompt from stdin\.\.\.$',
        '^Reconnecting\.\.\.',
        '^\d{4}-\d{2}-\d{2}T.*\s(ERROR|WARN)\s'
    )

    $summaryLines = @()
    foreach ($line in $rawLines) {
        $isNoise = $false
        foreach ($pattern in $noisePatterns) {
            if ($line -match $pattern) { $isNoise = $true; break }
        }
        if (-not $isNoise) { $summaryLines += $line }
    }

    if ($summaryLines.Count -eq 0) { $summaryLines = $rawLines }

    $maxLines = 8
    if ($summaryLines.Count -gt $maxLines) {
        $summaryLines = $summaryLines[($summaryLines.Count - $maxLines)..($summaryLines.Count - 1)]
    }

    Write-Host "`n[Agent summary - $ProviderName]" -ForegroundColor Cyan
    foreach ($line in $summaryLines) {
        Write-Host "  $line" -ForegroundColor Gray
    }
}

# ============================================================================
# PLAN FILE HELPERS
# ============================================================================

$planFile = Join-Path $WorkDir "TODO.md"
$reviewVerdictFile = Join-Path $SessionDir "review-verdict.json"

function Get-PlanLines {
    if (-not (Test-Path $planFile)) { return @() }
    return Get-Content -Path $planFile
}

function Check-AllTasksComplete {
    $lines = Get-PlanLines
    if ($lines.Count -eq 0) { return $false }
    $incomplete = ($lines | Where-Object { $_ -match '^\s*-\s+\[ \]' }).Count
    if ($incomplete -eq 0) {
        $completed = ($lines | Where-Object { $_ -match '^\s*-\s+\[x\]' }).Count
        return ($completed -gt 0)
    }
    return $false
}

function Get-CurrentTask {
    $lines = Get-PlanLines
    $line = $lines | Where-Object { $_ -match '^\s*-\s+\[ \]' } | Select-Object -First 1
    if (-not $line) { return "" }
    return ($line -replace '^\s*-\s+\[ \]\s*', '')
}

function Reset-ReviewVerdict {
    if (Test-Path $reviewVerdictFile) {
        Remove-Item -Path $reviewVerdictFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-ReviewVerdict {
    param([int]$ExpectedIteration)

    if (-not (Test-Path $reviewVerdictFile)) {
        Write-Warning "Review verdict file missing: $reviewVerdictFile"
        Write-LogEntry -Event "review_verdict_missing" -Data @{
            iteration = $ExpectedIteration
            path = $reviewVerdictFile
        }
        return $null
    }

    $payload = $null
    try {
        $payload = Get-Content -Path $reviewVerdictFile -Raw | ConvertFrom-Json
    }
    catch {
        Write-Warning "Review verdict file is not valid JSON: $reviewVerdictFile"
        Write-LogEntry -Event "review_verdict_invalid" -Data @{
            iteration = $ExpectedIteration
            path = $reviewVerdictFile
            reason = 'invalid_json'
        }
        return $null
    }

    $verdict = [string]$payload.verdict
    $verdict = $verdict.Trim().ToUpperInvariant()
    if ($verdict -notin @('PASS', 'FAIL')) {
        Write-Warning "Review verdict file has invalid verdict value: $reviewVerdictFile"
        Write-LogEntry -Event "review_verdict_invalid" -Data @{
            iteration = $ExpectedIteration
            path = $reviewVerdictFile
            reason = 'invalid_verdict'
        }
        return $null
    }

    $parsedIteration = -1
    if (-not [int]::TryParse([string]$payload.iteration, [ref]$parsedIteration) -or $parsedIteration -ne $ExpectedIteration) {
        Write-Warning "Review verdict file has invalid or stale iteration value: $reviewVerdictFile"
        Write-LogEntry -Event "review_verdict_invalid" -Data @{
            iteration = $ExpectedIteration
            path = $reviewVerdictFile
            reason = 'invalid_iteration'
            file_iteration = [string]$payload.iteration
        }
        return $null
    }

    Write-LogEntry -Event "review_verdict_read" -Data @{
        iteration = $ExpectedIteration
        path = $reviewVerdictFile
        verdict = $verdict
    }
    return $verdict
}

# ============================================================================
# STUCK DETECTION
# ============================================================================

$stuckState = @{ LastTask = ""; StuckCount = 0 }
$script:allTasksMarkedDone = $false
$script:lastProofIteration = 0
$script:lastProviderOutputText = $null
$script:cyclePosition = 0
$script:cycleLength = 0
$script:resolvedPromptName = $null
$script:lastModeWasForced = $false
$script:hasBuildsSinceLastPlan = $false
$script:frontmatter = @{ provider = ''; model = ''; agent = ''; reasoning = '' }
$script:phaseRetryState = @{
    phase = ''
    consecutive = 0
    failureReasons = @()
}
$script:maxPhaseRetries = if ($Provider -eq 'round-robin') { [Math]::Max(2, $RoundRobinProviders.Count * 2) } else { 2 }

function Update-ProofBaselines {
    param([int]$ProofIteration)
    if ($ProofIteration -le 0) { return }

    $iterDir = Join-Path $SessionDir "artifacts\iter-$ProofIteration"
    $manifestPath = Join-Path $iterDir "proof-manifest.json"
    if (-not (Test-Path $manifestPath)) { return }

    $baselineDir = Join-Path $SessionDir "artifacts\baselines"
    if (-not (Test-Path $baselineDir)) {
        New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null
    }

    # Copy all artifacts (except manifest) to baselines directory
    Copy-Item -Path "$iterDir\*" -Destination $baselineDir -Force -Exclude "proof-manifest.json"
    Write-Host "Updated proof baselines from iteration $ProofIteration" -ForegroundColor Cyan
    Write-LogEntry -Event "baselines_updated" -Data @{ iteration = $ProofIteration }
}

function Advance-CyclePosition {
    if ($script:cycleLength -gt 0) {
        $script:cyclePosition = ($script:cyclePosition + 1) % $script:cycleLength
    } elseif ($Mode -eq 'plan-build') {
        $script:cyclePosition = ($script:cyclePosition + 1) % 2
    } elseif ($Mode -eq 'plan-build-review') {
        $script:cyclePosition = ($script:cyclePosition + 1) % 6
    }
}

function Register-IterationSuccess {
    param(
        [string]$IterationMode,
        [bool]$WasForced
    )
    if ($IterationMode -eq 'plan') {
        $script:hasBuildsSinceLastPlan = $false
    } elseif ($IterationMode -eq 'build') {
        $script:hasBuildsSinceLastPlan = $true
    }

    $script:phaseRetryState.phase = ''
    $script:phaseRetryState.consecutive = 0
    $script:phaseRetryState.failureReasons = @()

    if (($Mode -in @('plan-build', 'plan-build-review')) -and -not $WasForced -and ($IterationMode -in @('plan', 'build', 'proof', 'review'))) {
        Advance-CyclePosition
    }
}

function Register-IterationFailure {
    param(
        [string]$IterationMode,
        [string]$ErrorText
    )
    if (-not ($Mode -in @('plan-build', 'plan-build-review'))) { return }
    if (-not ($IterationMode -in @('plan', 'build', 'proof', 'review'))) { return }

    if ($script:phaseRetryState.phase -eq $IterationMode) {
        $script:phaseRetryState.consecutive++
    } else {
        $script:phaseRetryState.phase = $IterationMode
        $script:phaseRetryState.consecutive = 1
        $script:phaseRetryState.failureReasons = @()
    }

    $script:phaseRetryState.failureReasons += [string]$ErrorText
    if ($script:phaseRetryState.failureReasons.Count -gt $script:maxPhaseRetries) {
        $script:phaseRetryState.failureReasons = @($script:phaseRetryState.failureReasons | Select-Object -Last $script:maxPhaseRetries)
    }

    if ($script:phaseRetryState.consecutive -ge $script:maxPhaseRetries) {
        Write-Warning "Phase '$IterationMode' failed $($script:phaseRetryState.consecutive) times; advancing cycle position."
        Write-LogEntry -Event "phase_retry_exhausted" -Data @{
            phase = $IterationMode
            consecutive_failures = $script:phaseRetryState.consecutive
            max_phase_retries = $script:maxPhaseRetries
            failure_reasons = @($script:phaseRetryState.failureReasons)
        }
        Advance-CyclePosition
        $script:phaseRetryState.phase = ''
        $script:phaseRetryState.consecutive = 0
        $script:phaseRetryState.failureReasons = @()
    }
}

function Check-PhasePrerequisite {
    param([string]$RequestedPhase)

    if ($RequestedPhase -eq 'build') {
        $lines = Get-PlanLines
        $unchecked = ($lines | Where-Object { $_ -match '^\s*-\s+\[ \]' }).Count
        $completed = ($lines | Where-Object { $_ -match '^\s*-\s+\[x\]' }).Count
        if ($unchecked -eq 0) {
            if ($Mode -eq 'plan-build-review' -and $completed -gt 0) {
                return 'build'
            }
            Write-Warning "No unchecked tasks in TODO.md; forcing plan phase."
            Write-LogEntry -Event "phase_prerequisite_miss" -Data @{
                requested = 'build'
                actual = 'plan'
                reason = 'no_tasks'
            }
            return 'plan'
        }
    }

    if ($RequestedPhase -eq 'review') {
        if (-not $script:hasBuildsSinceLastPlan) {
            Write-Warning "No successful builds since last plan; forcing build phase."
            Write-LogEntry -Event "phase_prerequisite_miss" -Data @{
                requested = 'review'
                actual = 'build'
                reason = 'no_builds'
            }
            return 'build'
        }
    }

    return $RequestedPhase
}

function Skip-StuckTask {
    param([string]$task)
    Write-Host ""
    Write-Host "STUCK: Failed $MaxStuck times on: $task" -ForegroundColor Red
    Write-Host "Marking as blocked and moving on..." -ForegroundColor Yellow

    $lines = Get-PlanLines
    if (-not ($lines | Where-Object { $_ -match '^## Blocked$' })) {
        $lines += ""
        $lines += "## Blocked"
        $lines += ""
    }
    $lines += "- $task (stuck after $MaxStuck attempts)"

    $pattern = "^\s*-\s+\[ \]\s*" + [regex]::Escape($task) + "\s*$"
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) {
            $lines[$i] = ($lines[$i] -replace '^\s*-\s+\[ \]\s*', '- [S] ')
            break
        }
    }

    Set-Content -Encoding utf8 $planFile $lines
}

# ============================================================================
# SESSION STATE
# ============================================================================

$statusFile = Join-Path $SessionDir "status.json"
$logFile = Join-Path $SessionDir "log.jsonl"
$reportFile = Join-Path $SessionDir "report.md"
$startTime = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
$runId = [guid]::NewGuid().ToString()

# Runtime version: read version.json written by install.ps1
$runtimeVersionDir = if ($env:ALOOP_RUNTIME_DIR) { $env:ALOOP_RUNTIME_DIR } else { Join-Path $HOME '.aloop' }
$runtimeVersionFile = Join-Path $runtimeVersionDir 'version.json'
$runtimeVersion = @{ commit = ''; installed_at = '' }
if (Test-Path $runtimeVersionFile) {
    try {
        $parsed = Get-Content $runtimeVersionFile -Raw | ConvertFrom-Json
        if ($parsed.commit) { $runtimeVersion.commit = $parsed.commit }
        if ($parsed.installed_at) { $runtimeVersion.installed_at = $parsed.installed_at }
    } catch { }
}

$dashboardProcess = $null
$dashboardUrl = $null

function Get-AvailableDashboardPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ($listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Start-DashboardProcess {
    if ($env:ALOOP_NO_DASHBOARD -eq '1') { return }
    $runtimeDir = if ($env:ALOOP_RUNTIME_DIR) { $env:ALOOP_RUNTIME_DIR } else { Join-Path $HOME '.aloop' }
    $cliEntrypoint = Join-Path $runtimeDir 'cli\aloop.mjs'
    if (-not (Test-Path $cliEntrypoint)) {
        Write-Warning "Dashboard CLI not found at $cliEntrypoint. Continuing without dashboard."
        return
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Warning "node is not available on PATH. Continuing without dashboard."
        return
    }

    try {
        $dashboardPort = Get-AvailableDashboardPort
    } catch {
        Write-Warning "Failed to reserve dashboard port: $_"
        return
    }

    $stdoutLog = Join-Path $SessionDir 'dashboard.stdout.log'
    $stderrLog = Join-Path $SessionDir 'dashboard.stderr.log'
    $dashboardProcess = Start-Process -FilePath 'node' -ArgumentList @($cliEntrypoint, 'dashboard', '--port', "$dashboardPort", '--session-dir', $SessionDir, '--workdir', $WorkDir) -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
    Start-Sleep -Seconds 1
    if ($dashboardProcess.HasExited) {
        Write-Warning "Dashboard exited early. Check $stderrLog for details."
        $dashboardProcess = $null
        return
    }

    $dashboardUrl = "http://127.0.0.1:$dashboardPort"
    Write-Host "Dashboard URL: $dashboardUrl" -ForegroundColor Cyan
}

function Stop-DashboardProcess {
    if ($null -eq $dashboardProcess) { return }
    try {
        if (-not $dashboardProcess.HasExited) {
            Stop-Process -Id $dashboardProcess.Id -ErrorAction Stop
            try { $dashboardProcess.WaitForExit(5000) | Out-Null } catch { }
        }
    } catch {
        Write-Warning "Failed to stop dashboard process $($dashboardProcess.Id): $_"
    } finally {
        $dashboardProcess = $null
    }
}

function Write-Status {
    param(
        [int]$Iteration,
        [string]$Phase,
        [string]$CurrentProvider,
        [int]$StuckCount,
        [string]$State = 'running'
    )
    @{
        iteration = $Iteration
        phase = $Phase
        provider = $CurrentProvider
        stuck_count = $StuckCount
        state = $State
        updated_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    } | ConvertTo-Json -Compress | Set-Content -Encoding utf8 $statusFile
}

function Write-LogEntry {
    param(
        [string]$Event,
        [hashtable]$Data = @{}
    )
    $entry = @{
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        event = $Event
        run_id = $runId
    } + $Data
    ($entry | ConvertTo-Json -Compress) | Add-Content -Encoding utf8 $logFile
}

# ============================================================================
# PROVIDER HEALTH PRIMITIVES
# ============================================================================

$providerHealthDir = if ($env:ALOOP_HEALTH_DIR) { $env:ALOOP_HEALTH_DIR } else { Join-Path (Join-Path $HOME '.aloop') 'health' }
$healthLockRetryDelaysMs = @(50, 100, 150, 200, 250)

function Ensure-ProviderHealthDir {
    if (-not (Test-Path $providerHealthDir)) {
        New-Item -ItemType Directory -Path $providerHealthDir -Force | Out-Null
    }
}

function Get-ProviderHealthPath {
    param([string]$ProviderName)
    Ensure-ProviderHealthDir
    $providerId = $ProviderName.ToLowerInvariant()
    return Join-Path $providerHealthDir "$providerId.json"
}

function New-ProviderHealthState {
    return @{
        status = 'healthy'
        last_success = $null
        last_failure = $null
        failure_reason = $null
        consecutive_failures = 0
        cooldown_until = $null
    }
}

function Open-ProviderHealthStreamWithRetry {
    param(
        [string]$Path,
        [System.IO.FileMode]$FileMode,
        [System.IO.FileAccess]$FileAccess,
        [System.IO.FileShare]$FileShare,
        [string]$ProviderName,
        [string]$OperationName
    )

    for ($i = 0; $i -lt $healthLockRetryDelaysMs.Count; $i++) {
        try {
            return [System.IO.File]::Open($Path, $FileMode, $FileAccess, $FileShare)
        }
        catch [System.IO.IOException] {
            if ($i -eq ($healthLockRetryDelaysMs.Count - 1)) {
                Write-LogEntry -Event "health_lock_failed" -Data @{
                    provider = $ProviderName
                    operation = $OperationName
                    path = $Path
                    retries = $healthLockRetryDelaysMs.Count
                }
                return $null
            }
            Start-Sleep -Milliseconds $healthLockRetryDelaysMs[$i]
        }
    }
    return $null
}

function Get-ProviderHealthState {
    param([string]$ProviderName)

    $path = Get-ProviderHealthPath -ProviderName $ProviderName
    if (-not (Test-Path $path)) {
        return New-ProviderHealthState
    }

    $stream = Open-ProviderHealthStreamWithRetry -Path $path -FileMode ([System.IO.FileMode]::Open) -FileAccess ([System.IO.FileAccess]::Read) -FileShare ([System.IO.FileShare]::Read) -ProviderName $ProviderName -OperationName 'read'
    if ($null -eq $stream) { return $null }

    try {
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8, $true, 1024, $true)
        try {
            $raw = $reader.ReadToEnd()
        }
        finally {
            $reader.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }

    if ([string]::IsNullOrWhiteSpace($raw)) {
        return New-ProviderHealthState
    }

    try {
        $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        return New-ProviderHealthState
    }

    $state = New-ProviderHealthState
    if ($parsed.PSObject.Properties.Name -contains 'status') { $state.status = [string]$parsed.status }
    if ($parsed.PSObject.Properties.Name -contains 'last_success') { $state.last_success = $parsed.last_success }
    if ($parsed.PSObject.Properties.Name -contains 'last_failure') { $state.last_failure = $parsed.last_failure }
    if ($parsed.PSObject.Properties.Name -contains 'failure_reason') { $state.failure_reason = $parsed.failure_reason }
    if ($parsed.PSObject.Properties.Name -contains 'consecutive_failures') { $state.consecutive_failures = [int]$parsed.consecutive_failures }
    if ($parsed.PSObject.Properties.Name -contains 'cooldown_until') {
        $cu = $parsed.cooldown_until
        # ConvertFrom-Json may auto-convert ISO 8601 strings to DateTime objects; normalise back to ISO string
        if ($cu -is [datetime]) {
            $state.cooldown_until = [DateTimeOffset]::new($cu.ToUniversalTime(), [TimeSpan]::Zero).ToString('o')
        } else {
            $state.cooldown_until = [string]$cu
        }
    }
    return $state
}

function Set-ProviderHealthState {
    param(
        [string]$ProviderName,
        [hashtable]$HealthState
    )

    $path = Get-ProviderHealthPath -ProviderName $ProviderName
    $stream = Open-ProviderHealthStreamWithRetry -Path $path -FileMode ([System.IO.FileMode]::OpenOrCreate) -FileAccess ([System.IO.FileAccess]::ReadWrite) -FileShare ([System.IO.FileShare]::None) -ProviderName $ProviderName -OperationName 'write'
    if ($null -eq $stream) { return $false }

    try {
        $json = $HealthState | ConvertTo-Json -Compress
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($json)
        $stream.SetLength(0)
        $stream.Position = 0
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush()
    }
    finally {
        $stream.Dispose()
    }

    return $true
}

function Get-ProviderCooldownSeconds {
    param([int]$ConsecutiveFailures)
    switch ($ConsecutiveFailures) {
        1       { return 0 }
        2       { return 120 }
        3       { return 300 }
        4       { return 900 }
        5       { return 1800 }
        default { return 3600 }
    }
}

function Classify-ProviderFailure {
    param([string]$ErrorText)
    $lower = $ErrorText.ToLowerInvariant()
    if ($lower -match '429|rate.limit|too many requests') { return 'rate_limit' }
    if ($lower -match 'cannot launch inside another session') { return 'concurrent_cap' }
    if ($lower -match 'auth|unauthorized|invalid.*(token|key)|expired.*(token|key)|(token|key).*expired') { return 'auth' }
    if ($lower -match 'timeout|connection.*refused|network') { return 'timeout' }
    return 'unknown'
}

function Update-ProviderHealthOnSuccess {
    param([string]$ProviderName)
    $current = Get-ProviderHealthState -ProviderName $ProviderName
    if ($null -eq $current) { return }
    $wasUnhealthy = ($current.status -ne 'healthy')
    $state = New-ProviderHealthState
    $state.last_success = [DateTimeOffset]::UtcNow.ToString('o')
    $state.last_failure = $current.last_failure
    $state.failure_reason = $current.failure_reason
    Set-ProviderHealthState -ProviderName $ProviderName -HealthState $state | Out-Null
    if ($wasUnhealthy) {
        Write-LogEntry -Event 'provider_recovered' -Data @{
            provider         = $ProviderName
            previous_status  = $current.status
        }
    }
}

function Update-ProviderHealthOnFailure {
    param([string]$ProviderName, [string]$ErrorText)
    $current = Get-ProviderHealthState -ProviderName $ProviderName
    if ($null -eq $current) { return }
    $reason   = Classify-ProviderFailure -ErrorText $ErrorText
    $failures = $current.consecutive_failures + 1
    $now      = [DateTimeOffset]::UtcNow

    if ($reason -eq 'auth') {
        $newStatus     = 'degraded'
        $cooldownUntil = $null
    } else {
        $cooldownSecs = if ($reason -eq 'concurrent_cap') { 120 } else { Get-ProviderCooldownSeconds -ConsecutiveFailures $failures }
        if ($cooldownSecs -gt 0) {
            $newStatus     = 'cooldown'
            $cooldownUntil = $now.AddSeconds($cooldownSecs).ToString('o')
        } else {
            $newStatus     = $current.status
            $cooldownUntil = $null
        }
    }

    $state = @{
        status               = $newStatus
        last_success         = $current.last_success
        last_failure         = $now.ToString('o')
        failure_reason       = $reason
        consecutive_failures = $failures
        cooldown_until       = $cooldownUntil
    }
    Set-ProviderHealthState -ProviderName $ProviderName -HealthState $state | Out-Null

    if ($newStatus -eq 'degraded') {
        Write-LogEntry -Event 'provider_degraded' -Data @{
            provider             = $ProviderName
            reason               = $reason
            consecutive_failures = $failures
        }
    } elseif ($newStatus -eq 'cooldown') {
        Write-LogEntry -Event 'provider_cooldown' -Data @{
            provider             = $ProviderName
            reason               = $reason
            consecutive_failures = $failures
            cooldown_until       = $cooldownUntil
        }
    }
}

function Resolve-HealthyProvider {
    param([int]$StartIndex)
    # Returns the name of the first available provider starting from StartIndex,
    # sleeping (with all_providers_unavailable log) if all are in cooldown/degraded.
    $count = $RoundRobinProviders.Count
    while ($true) {
        $earliestCooldown = $null
        $available = $null
        $degradedCount = 0
        $allDegradedReasons = @()

        for ($i = 0; $i -lt $count; $i++) {
            $idx = ($StartIndex + $i) % $count
            $p   = $RoundRobinProviders[$idx]
            $health = Get-ProviderHealthState -ProviderName $p
            if ($null -eq $health) {
                # Lock failure → treat as healthy (degrade gracefully)
                $available = $p
                break
            }
            if ($health.status -eq 'healthy') {
                $available = $p
                break
            }
            if ($health.status -eq 'degraded') {
                $degradedCount++
                $degradedReason = if ([string]::IsNullOrWhiteSpace($health.failure_reason)) { 'unknown' } else { $health.failure_reason }
                $allDegradedReasons += ("{0}:{1}" -f $p, $degradedReason)
                Write-LogEntry -Event 'provider_skipped_degraded' -Data @{
                    provider = $p
                    reason   = $degradedReason
                }
                continue
            }
            if ($health.status -eq 'cooldown' -and $health.cooldown_until) {
                try {
                    $cooldownTime = [DateTimeOffset]::Parse($health.cooldown_until)
                    if ([DateTimeOffset]::UtcNow -ge $cooldownTime) {
                        $available = $p
                        break
                    }
                    if ($null -eq $earliestCooldown -or $cooldownTime -lt $earliestCooldown) {
                        $earliestCooldown = $cooldownTime
                    }
                } catch {
                    $available = $p
                    break
                }
            }
            # degraded or cooldown still active: skip
        }

        if ($null -ne $available) {
            return $available
        }

        # All providers unavailable — sleep until earliest cooldown expires
        $sleepSecs = 60
        $providersCsv = ($RoundRobinProviders -join ',')
        if ($degradedCount -eq $count) {
            Write-LogEntry -Event 'all_providers_degraded' -Data @{
                providers = $providersCsv
                reasons   = ($allDegradedReasons -join ',')
            }
            Write-Warning "All providers are degraded. Fix auth/quota issues (for example, rerun provider login) and retry."
        }
        if ($null -ne $earliestCooldown) {
            $remaining = ($earliestCooldown - [DateTimeOffset]::UtcNow).TotalSeconds
            $sleepSecs = if ($remaining -gt 1) { [Math]::Ceiling($remaining) } else { 1 }
        }
        Write-LogEntry -Event 'all_providers_unavailable' -Data @{
            providers     = $providersCsv
            sleep_seconds = $sleepSecs
        }
        Write-Warning "All providers unavailable. Sleeping ${sleepSecs}s until cooldown expires..."
        Start-Sleep -Seconds $sleepSecs
    }
}

# ============================================================================
# PROVENANCE COMMIT TRAILERS
# ============================================================================

function Setup-ProvenanceHook {
    $hooksDir = Join-Path $WorkDir '.git' 'hooks'
    if (-not (Test-Path (Join-Path $WorkDir '.git'))) {
        return
    }
    if (-not (Test-Path $hooksDir)) {
        New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
    }
    $hookPath = Join-Path $hooksDir 'prepare-commit-msg'
    $hookContent = @'
#!/bin/sh
# Aloop provenance trailer hook — appends agent/iteration/session trailers.
COMMIT_MSG_FILE="$1"
if [ -z "$ALOOP_AGENT" ] || [ -z "$ALOOP_ITERATION" ] || [ -z "$ALOOP_SESSION" ]; then
    exit 0
fi
if grep -q "^Aloop-Session:" "$COMMIT_MSG_FILE" 2>/dev/null; then
    exit 0
fi
{
    echo ""
    echo "Aloop-Agent: $ALOOP_AGENT"
    echo "Aloop-Iteration: $ALOOP_ITERATION"
    echo "Aloop-Session: $ALOOP_SESSION"
} >> "$COMMIT_MSG_FILE"
'@
    # Use ASCII encoding to avoid BOM; line endings handled by git on checkout
    [System.IO.File]::WriteAllText($hookPath, $hookContent, [System.Text.Encoding]::ASCII)
    # Ensure executable bit (no-op on Windows, needed for Git Bash / WSL)
    try { & chmod +x $hookPath 2>$null } catch { }
}

# ============================================================================
# REMOTE BACKUP
# ============================================================================

function Setup-RemoteBackup {
    if (-not $BackupEnabled) {
        Write-Host "Remote backup: disabled"
        return $false
    }

    Push-Location $WorkDir
    try {
        if (-not (Test-Path ".git")) {
            Write-Host "Initializing git repository..."
            git init | Out-Null
            git add -A | Out-Null
            $trailerSession = if ([string]::IsNullOrWhiteSpace($sessionId)) { (Split-Path -Leaf $SessionDir) } else { $sessionId }
            try {
                git commit -m "Initial commit" `
                    -m "Aloop-Agent: harness" `
                    -m "Aloop-Iteration: 0" `
                    -m "Aloop-Session: $trailerSession" | Out-Null
            } catch { }
        }

        try {
            git remote get-url origin | Out-Null
            $existingRemoteUrl = (git remote get-url origin | Out-String).Trim()
            Write-Host ("Remote backup: " + (Convert-RemoteToWebUrl -RemoteUrl $existingRemoteUrl))
            return $true
        } catch { }

        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            Write-Warning "gh CLI not found. Remote backup disabled."
            return $false
        }

        try { gh auth status | Out-Null } catch {
            Write-Warning "gh CLI not authenticated. Remote backup disabled."
            return $false
        }

        $projectName = Split-Path -Leaf $WorkDir
        $repoName = "$projectName-aloop-backup"
        Write-Host "Creating private backup repo: $repoName"

        try {
            gh repo create $repoName --private --source=. --push | Out-Null
            $createdRemoteUrl = $null
            try {
                $createdRemoteUrl = (git remote get-url origin | Out-String).Trim()
            } catch { }
            if (-not [string]::IsNullOrWhiteSpace($createdRemoteUrl)) {
                Write-Host ("Remote backup: " + (Convert-RemoteToWebUrl -RemoteUrl $createdRemoteUrl))
            } else {
                $createdRepoWebUrl = $null
                try {
                    $createdRepoWebUrl = (gh repo view $repoName --json url -q .url | Out-String).Trim()
                } catch { }
                if (-not [string]::IsNullOrWhiteSpace($createdRepoWebUrl)) {
                    Write-Host "Remote backup: $createdRepoWebUrl"
                } else {
                    Write-Host "Remote backup: $repoName"
                }
            }
            return $true
        } catch {
            Write-Warning "Could not create backup repo. Remote backup disabled."
            return $false
        }
    }
    finally {
        Pop-Location
    }
}

function Convert-RemoteToWebUrl {
    param(
        [string]$RemoteUrl
    )
    if ([string]::IsNullOrWhiteSpace($RemoteUrl)) { return $RemoteUrl }

    $trimmed = $RemoteUrl.Trim()
    if ($trimmed -match '^git@([^:]+):(.+)$') {
        $path = ($Matches[2] -replace '\.git$', '')
        return "https://$($Matches[1])/$path"
    }
    if ($trimmed -match '^ssh://git@([^/]+)/(.+)$') {
        $path = ($Matches[2] -replace '\.git$', '')
        return "https://$($Matches[1])/$path"
    }
    if ($trimmed -match '^https?://') {
        return ($trimmed -replace '\.git$', '')
    }
    return $trimmed
}

function Push-ToBackup {
    if (-not $BackupEnabled) { return }
    Push-Location $WorkDir
    try {
        git push origin HEAD 2>&1 | Out-Null
        Write-Host "Pushed to remote backup"
    } catch {
        Write-Warning "Push to remote failed (continuing anyway)"
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# ITERATION SUMMARY
# ============================================================================

function Print-IterationSummary {
    param(
        [int]$IterationStart,
        [int]$Iteration
    )

    $iterationEnd = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
    $duration = $iterationEnd - $IterationStart
    $mins = [int]($duration / 60)
    $secs = $duration % 60

    Push-Location $WorkDir
    try {
        $lastCommit = ""
        $lastCommitTime = 0
        try { $lastCommit = git log -1 --format="%h %s" } catch { }
        try { $lastCommitTime = [int](git log -1 --format="%ct") } catch { }

        $commitMsg = ""
        if ($lastCommitTime -ge $IterationStart) { $commitMsg = $lastCommit }

        $newFiles = @()
        $modifiedFiles = @()
        if ($commitMsg) {
            try {
                $changes = git diff-tree --no-commit-id --name-status -r HEAD
                foreach ($line in $changes) {
                    if ($line -match '^A\s+(.*)$') { $newFiles += $Matches[1] }
                    if ($line -match '^M\s+(.*)$') { $modifiedFiles += $Matches[1] }
                }
            } catch { }
        }

        $lines = Get-PlanLines
        $completed = ($lines | Where-Object { $_ -match '^\s*-\s+\[x\]' }).Count
        $total = ($lines | Where-Object { $_ -match '^\s*-\s+\[' }).Count
        $pct = if ($total -gt 0) { [int]($completed * 100 / $total) } else { 0 }

        Write-Host ""
        Write-Host "=== Iteration $Iteration Complete (${mins}m ${secs}s) ===" -ForegroundColor Green
        if ($commitMsg) {
            Write-Host "Commit: $commitMsg"
            Write-Host ("Files: +" + $newFiles.Count + " new, ~" + $modifiedFiles.Count + " modified")
        } else {
            Write-Warning "No commit this iteration"
        }
        Write-Host ("Progress: $completed/$total tasks ($pct%)")
        Write-Host "============================================"
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# REPORT GENERATION
# ============================================================================

function Generate-Report {
    param(
        [string]$ExitReason,
        [int]$Iteration
    )

    $endTime = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
    $duration = $endTime - $startTime
    $minutes = [int]($duration / 60)
    $seconds = $duration % 60

    $lines = Get-PlanLines
    $completed = ($lines | Where-Object { $_ -match '^\s*-\s+\[x\]' }).Count
    $skipped = ($lines | Where-Object { $_ -match '^\s*-\s+\[S\]' }).Count
    $remaining = ($lines | Where-Object { $_ -match '^\s*-\s+\[ \]' }).Count
    $total = $completed + $skipped + $remaining

    Push-Location $WorkDir
    try {
        $commitCount = "0"
        $filesChanged = "0"
        $recentCommits = "No git history"
        if (Test-Path ".git") {
            try { $commitCount = git rev-list --count HEAD } catch { }
            try {
                $firstCommit = git rev-list --max-parents=0 HEAD
                if ($firstCommit) {
                    $filesChanged = (git diff --name-only $firstCommit HEAD | Measure-Object).Count
                }
            } catch { }
            try { $recentCommits = (git log --oneline -20) -join "`n" } catch { }
        }
    }
    finally {
        Pop-Location
    }

    @"
# Aloop Session Report

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

## Summary

| Metric | Value |
|--------|-------|
| Duration | ${minutes}m ${seconds}s |
| Iterations | $Iteration |
| Mode | $Mode |
| Provider | $Provider |
| Tasks Completed | $completed / $total |
| Tasks Skipped | $skipped |
| Tasks Remaining | $remaining |
| Commits | $commitCount |
| Files Changed | $filesChanged |

## Exit Reason

$ExitReason

## Completed Tasks

$( ($lines | Where-Object { $_ -match '^\s*-\s+\[x\]' }) -join "`n" )

$(if ($skipped -gt 0) { "## Skipped Tasks (stuck)`n`n" + (($lines | Where-Object { $_ -match '^\s*-\s+\[S\]' }) -join "`n") })

$(if ($remaining -gt 0) { "## Remaining Tasks`n`n" + (($lines | Where-Object { $_ -match '^\s*-\s+\[ \]' }) -join "`n") })

## Recent Commits

``````
$recentCommits
``````
"@ | Set-Content -Encoding utf8 $reportFile

    Write-Host ""
    Write-Host "Report saved to $reportFile" -ForegroundColor Cyan
}

# ============================================================================
# MAIN
# ============================================================================

$RoundRobinProviders = Normalize-ProviderList -RawProviders $RoundRobinProviders
if ($Provider -eq 'round-robin') {
    if ($RoundRobinProviders.Count -lt 2) {
        Write-Error "Round-robin mode requires at least two providers."
        exit 1
    }
    $supportedProviders = @('claude', 'opencode', 'codex', 'gemini', 'copilot')
    foreach ($p in $RoundRobinProviders) {
        if ($supportedProviders -notcontains $p) {
            Write-Error "Unsupported round-robin provider '$p'. Supported: $($supportedProviders -join ', ')"
            exit 1
        }
    }
}

Write-Host "`n=== Aloop Loop ===" -ForegroundColor Cyan
Write-Host "Mode: $Mode"
Write-Host "Provider: $Provider"
Write-Host "Work directory: $WorkDir"
Write-Host "Prompts directory: $PromptsDir"
Write-Host "Session directory: $SessionDir"
if ($Provider -eq 'round-robin') {
    Write-Host "Round robin order: $($RoundRobinProviders -join ', ')"
}
if ($Mode -eq 'plan-build') {
    Write-Host "Mode cycle: plan -> build -> plan -> build -> ..."
}
if ($Mode -eq 'plan-build-review') {
    Write-Host "Mode cycle: plan -> build -> build -> build -> proof -> review -> ..."
}
Write-Host "Max iterations: $MaxIterations"
Write-Host "Stuck threshold: $MaxStuck"
Write-Host ""

# Validate prompt files exist
$requiredPrompts = switch ($Mode) {
    'plan-build'        { @('plan', 'build') }
    'plan-build-review' { @('plan', 'build', 'proof', 'review') }
    default             { @($Mode) }
}
foreach ($p in $requiredPrompts) {
    $pFile = Join-Path $PromptsDir "PROMPT_$p.md"
    if (-not (Test-Path $pFile)) {
        Write-Error "Prompt file not found: $pFile"
        exit 1
    }
}

# Validate / filter providers
if (-not $DryRun) {
    if ($Provider -eq 'round-robin') {
        $available = @($RoundRobinProviders | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue })
        $missing   = @($RoundRobinProviders | Where-Object { $_ -notin $available })
        foreach ($p in $missing) {
            Write-Warning "round-robin: '$p' not found on PATH — skipping."
        }
        if ($available.Count -eq 0) {
            Write-Error "round-robin: no providers are installed. Install at least one of: $($RoundRobinProviders -join ', ')"
            exit 1
        }
        if ($available.Count -lt $RoundRobinProviders.Count) {
            Write-Host "round-robin will use: $($available -join ', ')" -ForegroundColor Yellow
        }
        $RoundRobinProviders = $available
    } else {
        Assert-ProviderInstalled -ProviderName $Provider
    }
}

# Setup remote backup
$backupResult = Setup-RemoteBackup
if (-not $backupResult) { $BackupEnabled = $false }
Start-DashboardProcess
Setup-ProvenanceHook

# Initialize session
Write-LogEntry -Event "session_start" -Data @{
    mode = $Mode
    provider = $Provider
    work_dir = $WorkDir
    max_iterations = $MaxIterations
    launch_mode = $LaunchMode
    runtime_commit = $runtimeVersion.commit
    runtime_installed_at = $runtimeVersion.installed_at
    devcontainer = $script:useDevcontainer
}

# Log container bypass if devcontainer exists but was skipped
if ($DangerouslySkipContainer -and (Test-Path $devcontainerJsonPath)) {
    Write-LogEntry -Event "container_bypass" -Data @{
        reason = "dangerously_skip_container_flag"
    }
}

# Re-read provider list from meta.json each iteration (supports hot-reload)
function Refresh-ProvidersFromMeta {
    $metaFile = Join-Path $SessionDir "meta.json"
    if (-not (Test-Path $metaFile)) { return }
    try {
        $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
        $newProviders = $meta.enabled_providers
        if (-not $newProviders) { $newProviders = $meta.round_robin_order }
        if (-not $newProviders -or $newProviders.Count -eq 0) { return }
        $oldCsv = $RoundRobinProviders -join ','
        $newCsv = $newProviders -join ','
        if ($oldCsv -ne $newCsv) {
            $available = @($newProviders | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue })
            if ($available.Count -gt 0) {
                $script:RoundRobinProviders = $available
                Write-LogEntry -Event "providers_refreshed" -Data @{
                    old = $oldCsv
                    new = ($available -join ',')
                }
            }
        }
    } catch {
        # Silently ignore parse errors — keep current provider list
    }
}

$iteration = 0

# ============================================================================
# LAUNCH MODE — start / restart / resume
# ============================================================================

if ($LaunchMode -eq 'resume') {
    $statusFile = Join-Path $SessionDir "status.json"
    if (Test-Path $statusFile) {
        try {
            $resumeStatus = Get-Content $statusFile -Raw | ConvertFrom-Json
            $resumeIteration = [int]$resumeStatus.iteration
            $resumePhase = [string]$resumeStatus.phase
            if ($resumeIteration -gt 0) {
                # Resume from the same iteration (re-try it since it may not have completed)
                $iteration = $resumeIteration - 1
                # Calculate cycle position from phase
                if ($Mode -eq 'plan-build-review') {
                    switch ($resumePhase) {
                        'plan'   { $script:cyclePosition = 0 }
                        'build'  { $script:cyclePosition = 1 }
                        'proof'  { $script:cyclePosition = 4 }
                        'review' { $script:cyclePosition = 5 }
                        default  { $script:cyclePosition = 0 }
                    }
                } elseif ($Mode -eq 'plan-build') {
                    switch ($resumePhase) {
                        'plan'  { $script:cyclePosition = 0 }
                        'build' { $script:cyclePosition = 1 }
                        default { $script:cyclePosition = 0 }
                    }
                }
                Write-Host "Resuming from iteration $resumeIteration (phase: $resumePhase)" -ForegroundColor Cyan
                Write-LogEntry -Event "session_resume" -Data @{
                    resume_iteration = $resumeIteration
                    resume_phase = $resumePhase
                    resume_cycle_position = $script:cyclePosition
                }
            }
        } catch {
            Write-Warning "Failed to read status.json for resume — starting from beginning."
        }
    } else {
        Write-Warning "No status.json found for resume — starting from beginning."
    }
} elseif ($LaunchMode -eq 'restart') {
    Write-Host "Restarting session (keeping existing work, starting from iteration 1)" -ForegroundColor Cyan
    Write-LogEntry -Event "session_restart" -Data @{}
}

# Prime cycle position from loop-plan.json if present.
[void](Resolve-CyclePromptFromPlan)

Write-Host "`nStarting loop..." -ForegroundColor Green
Write-Host "---`n"
$cancelled = $false
$handler = [ConsoleCancelEventHandler]{
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    $script:cancelled = $true
}
[Console]::add_CancelKeyPress($handler)

function Wait-ForRequests {
    if ($env:ALOOP_SKIP_WAIT -eq 'true') { return }
    $requestsDir = Join-Path $SessionDir "requests"
    if (Test-Path $requestsDir) {
        $pendingRequests = Get-ChildItem -Path $requestsDir -Filter '*.json' -File -ErrorAction SilentlyContinue
        if ($pendingRequests) {
            Write-LogEntry -Event "waiting_for_requests" -Data @{ count = $pendingRequests.Count }
            Write-Host "Waiting for $($pendingRequests.Count) pending requests to be processed..." -ForegroundColor Yellow
            $waitStart = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
            $timeout = if ($env:REQUEST_TIMEOUT) { [int]$env:REQUEST_TIMEOUT } else { 300 }

            while (Get-ChildItem -Path $requestsDir -Filter '*.json' -File -ErrorAction SilentlyContinue) {
                Start-Sleep -Seconds 2
                $elapsed = [int][DateTimeOffset]::Now.ToUnixTimeSeconds() - $waitStart
                if ($elapsed -gt $timeout) {
                    Write-LogEntry -Event "request_timeout" -Data @{ elapsed = $elapsed }
                    Write-Warning "Timeout waiting for requests to be processed ($elapsed s)"
                    break
                }
            }
            Write-Host "Requests processed." -ForegroundColor Green
        }
    }
}

function Run-QueueIfPresent {
    param([string]$IterationProvider)
    # Check queue/ folder for override prompts (takes priority over cycle)
    $queueDir = Join-Path $SessionDir "queue"
    $queueItem = $null
    if (Test-Path $queueDir) {
        $queueItem = Get-ChildItem -Path $queueDir -Filter '*.md' -File -ErrorAction SilentlyContinue |
            Sort-Object Name | Select-Object -First 1
    }

    if ($queueItem) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $queueBasename = $queueItem.Name
        Write-Host "`n--- Queue Override: $queueBasename [$timestamp] [$IterationProvider] ---" -ForegroundColor Blue

        Parse-Frontmatter -PromptFile $queueItem.FullName
        $queueIterMode = if ($script:frontmatter.agent) { $script:frontmatter.agent } else { 'queue' }
        $queueIterProvider = $IterationProvider
        if (-not [string]::IsNullOrWhiteSpace($script:frontmatter.provider)) {
            if (Get-Command $script:frontmatter.provider -ErrorAction SilentlyContinue) {
                $queueIterProvider = $script:frontmatter.provider
            } else {
                Write-LogEntry -Event "queue_frontmatter_provider_unavailable" -Data @{
                    requested_provider = $script:frontmatter.provider
                    fallback_provider = $IterationProvider
                    queue_file = $queueBasename
                }
            }
        }

        Write-Status -Iteration $iteration -Phase $queueIterMode -CurrentProvider $queueIterProvider -StuckCount $stuckState.StuckCount
        Write-LogEntry -Event "queue_override_start" -Data @{
            iteration = $iteration
            queue_file = $queueBasename
            agent = $queueIterMode
            provider = $queueIterProvider
        }

        try {
            $queuePromptContent = Get-Content -Path $queueItem.FullName -Raw
            Push-Location $WorkDir
            try {
                $providerOutput = Invoke-Provider -ProviderName $queueIterProvider -PromptContent $queuePromptContent -ModelOverride ([string]$script:frontmatter.model)
            }
            finally {
                Pop-Location
            }
            Show-AgentSummary -ProviderName $queueIterProvider -ProviderOutput $providerOutput
            Update-ProviderHealthOnSuccess -ProviderName $queueIterProvider
            Remove-Item $queueItem.FullName -Force -ErrorAction SilentlyContinue
            Write-LogEntry -Event "queue_override_complete" -Data @{
                iteration = $iteration
                queue_file = $queueBasename
                provider = $queueIterProvider
            }
            Write-Host "`n[Queue override complete: $queueBasename]" -ForegroundColor Green
        }
        catch {
            $errorContext = "$_ $script:lastProviderOutputText"
            Update-ProviderHealthOnFailure -ProviderName $queueIterProvider -ErrorText $errorContext
            Remove-Item $queueItem.FullName -Force -ErrorAction SilentlyContinue
            Write-LogEntry -Event "queue_override_error" -Data @{
                iteration = $iteration
                queue_file = $queueBasename
                provider = $queueIterProvider
                error = "$_"
            }
            Write-Warning "Queue override iteration failed for $($queueBasename): $_"
        }

        Wait-ForRequests
        Start-Sleep -Seconds 3
        return $true
    }
    return $false
}

try {
    while (-not $cancelled -and $iteration -lt $MaxIterations) {
        $iteration++
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $iterationStart = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
        $steeringFile = Join-Path $WorkDir "STEERING.md"
        # Hot-reload provider list from meta.json (supports runtime changes)
        if ($Provider -eq 'round-robin') {
            Refresh-ProvidersFromMeta
        }
        $iterationProvider = Resolve-IterationProvider -IterationNumber $iteration

        if (Run-QueueIfPresent -IterationProvider $iterationProvider) {
            continue
        }

        $iterationMode = Resolve-IterationMode -IterationNumber $iteration

        if (-not [string]::IsNullOrWhiteSpace($script:resolvedPromptName)) {
            $iterationPromptFile = Join-Path $PromptsDir $script:resolvedPromptName
        } else {
            $iterationPromptFile = Join-Path $PromptsDir "PROMPT_$iterationMode.md"
        }
        if (-not (Test-Path $iterationPromptFile)) {
            Write-Warning "Prompt file not found: $iterationPromptFile"
            Write-LogEntry -Event "iteration_error" -Data @{
                iteration = $iteration
                mode = $iterationMode
                provider = $iterationProvider
                error = 'prompt_missing'
                prompt_file = $iterationPromptFile
            }
            break
        }
        Parse-Frontmatter -PromptFile $iterationPromptFile
        if (-not [string]::IsNullOrWhiteSpace($script:frontmatter.agent)) {
            $iterationMode = $script:frontmatter.agent
        }
        if (-not [string]::IsNullOrWhiteSpace($script:frontmatter.provider)) {
            if (Get-Command $script:frontmatter.provider -ErrorAction SilentlyContinue) {
                $iterationProvider = $script:frontmatter.provider
            } else {
                Write-LogEntry -Event "frontmatter_provider_unavailable" -Data @{
                    requested_provider = $script:frontmatter.provider
                    fallback_provider = $iterationProvider
                    prompt_file = $iterationPromptFile
                }
            }
        }
        Write-LogEntry -Event "frontmatter_applied" -Data @{
            prompt_file = $iterationPromptFile
            agent = [string]$script:frontmatter.agent
            provider = [string]$script:frontmatter.provider
            model = [string]$script:frontmatter.model
            reasoning = [string]$script:frontmatter.reasoning
        }

        # Update session status
        Write-Status -Iteration $iteration -Phase $iterationMode -CurrentProvider $iterationProvider -StuckCount $stuckState.StuckCount
        Persist-LoopPlanState -Iteration $iteration

        $modeColor = switch ($iterationMode) {
            'plan'   { 'Magenta' }
            'build'  { 'Yellow' }
            'proof'  { 'DarkCyan' }
            'review' { 'Cyan' }
            'steer'  { 'Blue' }
            default  { 'White' }
        }
        Write-Host "`n--- Iteration $iteration / $MaxIterations [$timestamp] [$iterationProvider] [$iterationMode] ---" -ForegroundColor $modeColor

        # Build mode: stuck detection and task display
        if ($iterationMode -eq 'build') {
            if (Check-AllTasksComplete) {
                Write-LogEntry -Event "tasks_marked_complete" -Data @{ iteration = $iteration }
            }

            $currentTask = Get-CurrentTask
            if ($currentTask -and $currentTask -eq $stuckState.LastTask) {
                $stuckState.StuckCount++
            } else {
                $stuckState.LastTask = $currentTask
                $stuckState.StuckCount = 1
            }

            if ($stuckState.StuckCount -ge $MaxStuck -and $currentTask) {
                Skip-StuckTask -task $currentTask
                Write-LogEntry -Event "task_skipped" -Data @{ task = $currentTask; stuck_count = $MaxStuck }
                $stuckState.LastTask = ""
                $stuckState.StuckCount = 0
                continue
            }

            if ($currentTask) { Write-Host "Current task: $currentTask" -ForegroundColor Gray }
        }

        if ($DryRun) {
            Write-Host "[DRY RUN] Would invoke $iterationProvider with PROMPT_$iterationMode.md" -ForegroundColor DarkGray
            Start-Sleep -Seconds 2
            continue
        }

        try {
            $promptContent = Get-Content -Path $iterationPromptFile -Raw

            # Proof phase: prepare artifact directory and replace placeholders
            if ($iterationMode -eq 'proof') {
                $artifactDir = Join-Path $SessionDir "artifacts\iter-$iteration"
                if (-not (Test-Path $artifactDir)) {
                    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
                }
                $script:lastProofIteration = $iteration
                $promptContent = $promptContent -replace '<session-dir>', $SessionDir
                $promptContent = $promptContent -replace 'iter-<N>', "iter-$iteration"
            }

            # Review phase: inject latest proof manifest if available
            if ($iterationMode -eq 'review') {
                Reset-ReviewVerdict
                if ($script:lastProofIteration -gt 0) {
                    $lastManifest = Join-Path $SessionDir "artifacts\iter-$($script:lastProofIteration)\proof-manifest.json"
                    if (Test-Path $lastManifest) {
                        $manifestContent = Get-Content -Path $lastManifest -Raw
                        $promptContent += "`n`n## Proof Manifest (from iteration $($script:lastProofIteration))`n`n$manifestContent"
                        Write-Host "Injected proof manifest from iteration $($script:lastProofIteration) into review prompt." -ForegroundColor Gray
                    }
                }
                $promptContent += "`n`n## Mandatory Machine-Readable Verdict`nBefore exiting this review iteration, write a JSON verdict file at:`n$reviewVerdictFile`nSchema:`n{`n  `"iteration`": $iteration,`n  `"verdict`": `"PASS`" | `"FAIL`",`n  `"summary`": `"<one-sentence reason>`"`n}`nDo not skip writing this file."
            }

            Push-Location $WorkDir
            try {
                $providerOutput = Invoke-Provider -ProviderName $iterationProvider -PromptContent $promptContent -ModelOverride ([string]$script:frontmatter.model)
            }
            finally {
                Pop-Location
            }

            Show-AgentSummary -ProviderName $iterationProvider -ProviderOutput $providerOutput

            Update-ProviderHealthOnSuccess -ProviderName $iterationProvider
            Register-IterationSuccess -IterationMode $iterationMode -WasForced $script:lastModeWasForced
            Persist-LoopPlanState -Iteration $iteration
            $stuckState.StuckCount = 0
            $stuckState.LastTask = ""

            # Steer mode: remove any leftover steering file if the agent did not delete it
            if ($iterationMode -eq 'steer') {
                if (Test-Path $steeringFile) { Remove-Item $steeringFile -Force }
                Write-Host "[Steering processed — re-plan queued for next iteration]" -ForegroundColor Blue
                Write-LogEntry -Event "steering_processed" -Data @{ iteration = $iteration }
            }

            Write-LogEntry -Event "iteration_complete" -Data @{
                iteration = $iteration
                mode = $iterationMode
                provider = $iterationProvider
            }

            if ($iterationMode -eq 'build') {
                Print-IterationSummary -IterationStart $iterationStart -Iteration $iteration
                Push-ToBackup
            } elseif ($iterationMode -eq 'review') {
                # Deterministic baseline update based on review-verdict.json
                $reviewVerdict = Get-ReviewVerdict -ExpectedIteration $iteration
                if ($reviewVerdict -eq 'PASS') {
                    Update-ProofBaselines -ProofIteration $script:lastProofIteration
                }

                Write-Host "`n[Iteration $iteration complete - $iterationMode]" -ForegroundColor Green
            } else {
                Write-Host "`n[Iteration $iteration complete - $iterationMode]" -ForegroundColor Green
            }
        }
        catch {
            $errorContext = "$_ $script:lastProviderOutputText"
            Update-ProviderHealthOnFailure -ProviderName $iterationProvider -ErrorText $errorContext
            Register-IterationFailure -IterationMode $iterationMode -ErrorText $errorContext
            Persist-LoopPlanState -Iteration $iteration
            Write-Warning "Iteration $iteration failed: $_"
            Write-LogEntry -Event "iteration_error" -Data @{
                iteration = $iteration
                mode = $iterationMode
                provider = $iterationProvider
                error = "$_"
            }
        }

        Wait-ForRequests
        Start-Sleep -Seconds 3
    }
} finally {
    Stop-ActiveProvider
    Remove-SessionLock
    Cleanup-GhBlock
    Stop-DashboardProcess
    if ($cancelled) {
        Write-Host "`nInterrupted" -ForegroundColor Yellow
        Write-Status -Iteration $iteration -Phase (Resolve-IterationMode -IterationNumber $iteration) -CurrentProvider (Resolve-IterationProvider -IterationNumber $iteration) -StuckCount $stuckState.StuckCount -State 'stopped'
        Write-LogEntry -Event "interrupted" -Data @{ iteration = $iteration }
        Generate-Report -ExitReason "Manually interrupted (Ctrl+C)." -Iteration $iteration
        exit 130
    }
}

if ($iteration -ge $MaxIterations) {
    Write-Host "`nReached iteration limit ($MaxIterations)" -ForegroundColor Yellow
    Write-Status -Iteration $iteration -Phase (Resolve-IterationMode -IterationNumber $iteration) -CurrentProvider (Resolve-IterationProvider -IterationNumber $iteration) -StuckCount $stuckState.StuckCount -State 'stopped'
    Write-LogEntry -Event "limit_reached" -Data @{ iteration = $iteration; limit = $MaxIterations }
    Generate-Report -ExitReason "Reached iteration limit ($MaxIterations)." -Iteration $iteration
}

Write-Host "`n=== Aloop Loop Complete $iteration iterations ===" -ForegroundColor Cyan
