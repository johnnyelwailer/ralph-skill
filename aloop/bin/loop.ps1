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
        $index = ($IterationNumber - 1) % $RoundRobinProviders.Count
        return $RoundRobinProviders[$index]
    }
    return $Provider
}

function Resolve-IterationMode {
    param([int]$IterationNumber)
    if ($script:forcePlanNext) {
        $script:forcePlanNext = $false
        return 'plan'
    }
    if ($Mode -eq 'plan-build') {
        if ($IterationNumber % 2 -eq 1) { return 'plan' } else { return 'build' }
    }
    if ($Mode -eq 'plan-build-review') {
        # 5-step cycle: plan -> build -> build -> build -> review
        $phase = ($IterationNumber - 1) % 5
        switch ($phase) {
            0 { return 'plan' }
            1 { return 'build' }
            2 { return 'build' }
            3 { return 'build' }
            4 { return 'review' }
        }
    }
    return $Mode
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

function Invoke-Provider {
    param(
        [string]$ProviderName,
        [string]$PromptContent
    )

    switch ($ProviderName) {
        'claude' {
            $PromptContent | & claude --model $ClaudeModel --dangerously-skip-permissions --print 2>&1 | Tee-Object -Variable output
            if ($LASTEXITCODE -ne 0) {
                throw "claude exited with code $LASTEXITCODE"
            }
            return $output
        }
        'codex' {
            $PromptContent | & codex exec -m $CodexModel --dangerously-bypass-approvals-and-sandbox - 2>&1 | Tee-Object -Variable output
            if ($LASTEXITCODE -ne 0) {
                throw "codex exited with code $LASTEXITCODE"
            }
            return $output
        }
        'gemini' {
            & gemini -m $GeminiModel --yolo -p $PromptContent 2>&1 | Tee-Object -Variable output
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Gemini -m $GeminiModel failed (exit $LASTEXITCODE). Retrying without explicit model."
                & gemini --yolo -p $PromptContent 2>&1 | Tee-Object -Variable output
                if ($LASTEXITCODE -ne 0) {
                    throw "gemini exited with code $LASTEXITCODE"
                }
            }
            return $output
        }
        'copilot' {
            & copilot --model $CopilotModel --yolo -p $PromptContent 2>&1 | Tee-Object -Variable output
            $outputText = ($output | Out-String)
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Copilot --model $CopilotModel failed (exit $LASTEXITCODE). Retrying with --model $CopilotRetryModel."
                & copilot --model $CopilotRetryModel --yolo -p $PromptContent 2>&1 | Tee-Object -Variable output
                $outputText = ($output | Out-String)
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "Copilot --model $CopilotRetryModel failed (exit $LASTEXITCODE). Retrying without explicit model."
                    & copilot --yolo -p $PromptContent 2>&1 | Tee-Object -Variable output
                    $outputText = ($output | Out-String)
                }
                if ($LASTEXITCODE -ne 0) {
                    throw "copilot exited with code $LASTEXITCODE"
                }
            }
            Assert-CopilotAuth -CopilotOutputText $outputText
            return $output
        }
        default {
            throw "Unsupported provider '$ProviderName'"
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
        try { $commitCount = git rev-list --count HEAD } catch { }
        try {
            $firstCommit = git rev-list --max-parents=0 HEAD
            $filesChanged = (git diff --name-only $firstCommit HEAD | Measure-Object).Count
        } catch { }

        $recentCommits = "No git history"
        try { $recentCommits = (git log --oneline -20) -join "`n" } catch { }
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
                Write-Host "`nALL TASKS COMPLETE" -ForegroundColor Green
                Stop-DashboardProcess
                Write-Status -Iteration $iteration -Phase $iterationMode -CurrentProvider $iterationProvider -StuckCount 0 -State 'completed'
                Write-LogEntry -Event "all_tasks_complete" -Data @{ iteration = $iteration }
                Generate-Report -ExitReason "All tasks completed successfully." -Iteration $iteration
                exit 0
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
            } else {
                Write-Host "`n[Iteration $iteration complete - $iterationMode]" -ForegroundColor Green
            }
        }
        catch {
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

Write-Host "`n=== Aloop Loop Complete ($iteration iterations) ===" -ForegroundColor Cyan
