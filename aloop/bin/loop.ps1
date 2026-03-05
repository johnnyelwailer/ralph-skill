#!/usr/bin/env pwsh
# Aloop Loop — Generic Multi-Provider Autonomous Coding Loop
# Usage: loop.ps1 -PromptsDir <path> -SessionDir <path> -WorkDir <path> [-Mode plan-build-review] [-Provider claude] [-MaxIterations 50]
#
# Modes:
#   plan               - planning only (gap analysis, update TODO)
#   build              - building only (implement tasks from TODO)
#   review             - review only (audit last build against quality gates)
#   plan-build         - alternating: plan -> build -> plan -> build -> ...
#   plan-build-review  - full cycle: plan -> build x3 -> review -> ... (DEFAULT)
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

    [ValidateSet('claude', 'codex', 'gemini', 'copilot', 'round-robin')]
    [string]$Provider = 'claude',

    [string[]]$RoundRobinProviders = @('claude', 'codex', 'gemini', 'copilot'),

    # Model defaults — keep in sync with ~/.aloop/config.yml (source of truth)
    [string]$ClaudeModel = 'opus',
    [string]$CodexModel = 'gpt-5.3-codex',
    [string]$GeminiModel = 'gemini-3.1-pro-preview',
    [string]$CopilotModel = 'gpt-5.3-codex',
    [string]$CopilotRetryModel = 'claude-sonnet-4.6',

    [int]$MaxIterations = 50,
    [int]$MaxStuck = 3,

    [switch]$BackupEnabled,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Defense in depth: clear CLAUDECODE from the process environment at script entry.
