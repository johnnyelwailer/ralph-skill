#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
<#
.SYNOPSIS
    Pester behavioral regression tests for loop.ps1 and loop.sh.
    Covers final-review exit invariant (forced review, approval, rejection, steering),
    provider-health state transitions (auth→degraded, cooldown, recovery, round-robin
    selection), and required log events — all validated against real subprocess
    execution rather than static source-text matching.
.NOTES
    Run:  Invoke-Pester ./aloop/bin/loop.tests.ps1 -Output Detailed
#>

# ============================================================================
# 2. loop.sh — final-review behavioral end-to-end
# ============================================================================
Describe 'loop.sh — final-review behavioral end-to-end' {

    BeforeAll {
        $script:bashExe = (Get-Command bash -ErrorAction SilentlyContinue)?.Source
        if (-not $script:bashExe) { return }

        $loopShPath = Join-Path $PSScriptRoot 'loop.sh'
        # Convert Windows path to POSIX for bash (Git Bash / WSL)
        $script:loopShBash = & $script:bashExe -c "cygpath -u '$(($loopShPath -replace "\\","/"))'" 2>$null
        if (-not $script:loopShBash) {
            $script:loopShBash = ($loopShPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }

        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-sh-tests-" + [guid]::NewGuid().ToString('N'))
        $script:shTempRoot = $tempRoot
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null
        $script:shFakeBinDir = $fakeBinDir

        # Fake claude shell script (bash) — manipulates TODO.md like the PS1 fake
        # Created entirely via bash (printf + chmod) so the execute bit is preserved
        # on Windows/NTFS where PowerShell-created files can't be chmod'd.
        $fakeBinBash = & $script:bashExe -c "cygpath -u '$($fakeBinDir -replace '\\','/')'" 2>$null
        if (-not $fakeBinBash) {
            $fakeBinBash = ($fakeBinDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
        $fakeBinBash = $fakeBinBash.Trim()
        $fakeShContent = @'
#!/bin/bash
STATE_FILE="${FAKE_CLAUDE_STATE:-}"
CALLS=0; SCENARIO="approve"; REJECTED=""
if [ -n "$STATE_FILE" ] && [ -f "$STATE_FILE" ]; then
    CALLS=$(grep '^calls=' "$STATE_FILE" | cut -d= -f2 | tr -d '[:space:]')
    SCENARIO=$(grep '^scenario=' "$STATE_FILE" | cut -d= -f2 | tr -d '[:space:]')
    REJECTED=$(grep '^rejected=' "$STATE_FILE" | cut -d= -f2 | tr -d '[:space:]')
fi
CALLS=$((CALLS + 1))
PROMPT_TEXT="$(cat)"
TODO_FILE="${PWD}/TODO.md"
if echo "$PROMPT_TEXT" | grep -q "Building Mode" && grep -q -- '- \[ \]' "$TODO_FILE" 2>/dev/null; then
    sed -i 's/- \[ \]/- [x]/g' "$TODO_FILE"
elif echo "$PROMPT_TEXT" | grep -q "Review Mode" && [ "$SCENARIO" = "reject-once" ] && [ "$REJECTED" != "true" ]; then
    REJECTED="true"
    sed -i 's/- \[x\]/- [ ]/g' "$TODO_FILE"
fi
[ -n "$STATE_FILE" ] && printf 'calls=%d\nscenario=%s\nrejected=%s\n' "$CALLS" "$SCENARIO" "$REJECTED" > "$STATE_FILE"
echo "Fake provider: call=$CALLS"
exit 0
'@
        $env:_ALOOP_FAKE_CLAUDE_SH = $fakeShContent -replace "`r`n", "`n"
        & $script:bashExe -c "mkdir -p '$fakeBinBash'; printf '%s' `"`$_ALOOP_FAKE_CLAUDE_SH`" > '$fakeBinBash/claude'; chmod +x '$fakeBinBash/claude'" 2>$null
        Remove-Item Env:_ALOOP_FAKE_CLAUDE_SH -ErrorAction SilentlyContinue

        function script:New-ShLoopEnv {
            param([string]$Scenario = 'approve')
            $testDir   = Join-Path $script:shTempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            # Use no-BOM UTF-8 + LF endings so bash grep/sed work correctly on these files
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText((Join-Path $workDir   'TODO.md'),          "- [ ] Build something`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_plan.md'),   "# Planning Mode`nPlan tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_build.md'),  "# Building Mode`nBuild tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_review.md'), "# Review Mode`nReview tasks.`n", $utf8NoBom)
            $stateFile = Join-Path $testDir 'claude-state.txt'
            [System.IO.File]::WriteAllText($stateFile, "calls=0`nscenario=$Scenario`nrejected=`n", $utf8NoBom)
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                StateFile  = $stateFile
                LogFile    = Join-Path $sessDir 'log.jsonl'
            }
        }

        function script:ConvertTo-BashPath {
            param([string]$WinPath)
            $p = & $script:bashExe -c "cygpath -u '$(($WinPath -replace "\\","/"))'" 2>$null
            if (-not $p) {
                $p = ($WinPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
            }
            return $p.Trim()
        }

        function script:Invoke-ShLoopScript {
            param($LoopEnv, [int]$MaxIter = 8)
            $prevPath  = $env:PATH
            $prevState = $env:FAKE_CLAUDE_STATE
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $env:FAKE_CLAUDE_STATE = $LoopEnv.StateFile
            $env:ALOOP_RUNTIME_DIR = Join-Path $LoopEnv.SessionDir '_runtime_stub'

            $binBash   = ConvertTo-BashPath $script:shFakeBinDir
            $promptBash = ConvertTo-BashPath $LoopEnv.PromptsDir
            $sessBash   = ConvertTo-BashPath $LoopEnv.SessionDir
            $workBash   = ConvertTo-BashPath $LoopEnv.WorkDir
            $loopBash   = $script:loopShBash

            try {
                $output = & $script:bashExe -c "
                    export PATH='$binBash':`$PATH
                    export FAKE_CLAUDE_STATE='$(ConvertTo-BashPath $LoopEnv.StateFile)'
                    bash '$loopBash' \
                        --prompts-dir '$promptBash' \
                        --session-dir '$sessBash' \
                        --work-dir '$workBash' \
                        --mode plan-build-review \
                        --provider claude \
                        --max-iterations $MaxIter
                " 2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            }
            finally {
                $env:PATH = $prevPath
                if ($null -eq $prevState) { Remove-Item Env:FAKE_CLAUDE_STATE -ErrorAction SilentlyContinue }
                else { $env:FAKE_CLAUDE_STATE = $prevState }
                if ($null -eq $prevRuntime) { Remove-Item Env:ALOOP_RUNTIME_DIR -ErrorAction SilentlyContinue }
                else { $env:ALOOP_RUNTIME_DIR = $prevRuntime }
            }
        }

        function script:Get-ShLogEvents {
            param([string]$LogFile)
            if (-not (Test-Path $LogFile)) { return @() }
            return @(
                Get-Content $LogFile |
                    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                    Where-Object { $_ } |
                    ForEach-Object { $_.event }
            )
        }
    }

    AfterAll {
        if ($script:shTempRoot -and (Test-Path $script:shTempRoot)) {
            Remove-Item -Recurse -Force $script:shTempRoot
        }
    }

    It 'build completion logs tasks_marked_complete (forced review, no all_tasks_complete)' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 8
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $events | Should -Contain 'tasks_marked_complete'
        $events | Should -Not -Contain 'all_tasks_complete'
    }

    It 'review approval emits final_review_approved and exits 0' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 8
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'final_review_approved'
        $events | Should -Not -Contain 'final_review_rejected'
    }

    It 'review rejection emits final_review_rejected then final_review_approved in order' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'reject-once'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 14
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'final_review_rejected'
        $events | Should -Contain 'final_review_approved'
        $rejIdx = [array]::IndexOf([string[]]$events, 'final_review_rejected')
        $appIdx = [array]::IndexOf([string[]]$events, 'final_review_approved')
        $rejIdx | Should -BeLessThan $appIdx
    }
}


# ============================================================================
# 3. loop.sh — retry-same-phase behavioral
# ============================================================================
Describe 'loop.sh — retry-same-phase behavioral' {

    BeforeAll {
        $script:bashExeRetry = (Get-Command bash -ErrorAction SilentlyContinue)?.Source
        if (-not $script:bashExeRetry) { return }

        $loopShPath = Join-Path $PSScriptRoot 'loop.sh'
        $script:loopShRetryBash = & $script:bashExeRetry -c "cygpath -u '$(($loopShPath -replace "\\","/"))'" 2>$null
        if (-not $script:loopShRetryBash) {
            $script:loopShRetryBash = ($loopShPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }

        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-sh-retry-tests-" + [guid]::NewGuid().ToString('N'))
        $script:shRetryTempRoot = $tempRoot
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null
        $script:shRetryFakeBinDir = $fakeBinDir

        $fakeBinBash = & $script:bashExeRetry -c "cygpath -u '$($fakeBinDir -replace '\\','/')'" 2>$null
        if (-not $fakeBinBash) {
            $fakeBinBash = ($fakeBinDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
        $fakeBinBash = $fakeBinBash.Trim()

        $fakeRetryProvider = @'
#!/bin/bash
STATE_FILE="${FAKE_RETRY_STATE_SH:-}"
CALLS=0
PLAN_FAILS=0
BUILD_FAILS=0

if [ -n "$STATE_FILE" ] && [ -f "$STATE_FILE" ]; then
    CALLS=$(grep '^calls=' "$STATE_FILE" | cut -d= -f2 | tr -d '[:space:]')
    PLAN_FAILS=$(grep '^plan_fails=' "$STATE_FILE" | cut -d= -f2 | tr -d '[:space:]')
    BUILD_FAILS=$(grep '^build_fails=' "$STATE_FILE" | cut -d= -f2 | tr -d '[:space:]')
fi

CALLS=$((CALLS + 1))
PROMPT_TEXT="$(cat)"

if echo "$PROMPT_TEXT" | grep -q "Planning Mode" && [ "${PLAN_FAILS:-0}" -gt 0 ]; then
    PLAN_FAILS=$((PLAN_FAILS - 1))
    [ -n "$STATE_FILE" ] && printf 'calls=%d\nplan_fails=%d\nbuild_fails=%d\n' "$CALLS" "$PLAN_FAILS" "$BUILD_FAILS" > "$STATE_FILE"
    echo "forced plan failure"
    exit 1
fi

if echo "$PROMPT_TEXT" | grep -q "Building Mode" && [ "${BUILD_FAILS:-0}" -gt 0 ]; then
    BUILD_FAILS=$((BUILD_FAILS - 1))
    [ -n "$STATE_FILE" ] && printf 'calls=%d\nplan_fails=%d\nbuild_fails=%d\n' "$CALLS" "$PLAN_FAILS" "$BUILD_FAILS" > "$STATE_FILE"
    echo "forced build failure"
    exit 1
fi

TODO_FILE="${PWD}/TODO.md"
if echo "$PROMPT_TEXT" | grep -q "Building Mode" && [ -f "$TODO_FILE" ]; then
    sed -i 's/- \[ \]/- [x]/g' "$TODO_FILE"
fi

[ -n "$STATE_FILE" ] && printf 'calls=%d\nplan_fails=%d\nbuild_fails=%d\n' "$CALLS" "$PLAN_FAILS" "$BUILD_FAILS" > "$STATE_FILE"
echo "ok"
exit 0
'@
        $env:_ALOOP_FAKE_RETRY_SH = $fakeRetryProvider -replace "`r`n", "`n"
        & $script:bashExeRetry -c "mkdir -p '$fakeBinBash'; printf '%s' `"`$_ALOOP_FAKE_RETRY_SH`" > '$fakeBinBash/claude'; chmod +x '$fakeBinBash/claude'; cp '$fakeBinBash/claude' '$fakeBinBash/codex'; chmod +x '$fakeBinBash/codex'" 2>$null
        Remove-Item Env:_ALOOP_FAKE_RETRY_SH -ErrorAction SilentlyContinue

        function script:New-ShRetryEnv {
            param([int]$PlanFails = 0, [int]$BuildFails = 0)
            $testDir   = Join-Path $script:shRetryTempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText((Join-Path $workDir   'TODO.md'),          "- [ ] Build something`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_plan.md'),   "# Planning Mode`nPlan tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_build.md'),  "# Building Mode`nBuild tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_review.md'), "# Review Mode`nReview tasks.`n", $utf8NoBom)
            $stateFile = Join-Path $testDir 'retry-state.txt'
            [System.IO.File]::WriteAllText($stateFile, "calls=0`nplan_fails=$PlanFails`nbuild_fails=$BuildFails`n", $utf8NoBom)
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                StateFile  = $stateFile
                LogFile    = Join-Path $sessDir 'log.jsonl'
            }
        }

        function script:ConvertTo-BashRetryPath {
            param([string]$WinPath)
            $p = & $script:bashExeRetry -c "cygpath -u '$(($WinPath -replace "\\","/"))'" 2>$null
            if (-not $p) {
                $p = ($WinPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
            }
            return $p.Trim()
        }

        function script:Invoke-ShRetryLoop {
            param(
                $LoopEnv,
                [int]$MaxIter = 5,
                [string]$Provider = 'round-robin',
                [string]$RoundRobinProviders = 'claude,codex'
            )
            $prevState = $env:FAKE_RETRY_STATE_SH
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            try {
                $binBash   = ConvertTo-BashRetryPath $script:shRetryFakeBinDir
                $promptBash = ConvertTo-BashRetryPath $LoopEnv.PromptsDir
                $sessBash   = ConvertTo-BashRetryPath $LoopEnv.SessionDir
                $workBash   = ConvertTo-BashRetryPath $LoopEnv.WorkDir
                $loopBash   = $script:loopShRetryBash
                $stateBash  = ConvertTo-BashRetryPath $LoopEnv.StateFile
                $loopCommandLines = @(
                    "bash '$loopBash' \",
                    "    --prompts-dir '$promptBash' \",
                    "    --session-dir '$sessBash' \",
                    "    --work-dir '$workBash' \",
                    "    --mode plan-build-review \",
                    "    --provider '$Provider' \"
                )
                if ($Provider -eq 'round-robin') {
                    $loopCommandLines += "    --round-robin '$RoundRobinProviders' \"
                }
                $loopCommandLines += "    --max-iterations $MaxIter"
                $loopCommand = $loopCommandLines -join "`n"

                $output = & $script:bashExeRetry -c "
                    export PATH='$binBash':`$PATH
                    export FAKE_RETRY_STATE_SH='$stateBash'
                    export ALOOP_RUNTIME_DIR='$(ConvertTo-BashRetryPath (Join-Path $LoopEnv.SessionDir '_runtime_stub'))'
                    $loopCommand
                " 2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            }
            finally {
                if ($null -eq $prevState) { Remove-Item Env:FAKE_RETRY_STATE_SH -ErrorAction SilentlyContinue }
                else { $env:FAKE_RETRY_STATE_SH = $prevState }
                if ($null -eq $prevRuntime) { Remove-Item Env:ALOOP_RUNTIME_DIR -ErrorAction SilentlyContinue }
                else { $env:ALOOP_RUNTIME_DIR = $prevRuntime }
            }
        }

        function script:Get-ShRetryLogEntries {
            param([string]$LogFile)
            if (-not (Test-Path $LogFile)) { return @() }
            return @(
                Get-Content $LogFile |
                    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                    Where-Object { $_ }
            )
        }
    }

    AfterAll {
        if ($script:shRetryTempRoot -and (Test-Path $script:shRetryTempRoot)) {
            Remove-Item -Recurse -Force $script:shRetryTempRoot
        }
    }

    It 'failed plan retries same phase and only advances after plan success' {
        if (-not $script:bashExeRetry) { Set-ItResult -Skipped -Because 'bash not available' }
        $e = New-ShRetryEnv -PlanFails 1
        $result = Invoke-ShRetryLoop -LoopEnv $e -MaxIter 4
        $result.ExitCode | Should -Be 0
        $entries = Get-ShRetryLogEntries -LogFile $e.LogFile
        $errors = @($entries | Where-Object { $_.event -eq 'iteration_error' })
        $completes = @($entries | Where-Object { $_.event -eq 'iteration_complete' })
        $errors[0].mode | Should -Be 'plan'
        $errors[0].provider | Should -Be 'claude'
        $completes[0].mode | Should -Be 'plan'
        $completes[0].provider | Should -Be 'codex'
        ($completes | Where-Object { $_.mode -eq 'build' }).Count | Should -BeGreaterThan 0
    }

    It 'phase_retry_exhausted advances to next phase after max retries' {
        if (-not $script:bashExeRetry) { Set-ItResult -Skipped -Because 'bash not available' }
        $e = New-ShRetryEnv -PlanFails 10
        $result = Invoke-ShRetryLoop -LoopEnv $e -Provider 'claude' -MaxIter 3
        $result.ExitCode | Should -Be 0
        $entries = Get-ShRetryLogEntries -LogFile $e.LogFile
        ($entries | Where-Object { $_.event -eq 'phase_retry_exhausted' }).Count | Should -BeGreaterThan 0
        ($entries | Where-Object { $_.event -eq 'iteration_complete' -and $_.mode -eq 'build' }).Count | Should -BeGreaterThan 0
    }
}


Describe 'loop.ps1 — final-review behavioral end-to-end' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $pwshPath   = (Get-Command pwsh -ErrorAction Stop).Source

        $tempRoot   = Join-Path ([IO.Path]::GetTempPath()) ("aloop-loop-tests-" + [guid]::NewGuid().ToString('N'))
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null

        # ── Fake provider script ─────────────────────────────────────────────
        # Reads current TODO.md state; marks incomplete tasks done (simulates a
        # successful build), or reopens tasks once if scenario='reject-once'
        # (simulates a review that fails quality gates).
        # Uses $env:FAKE_CLAUDE_STATE for inter-call state persistence.
        $fakePs1 = Join-Path $fakeBinDir '_fake_claude.ps1'
        $fakePs1Content = @'
$stateFile = $env:FAKE_CLAUDE_STATE
$state = if ($stateFile -and (Test-Path $stateFile)) {
    Get-Content $stateFile -Raw | ConvertFrom-Json
} else {
    [pscustomobject]@{ calls = 0; scenario = 'approve'; rejected = $false }
}
$state.calls++
$promptText = ($input | Out-String)

$todoFile = Join-Path $PWD 'TODO.md'
$content  = if (Test-Path $todoFile) { Get-Content $todoFile -Raw } else { '' }

if (($promptText -match 'Building Mode') -and ($content -match '- \[ \]')) {
    # Incomplete tasks exist — simulate successful build by marking all done
    ($content -replace '- \[ \]', '- [x]') | Set-Content $todoFile
} elseif (($promptText -match 'Review Mode') -and ($state.scenario -eq 'reject-once') -and -not $state.rejected) {
    # All done and first rejection — simulate review that reopens tasks
    $state.rejected = $true
    ($content -replace '- \[x\]', '- [ ]') | Set-Content $todoFile
}
# else: all done and no rejection — simulate review approval (do nothing)

if ($stateFile) { $state | ConvertTo-Json | Set-Content $stateFile }
Write-Output "Fake provider: call=$($state.calls)"
exit 0
'@
        Set-Content $fakePs1 $fakePs1Content

        # claude.cmd shim so loop.ps1 resolves 'claude' on PATH
        $claudeCmd = Join-Path $fakeBinDir 'claude.cmd'
        Set-Content $claudeCmd "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"

        # ── Helper: create an isolated test environment ──────────────────────
        function script:New-LoopEnv {
            param([string]$Scenario = 'approve')
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            Set-Content (Join-Path $workDir   'TODO.md')          "- [ ] Build something"
            Set-Content (Join-Path $promptDir 'PROMPT_plan.md')   "# Planning Mode`nPlan tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_build.md')  "# Building Mode`nBuild tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_review.md') "# Review Mode`nReview tasks."
            $stateFile = Join-Path $testDir 'claude-state.json'
            [pscustomobject]@{ calls = 0; scenario = $Scenario; rejected = $false } |
                ConvertTo-Json | Set-Content $stateFile
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                StateFile  = $stateFile
                LogFile    = Join-Path $sessDir 'log.jsonl'
            }
        }

        # ── Helper: run loop.ps1 with the fake provider injected into PATH ──
        function script:Invoke-LoopScript {
            param($LoopEnv, [int]$MaxIter = 6)
            $prevPath  = $env:PATH
            $prevState = $env:FAKE_CLAUDE_STATE
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $env:PATH              = "$fakeBinDir;$prevPath"
            $env:FAKE_CLAUDE_STATE = $LoopEnv.StateFile
            $env:ALOOP_RUNTIME_DIR = Join-Path $LoopEnv.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            try {
                $output = & $pwshPath -NoProfile -File $loopScript `
                    -PromptsDir    $LoopEnv.PromptsDir `
                    -SessionDir    $LoopEnv.SessionDir `
                    -WorkDir       $LoopEnv.WorkDir    `
                    -Mode          'plan-build-review'  `
                    -Provider      'claude'             `
                    -MaxIterations $MaxIter             `
                    2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            } finally {
                $env:PATH = $prevPath
                if ($null -eq $prevState) {
                    Remove-Item Env:FAKE_CLAUDE_STATE -ErrorAction SilentlyContinue
                } else {
                    $env:FAKE_CLAUDE_STATE = $prevState
                }
                if ($null -eq $prevRuntime) {
                    Remove-Item Env:ALOOP_RUNTIME_DIR -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_RUNTIME_DIR = $prevRuntime
                }
                if ($null -eq $prevNoDash) {
                    Remove-Item Env:ALOOP_NO_DASHBOARD -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_NO_DASHBOARD = $prevNoDash
                }
            }
        }

        # ── Helper: parse log.jsonl into event-name array ───────────────────
        function script:Get-LogEvents {
            param([string]$LogFile)
            if (-not (Test-Path $LogFile)) { return @() }
            return @(
                Get-Content $LogFile |
                    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                    Where-Object { $_ } |
                    ForEach-Object { $_.event }
            )
        }
    }

    AfterAll {
        if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot }
    }

    It 'build completion logs tasks_marked_complete (forced review, no immediate exit)' {
        $e      = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $events = Get-LogEvents -LogFile $e.LogFile
        $events | Should -Contain 'tasks_marked_complete'
        # Loop must NOT have exited before reaching the review gate
        $events | Should -Not -Contain 'all_tasks_complete'
    }

    It 'review approval emits final_review_approved and exits 0' {
        $e      = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'final_review_approved'
        $events | Should -Not -Contain 'final_review_rejected'
    }

    It 'review rejection emits final_review_rejected, re-plans, then final_review_approved' {
        $e      = New-LoopEnv -Scenario 'reject-once'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 10
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'final_review_rejected'
        $events | Should -Contain 'final_review_approved'
        # Rejection must precede approval in the log
        $rejIdx = [array]::IndexOf([string[]]$events, 'final_review_rejected')
        $appIdx = [array]::IndexOf([string[]]$events, 'final_review_approved')
        $rejIdx | Should -BeLessThan $appIdx
    }
}

# ============================================================================
# 4. loop.ps1 — retry-same-phase behavioral
# ============================================================================
Describe 'loop.ps1 — retry-same-phase behavioral' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $pwshPath   = (Get-Command pwsh -ErrorAction Stop).Source

        $tempRoot   = Join-Path ([IO.Path]::GetTempPath()) ("aloop-retry-tests-" + [guid]::NewGuid().ToString('N'))
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null

        $fakePs1 = Join-Path $fakeBinDir '_fake_retry_provider.ps1'
        $fakeProviderContent = @'
$stateFile = $env:FAKE_RETRY_STATE
$state = if ($stateFile -and (Test-Path $stateFile)) {
    Get-Content $stateFile -Raw | ConvertFrom-Json
} else {
    [pscustomobject]@{ calls = 0; planFails = 0; buildFails = 0 }
}
$state.calls++

$promptText = ($input | Out-String)
if ($promptText -match 'Planning Mode' -and $state.planFails -gt 0) {
    $state.planFails--
    if ($stateFile) { $state | ConvertTo-Json | Set-Content $stateFile }
    Write-Output "forced plan failure"
    exit 1
}
if ($promptText -match 'Building Mode' -and $state.buildFails -gt 0) {
    $state.buildFails--
    if ($stateFile) { $state | ConvertTo-Json | Set-Content $stateFile }
    Write-Output "forced build failure"
    exit 1
}

$todoFile = Join-Path $PWD 'TODO.md'
if (($promptText -match 'Building Mode') -and (Test-Path $todoFile)) {
    (Get-Content $todoFile -Raw -EA SilentlyContinue) -replace '- \[ \]', '- [x]' | Set-Content $todoFile
}
if ($stateFile) { $state | ConvertTo-Json | Set-Content $stateFile }
Write-Output "ok"
exit 0
'@
        Set-Content $fakePs1 $fakeProviderContent
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        Set-Content (Join-Path $fakeBinDir 'codex.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"

        function script:New-RetryEnv {
            param([int]$PlanFails = 0, [int]$BuildFails = 0)
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            Set-Content (Join-Path $workDir   'TODO.md')          "- [ ] Build something"
            Set-Content (Join-Path $promptDir 'PROMPT_plan.md')   "# Planning Mode`nPlan tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_build.md')  "# Building Mode`nBuild tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_review.md') "# Review Mode`nReview tasks."
            $stateFile = Join-Path $testDir 'retry-state.json'
            [pscustomobject]@{ calls = 0; planFails = $PlanFails; buildFails = $BuildFails } |
                ConvertTo-Json | Set-Content $stateFile
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                StateFile  = $stateFile
                LogFile    = Join-Path $sessDir 'log.jsonl'
            }
        }

        function script:Invoke-RetryLoop {
            param(
                $Env,
                [int]$MaxIter = 5,
                [string]$Provider = 'round-robin',
                [string[]]$RoundRobinProviders = @('claude', 'codex')
            )
            $prevPath  = $env:PATH
            $prevState = $env:FAKE_RETRY_STATE
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $env:PATH = "$fakeBinDir;$prevPath"
            $env:FAKE_RETRY_STATE = $Env.StateFile
            $env:ALOOP_RUNTIME_DIR = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            try {
                $args = @(
                    '-NoProfile', '-File', $loopScript,
                    '-PromptsDir', $Env.PromptsDir,
                    '-SessionDir', $Env.SessionDir,
                    '-WorkDir', $Env.WorkDir,
                    '-Mode', 'plan-build-review',
                    '-Provider', $Provider,
                    '-MaxIterations', $MaxIter
                )
                if ($Provider -eq 'round-robin') {
                    $args += '-RoundRobinProviders'
                    $args += ($RoundRobinProviders -join ',')
                }
                $output = & $pwshPath @args 2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            } finally {
                $env:PATH = $prevPath
                if ($null -eq $prevState) {
                    Remove-Item Env:FAKE_RETRY_STATE -ErrorAction SilentlyContinue
                } else {
                    $env:FAKE_RETRY_STATE = $prevState
                }
                if ($null -eq $prevRuntime) {
                    Remove-Item Env:ALOOP_RUNTIME_DIR -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_RUNTIME_DIR = $prevRuntime
                }
                if ($null -eq $prevNoDash) {
                    Remove-Item Env:ALOOP_NO_DASHBOARD -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_NO_DASHBOARD = $prevNoDash
                }
            }
        }
    }

    AfterAll {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match [regex]::Escape($tempRoot) } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot }
    }

    It 'failed plan retries same phase and only advances after plan success' {
        $e = New-RetryEnv -PlanFails 1
        $result = Invoke-RetryLoop -Env $e -MaxIter 4
        $entries = @(
            Get-Content $e.LogFile |
                ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                Where-Object { $_ }
        )

        $errors = @($entries | Where-Object { $_.event -eq 'iteration_error' })
        $completes = @($entries | Where-Object { $_.event -eq 'iteration_complete' })
        $errors[0].mode | Should -Be 'plan'
        $errors[0].provider | Should -Be 'claude'
        $completes[0].mode | Should -Be 'plan'
        $completes[0].provider | Should -Be 'codex'
        ($completes | Where-Object { $_.mode -eq 'build' }).Count | Should -BeGreaterThan 0
    }

    It 'phase_retry_exhausted advances to next phase after max retries' {
        $e = New-RetryEnv -PlanFails 10
        $result = Invoke-RetryLoop -Env $e -Provider 'claude' -MaxIter 3
        $result.ExitCode | Should -Be 0
        $entries = @(
            Get-Content $e.LogFile |
                ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                Where-Object { $_ }
        )
        ($entries | Where-Object { $_.event -eq 'phase_retry_exhausted' }).Count | Should -BeGreaterThan 0
        ($entries | Where-Object { $_.event -eq 'iteration_complete' -and $_.mode -eq 'build' }).Count | Should -BeGreaterThan 0
    }
}

# ============================================================================
# 5. loop.ps1 — provider-health behavioral
# ============================================================================
Describe 'loop.ps1 — provider-health behavioral' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $pwshPath   = (Get-Command pwsh -ErrorAction Stop).Source

        $tempRoot   = Join-Path ([IO.Path]::GetTempPath()) ("aloop-health-tests-" + [guid]::NewGuid().ToString('N'))
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null

        # ── Fake provider ps1: behaviour controlled by FAKE_PROVIDER_SCENARIO ─
        $fakePs1 = Join-Path $fakeBinDir '_fake_provider.ps1'
        Set-Content $fakePs1 @'
$scenario = if ($env:FAKE_PROVIDER_SCENARIO) { $env:FAKE_PROVIDER_SCENARIO } else { 'succeed' }
switch ($scenario) {
    'fail-auth'       { Write-Output "auth: unauthorized access denied";              exit 1 }
    'fail-rate-limit' { Write-Output "429: rate limit exceeded - too many requests";  exit 1 }
    'fail-concurrent' { Write-Output "cannot launch inside another session";          exit 1 }
    'fail-unknown'    { Write-Output "unexpected error: something went wrong";        exit 1 }
    default {
        $todoFile = Join-Path $PWD 'TODO.md'
        if (Test-Path $todoFile) {
            $c = Get-Content $todoFile -Raw
            if ($c -match '- \[ \]') { ($c -replace '- \[ \]', '- [x]') | Set-Content $todoFile }
        }
        Write-Output "Fake provider: success"
        exit 0
    }
}
'@
        $claudeCmd = Join-Path $fakeBinDir 'claude.cmd'
        Set-Content $claudeCmd "@echo off`r`nset FAKE_PROVIDER_SCENARIO=%FAKE_CLAUDE_SCENARIO%`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"

        $codexCmd = Join-Path $fakeBinDir 'codex.cmd'
        Set-Content $codexCmd "@echo off`r`nset FAKE_PROVIDER_SCENARIO=%FAKE_CODEX_SCENARIO%`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"

        # ── Helper: isolated test env with its own health dir ─────────────────
        function script:New-HealthEnv {
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            $healthDir = Join-Path $testDir 'health'
            foreach ($d in $workDir, $sessDir, $promptDir, $healthDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            Set-Content (Join-Path $workDir   'TODO.md')         "- [ ] Task A"
            Set-Content (Join-Path $promptDir 'PROMPT_build.md') "# Building Mode`nDo tasks."
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                HealthDir  = $healthDir
                LogFile    = Join-Path $sessDir 'log.jsonl'
            }
        }

        # ── Helper: run loop.ps1 with fake provider + isolated health dir ─────
        function script:Invoke-HealthLoop {
            param(
                $Env,
                [string]$ClaudeScenario = 'succeed',
                [string]$CodexScenario  = 'succeed',
                [string]$Provider       = 'claude',
                [string]$RRProviders    = 'claude,codex',
                [string]$Mode           = 'build',
                [int]   $MaxIter        = 2
            )
            $prevPath    = $env:PATH
            $prevHDir    = $env:ALOOP_HEALTH_DIR
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $prevClaudeS = $env:FAKE_CLAUDE_SCENARIO
            $prevCodexS  = $env:FAKE_CODEX_SCENARIO
            $env:PATH                  = "$fakeBinDir;$prevPath"
            $env:ALOOP_HEALTH_DIR      = $Env.HealthDir
            $env:ALOOP_RUNTIME_DIR     = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD    = '1'
            $env:FAKE_CLAUDE_SCENARIO  = $ClaudeScenario
            $env:FAKE_CODEX_SCENARIO   = $CodexScenario
            try {
                $callArgs = @(
                    '-NoProfile', '-File', $loopScript,
                    '-PromptsDir',    $Env.PromptsDir,
                    '-SessionDir',    $Env.SessionDir,
                    '-WorkDir',       $Env.WorkDir,
                    '-Mode',          $Mode,
                    '-Provider',      $Provider,
                    '-MaxIterations', $MaxIter
                )
                if ($Provider -eq 'round-robin') {
                    $callArgs += '-RoundRobinProviders', $RRProviders
                }
                $output = & $pwshPath @callArgs 2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            }
            finally {
                $env:PATH = $prevPath
                if ($null -eq $prevHDir)    { Remove-Item Env:ALOOP_HEALTH_DIR     -EA SilentlyContinue } else { $env:ALOOP_HEALTH_DIR    = $prevHDir }
                if ($null -eq $prevRuntime) { Remove-Item Env:ALOOP_RUNTIME_DIR    -EA SilentlyContinue } else { $env:ALOOP_RUNTIME_DIR   = $prevRuntime }
                if ($null -eq $prevNoDash)  { Remove-Item Env:ALOOP_NO_DASHBOARD   -EA SilentlyContinue } else { $env:ALOOP_NO_DASHBOARD  = $prevNoDash }
                if ($null -eq $prevClaudeS) { Remove-Item Env:FAKE_CLAUDE_SCENARIO -EA SilentlyContinue } else { $env:FAKE_CLAUDE_SCENARIO = $prevClaudeS }
                if ($null -eq $prevCodexS)  { Remove-Item Env:FAKE_CODEX_SCENARIO  -EA SilentlyContinue } else { $env:FAKE_CODEX_SCENARIO  = $prevCodexS }
            }
        }

        function script:Get-HealthFile {
            param([string]$HealthDir, [string]$Provider)
            $p = Join-Path $HealthDir "$($Provider.ToLowerInvariant()).json"
            if (-not (Test-Path $p)) { return $null }
            return Get-Content $p -Raw | ConvertFrom-Json
        }

        function script:Get-HealthLogEvents {
            param([string]$LogFile)
            if (-not (Test-Path $LogFile)) { return @() }
            return @(
                Get-Content $LogFile |
                    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                    Where-Object { $_ } |
                    ForEach-Object { $_.event }
            )
        }
    }

    AfterAll {
        # Kill any orphaned dashboard node processes spawned from this test's temp dirs
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match [regex]::Escape($tempRoot) } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot }
    }

    It 'auth failure writes status=degraded to health file and emits provider_degraded' {
        $e = New-HealthEnv
        Invoke-HealthLoop -Env $e -ClaudeScenario 'fail-auth' -MaxIter 1 | Out-Null
        $health = Get-HealthFile -HealthDir $e.HealthDir -Provider 'claude'
        $health            | Should -Not -BeNullOrEmpty
        $health.status     | Should -Be 'degraded'
        $health.failure_reason | Should -Be 'auth'
        $health.consecutive_failures | Should -Be 1
        $events = Get-HealthLogEvents -LogFile $e.LogFile
        $events | Should -Contain 'provider_degraded'
    }

    It 'second consecutive rate_limit failure enters cooldown and emits provider_cooldown' {
        $e = New-HealthEnv
        # Pre-seed: first failure already recorded (no cooldown yet at failures=1)
        @{ status='healthy'; last_success=$null; last_failure=$null; failure_reason='rate_limit';
           consecutive_failures=1; cooldown_until=$null } |
            ConvertTo-Json | Set-Content (Join-Path $e.HealthDir 'claude.json')
        Invoke-HealthLoop -Env $e -ClaudeScenario 'fail-rate-limit' -MaxIter 1 | Out-Null
        $health = Get-HealthFile -HealthDir $e.HealthDir -Provider 'claude'
        $health.status               | Should -Be 'cooldown'
        $health.consecutive_failures | Should -Be 2
        $health.cooldown_until       | Should -Not -BeNullOrEmpty
        $events = Get-HealthLogEvents -LogFile $e.LogFile
        $events | Should -Contain 'provider_cooldown'
    }

    It 'first failure retains healthy status with no cooldown (consecutive_failures=1)' {
        $e = New-HealthEnv
        Invoke-HealthLoop -Env $e -ClaudeScenario 'fail-unknown' -MaxIter 1 | Out-Null
        $health = Get-HealthFile -HealthDir $e.HealthDir -Provider 'claude'
        $health.status               | Should -Be 'healthy'
        $health.consecutive_failures | Should -Be 1
        $health.cooldown_until       | Should -BeNullOrEmpty
    }

    It 'success after cooldown resets health to healthy and emits provider_recovered' {
        $e = New-HealthEnv
        # Pre-seed: provider in cooldown
        $pastTime = [DateTimeOffset]::UtcNow.AddSeconds(-30).ToString('o')
        @{ status='cooldown'; last_success=$null; last_failure=$pastTime; failure_reason='rate_limit';
           consecutive_failures=2; cooldown_until=$pastTime } |
            ConvertTo-Json | Set-Content (Join-Path $e.HealthDir 'claude.json')
        Invoke-HealthLoop -Env $e -ClaudeScenario 'succeed' -MaxIter 1 | Out-Null
        $health = Get-HealthFile -HealthDir $e.HealthDir -Provider 'claude'
        $health.status | Should -Be 'healthy'
        $events = Get-HealthLogEvents -LogFile $e.LogFile
        $events | Should -Contain 'provider_recovered'
    }

    It 'round-robin skips active-cooldown provider and selects expired-cooldown provider' {
        $e = New-HealthEnv
        # claude: active cooldown (far future)
        $future = [DateTimeOffset]::UtcNow.AddSeconds(3600).ToString('o')
        @{ status='cooldown'; last_success=$null; last_failure=[DateTimeOffset]::UtcNow.ToString('o');
           failure_reason='rate_limit'; consecutive_failures=3; cooldown_until=$future } |
            ConvertTo-Json | Set-Content (Join-Path $e.HealthDir 'claude.json')
        # codex: expired cooldown (past)
        $past = [DateTimeOffset]::UtcNow.AddSeconds(-10).ToString('o')
        @{ status='cooldown'; last_success=$null; last_failure=$past;
           failure_reason='rate_limit'; consecutive_failures=2; cooldown_until=$past } |
            ConvertTo-Json | Set-Content (Join-Path $e.HealthDir 'codex.json')

        Invoke-HealthLoop -Env $e -CodexScenario 'succeed' -Provider 'round-robin' `
            -RRProviders 'claude,codex' -MaxIter 2 | Out-Null

        # At least one iteration_complete should name 'codex' as the provider
        $logEntries = @(
            Get-Content $e.LogFile |
                ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                Where-Object { $_ -and $_.event -eq 'iteration_complete' }
        )
        $selectedProviders = $logEntries | ForEach-Object { $_.provider }
        $selectedProviders | Should -Contain 'codex'
        $selectedProviders | Should -Not -Contain 'claude'
    }
}

# 4. loop.sh � json_escape behavioral
# ============================================================================
Describe 'loop.sh � json_escape behavioral' {

    BeforeAll {
        $script:bashExeJson = (Get-Command bash -ErrorAction SilentlyContinue)?.Source
        if (-not $script:bashExeJson) { return }

        $loopShPath = Join-Path $PSScriptRoot 'loop.sh'
        $script:loopShJsonBash = & $script:bashExeJson -c "cygpath -u '$(($loopShPath -replace "\\","/"))'" 2>$null
        if (-not $script:loopShJsonBash) {
            $script:loopShJsonBash = ($loopShPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
    }

    It 'escapes \n, \r, \t, \\, \", mixed multiline stderr, and empty input correctly' {
        if (-not $script:bashExeJson) { Set-ItResult -Inconclusive -Message "bash not found"; return }

        $testInput = "Error: multiline output`nLine 2 with `t tab and `r carriage return`r`n\ Backslash \\ and \"Quotes\"`n`tMixed multiline`r`nEnd`n`n"

        $tempInputFile = Join-Path ([IO.Path]::GetTempPath()) ("input-" + [guid]::NewGuid().ToString('N') + ".txt")
        [IO.File]::WriteAllBytes($tempInputFile, [System.Text.Encoding]::UTF8.GetBytes($testInput))

        $tempInputPosix = & $script:bashExeJson -c "cygpath -u '$(($tempInputFile -replace "\\","/"))'" 2>$null
        if (-not $tempInputPosix) {
            $tempInputPosix = ($tempInputFile -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }

        $bashCmd = @"
eval \"$$(sed -n '/^json_escape() {/,/^}/p' '$script:loopShJsonBash')\"
file_contents=\"$$(cat '$tempInputPosix'; printf x)\"
file_contents="\$${file_contents%x}"
json_escape "\$file_contents"
"@
        
        $escapedArray = & $script:bashExeJson -c $bashCmd
        $escaped = $escapedArray -join ""
        
        Remove-Item -Force $tempInputFile -ErrorAction SilentlyContinue

        $escaped | Should -Not -Match "`n"
        $escaped | Should -Not -Match "`t"
        $escaped | Should -Not -Match "`r"
        
        $jsonStr = "{ \"value\": \"$escaped\" }"
        $parsed = $jsonStr | ConvertFrom-Json -ErrorAction Stop
        
        $parsed.value | Should -BeExactly $testInput
    }

    It 'handles empty input correctly' {
        if (-not $script:bashExeJson) { Set-ItResult -Inconclusive -Message "bash not found"; return }

        $bashCmd = @"
eval \"$$(sed -n '/^json_escape() {/,/^}/p' '$script:loopShJsonBash')\"
json_escape ""
"@
        $escapedArray = & $script:bashExeJson -c $bashCmd
        $escaped = $escapedArray -join ""
        
        $jsonStr = "{ \"value\": \"$escaped\" }"
        $parsed = $jsonStr | ConvertFrom-Json -ErrorAction Stop
        $parsed.value | Should -BeExactly ""
    }
}