if (Test-Path Env:CLAUDECODE) {
    Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue
}

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
    if ($script:forceReviewNext) {
        $script:forceReviewNext = $false
        $script:lastModeWasForced = $true
        return 'review'
    }
    if ($script:forcePlanNext) {
        $script:forcePlanNext = $false
        $script:lastModeWasForced = $true
        return 'plan'
    }
    $requestedMode = $Mode
    if ($Mode -eq 'plan-build') {
        $phase = $script:cyclePosition % 2
        if ($phase -eq 0) { $requestedMode = 'plan' } else { $requestedMode = 'build' }
    }
    if ($Mode -eq 'plan-build-review') {
        # 5-step cycle: plan -> build -> build -> build -> review
        $phase = $script:cyclePosition % 5
        switch ($phase) {
            0 { $requestedMode = 'plan' }
            1 { $requestedMode = 'build' }
            2 { $requestedMode = 'build' }
            3 { $requestedMode = 'build' }
            4 { $requestedMode = 'review' }
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

function Invoke-Provider {
    param(
        [string]$ProviderName,
        [string]$PromptContent
    )

    # PATH hardening: prepend gh-blocking shim directory so gh resolves to a
    # non-functional wrapper while provider binaries in the same directories
    # remain reachable.
    $ghBlockDir = Setup-GhBlock
    $savedPath = $env:PATH
    $env:PATH = "$ghBlockDir$([System.IO.Path]::PathSeparator)$env:PATH"
    try {

    switch ($ProviderName) {
        'claude' {
            $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                $rawOutput = $PromptContent | & claude --model $ClaudeModel --dangerously-skip-permissions --print 2>&1 | Tee-Object -Variable rawOutput
                return $rawOutput
            }
            if ($LASTEXITCODE -ne 0) {
                $errorOutput = $output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }
                $errorText = ($errorOutput | Out-String).Trim()
                $script:lastProviderOutputText = $output | Out-String
                throw "claude exited with code $LASTEXITCODE`nStderr: $errorText"
            }
            $script:lastProviderOutputText = $null
            return $output
        }
        'codex' {
            $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                $rawOutput = $PromptContent | & codex exec -m $CodexModel --dangerously-bypass-approvals-and-sandbox - 2>&1 | Tee-Object -Variable rawOutput
                return $rawOutput
            }
            if ($LASTEXITCODE -ne 0) {
                $errorOutput = $output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }
                $errorText = ($errorOutput | Out-String).Trim()
                $script:lastProviderOutputText = $output | Out-String
                throw "codex exited with code $LASTEXITCODE`nStderr: $errorText"
            }
            $script:lastProviderOutputText = $null
            return $output
        }
        'gemini' {
            $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                $rawOutput = & gemini -m $GeminiModel --yolo -p $PromptContent 2>&1 | Tee-Object -Variable rawOutput
                return $rawOutput
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Gemini -m $GeminiModel failed (exit $LASTEXITCODE). Retrying without explicit model."
                $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                    $rawOutput = & gemini --yolo -p $PromptContent 2>&1 | Tee-Object -Variable rawOutput
                    return $rawOutput
                }
                if ($LASTEXITCODE -ne 0) {
                    $errorOutput = $output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }
                    $errorText = ($errorOutput | Out-String).Trim()
                    $script:lastProviderOutputText = $output | Out-String
                    throw "gemini exited with code $LASTEXITCODE`nStderr: $errorText"
                }
            }
            $script:lastProviderOutputText = $null
            return $output
        }
        'copilot' {
            $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                $rawOutput = & copilot --model $CopilotModel --yolo -p $PromptContent 2>&1 | Tee-Object -Variable rawOutput
                return $rawOutput
            }
            $outputText = ($output | Out-String)
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Copilot --model $CopilotModel failed (exit $LASTEXITCODE). Retrying with --model $CopilotRetryModel."
                $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                    $rawOutput = & copilot --model $CopilotRetryModel --yolo -p $PromptContent 2>&1 | Tee-Object -Variable rawOutput
                    return $rawOutput
                }
                $outputText = ($output | Out-String)
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "Copilot --model $CopilotRetryModel failed (exit $LASTEXITCODE). Retrying without explicit model."
                    $output = Invoke-WithSanitizedClaudeCodeEnv -Action {
                        $rawOutput = & copilot --yolo -p $PromptContent 2>&1 | Tee-Object -Variable rawOutput
                        return $rawOutput
                    }
                    $outputText = ($output | Out-String)
                }
                if ($LASTEXITCODE -ne 0) {
                    $errorOutput = $output | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }
                    $errorText = ($errorOutput | Out-String).Trim()
                    $script:lastProviderOutputText = $outputText
                    throw "copilot exited with code $LASTEXITCODE`nStderr: $errorText"
                }
            }
            $script:lastProviderOutputText = $null
            Assert-CopilotAuth -CopilotOutputText $outputText
            return $output
        }
        default {
            throw "Unsupported provider '$ProviderName'"
        }
    }

    } finally {
        # Restore original PATH after provider execution
        $env:PATH = $savedPath
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

# ============================================================================
# STUCK DETECTION
# ============================================================================

$stuckState = @{ LastTask = ""; StuckCount = 0 }
$script:forcePlanNext = $false
$script:allTasksMarkedDone = $false
$script:forceReviewNext = $false
$script:lastProviderOutputText = $null
$script:cyclePosition = 0
$script:lastModeWasForced = $false
$script:hasBuildsSinceLastPlan = $false
$script:phaseRetryState = @{
    phase = ''
    consecutive = 0
    failureReasons = @()
}
$script:maxPhaseRetries = if ($Provider -eq 'round-robin') { [Math]::Max(2, $RoundRobinProviders.Count * 2) } else { 2 }

function Advance-CyclePosition {
    if ($Mode -eq 'plan-build') {
        $script:cyclePosition = ($script:cyclePosition + 1) % 2
    } elseif ($Mode -eq 'plan-build-review') {
        $script:cyclePosition = ($script:cyclePosition + 1) % 5
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

    if (($Mode -in @('plan-build', 'plan-build-review')) -and -not $WasForced -and ($IterationMode -in @('plan', 'build', 'review'))) {
        Advance-CyclePosition
    }
}

function Register-IterationFailure {
    param(
        [string]$IterationMode,
        [string]$ErrorText
    )
    if (-not ($Mode -in @('plan-build', 'plan-build-review'))) { return }
    if (-not ($IterationMode -in @('plan', 'build', 'review'))) { return }

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
    $cliEntrypoint = Join-Path $runtimeDir 'cli\dist\index.js'
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
            try { git commit -m "Initial commit" | Out-Null } catch { }
        }

        try {
            git remote get-url origin | Out-Null
            Write-Host ("Remote backup: " + (git remote get-url origin))
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
            $login = gh api user -q .login
            Write-Host "Remote backup: https://github.com/$login/$repoName"
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
    $supportedProviders = @('claude', 'codex', 'gemini', 'copilot')
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
    Write-Host "Mode cycle: plan -> build -> build -> build -> review -> ..."
}
Write-Host "Max iterations: $MaxIterations"
Write-Host "Stuck threshold: $MaxStuck"
Write-Host ""

# Validate prompt files exist
$requiredPrompts = switch ($Mode) {
    'plan-build'        { @('plan', 'build') }
    'plan-build-review' { @('plan', 'build', 'review') }
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

# Initialize session
Write-LogEntry -Event "session_start" -Data @{
    mode = $Mode
    provider = $Provider
    work_dir = $WorkDir
    max_iterations = $MaxIterations
}

Write-Host "`nStarting loop..." -ForegroundColor Green
Write-Host "---`n"

$iteration = 0
$cancelled = $false
$handler = [ConsoleCancelEventHandler]{
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    $script:cancelled = $true
}
[Console]::add_CancelKeyPress($handler)

try {
    while (-not $cancelled -and $iteration -lt $MaxIterations) {
        $iteration++
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $iterationStart = [int][DateTimeOffset]::Now.ToUnixTimeSeconds()
        $iterationProvider = Resolve-IterationProvider -IterationNumber $iteration
        $iterationMode = Resolve-IterationMode -IterationNumber $iteration

        # Check for live steering instruction (overrides normal mode)
        $steeringFile = Join-Path $WorkDir "STEERING.md"
        $steerPromptFile = Join-Path $PromptsDir "PROMPT_steer.md"
        if ((Test-Path $steeringFile) -and (Test-Path $steerPromptFile)) {
            $iterationMode = 'steer'
            $script:forcePlanNext = $true
            $script:allTasksMarkedDone = $false
            $script:cyclePosition = 0
            Write-LogEntry -Event "steering_detected" -Data @{ iteration = $iteration }
        } elseif (Test-Path $steeringFile) {
            Write-Warning "STEERING.md found but PROMPT_steer.md is missing in $PromptsDir — steering skipped."
        }

        $iterationPromptFile = Join-Path $PromptsDir "PROMPT_$iterationMode.md"

        # Update session status
        Write-Status -Iteration $iteration -Phase $iterationMode -CurrentProvider $iterationProvider -StuckCount $stuckState.StuckCount

        $modeColor = switch ($iterationMode) {
            'plan'   { 'Magenta' }
            'build'  { 'Yellow' }
            'review' { 'Cyan' }
            'steer'  { 'Blue' }
            default  { 'White' }
        }
        Write-Host "`n--- Iteration $iteration / $MaxIterations [$timestamp] [$iterationProvider] [$iterationMode] ---" -ForegroundColor $modeColor

        # Build mode: check completion and stuck detection
        if ($iterationMode -eq 'build') {
            if (Check-AllTasksComplete) {
                if ($Mode -eq 'plan-build-review') {
                    Write-Host "`nALL TASKS MARKED DONE - forcing final review" -ForegroundColor Cyan
                    $script:allTasksMarkedDone = $true
                    $script:forceReviewNext = $true
                    Write-LogEntry -Event "tasks_marked_complete" -Data @{ iteration = $iteration }
                    continue
                } else {
                    Write-Host "`nALL TASKS COMPLETE" -ForegroundColor Green
                    Stop-DashboardProcess
                    Write-Status -Iteration $iteration -Phase $iterationMode -CurrentProvider $iterationProvider -StuckCount 0 -State 'completed'
                    Write-LogEntry -Event "all_tasks_complete" -Data @{ iteration = $iteration }
                    Generate-Report -ExitReason "All tasks completed successfully." -Iteration $iteration
                    exit 0
                }
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

            Push-Location $WorkDir
            try {
                $providerOutput = Invoke-Provider -ProviderName $iterationProvider -PromptContent $promptContent
            }
            finally {
                Pop-Location
            }

            Show-AgentSummary -ProviderName $iterationProvider -ProviderOutput $providerOutput

            Update-ProviderHealthOnSuccess -ProviderName $iterationProvider
            Register-IterationSuccess -IterationMode $iterationMode -WasForced $script:lastModeWasForced

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
            } elseif ($iterationMode -eq 'review' -and $script:allTasksMarkedDone) {
                # Final review gate: review was forced by allTasksMarkedDone
                if (Check-AllTasksComplete) {
                    Write-Host "`nFINAL REVIEW APPROVED" -ForegroundColor Green
                    Stop-DashboardProcess
                    Write-Status -Iteration $iteration -Phase $iterationMode -CurrentProvider $iterationProvider -StuckCount 0 -State 'completed'
                    Write-LogEntry -Event "final_review_approved" -Data @{ iteration = $iteration }
                    Generate-Report -ExitReason "All tasks completed and approved by final review." -Iteration $iteration
                    exit 0
                } else {
                    Write-Host "`nFINAL REVIEW REJECTED - reopened tasks, continuing loop" -ForegroundColor Yellow
                    $script:allTasksMarkedDone = $false
                    $script:forcePlanNext = $true
                    $script:cyclePosition = 0
                    Write-LogEntry -Event "final_review_rejected" -Data @{ iteration = $iteration }
                    Write-Host "`n[Iteration $iteration complete - $iterationMode]" -ForegroundColor Green
                }
            } else {
                Write-Host "`n[Iteration $iteration complete - $iterationMode]" -ForegroundColor Green
            }
        }
        catch {
            $errorContext = "$_ $script:lastProviderOutputText"
            Update-ProviderHealthOnFailure -ProviderName $iterationProvider -ErrorText $errorContext
            Register-IterationFailure -IterationMode $iterationMode -ErrorText $errorContext
            Write-Warning "Iteration $iteration failed: $_"
            Write-LogEntry -Event "iteration_error" -Data @{
                iteration = $iteration
                mode = $iterationMode
                provider = $iterationProvider
                error = "$_"
            }
        }

        Start-Sleep -Seconds 3
    }
} finally {
    Cleanup-GhBlock
    Stop-DashboardProcess
    if ($cancelled) {
        Write-Host "`nInterrupted" -ForegroundColor Yellow
        Write-Status -Iteration $iteration -Phase (Resolve-IterationMode -IterationNumber $iteration) -CurrentProvider (Resolve-IterationProvider -IterationNumber $iteration) -StuckCount $stuckState.StuckCount -State 'interrupted'
        Write-LogEntry -Event "interrupted" -Data @{ iteration = $iteration }
        Generate-Report -ExitReason "Manually interrupted (Ctrl+C)." -Iteration $iteration
        exit 130
    }
}

if ($iteration -ge $MaxIterations) {
    Write-Host "`nReached iteration limit ($MaxIterations)" -ForegroundColor Yellow
    Write-Status -Iteration $iteration -Phase (Resolve-IterationMode -IterationNumber $iteration) -CurrentProvider (Resolve-IterationProvider -IterationNumber $iteration) -StuckCount $stuckState.StuckCount -State 'limit_reached'
    Write-LogEntry -Event "limit_reached" -Data @{ iteration = $iteration; limit = $MaxIterations }
    Generate-Report -ExitReason "Reached iteration limit ($MaxIterations)." -Iteration $iteration
}

Write-Host "`n=== Aloop Loop Complete $iteration iterations ===" -ForegroundColor Cyan
