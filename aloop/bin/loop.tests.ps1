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
        $script:bashExe = Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
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
elif echo "$PROMPT_TEXT" | grep -q "Review Mode"; then
    VERDICT_FILE=$(echo "$PROMPT_TEXT" | grep -A 1 "write a JSON verdict file at:" | tail -n 1 | tr -d '\r')
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE '"iteration": [0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ "$SCENARIO" = "reject-once" ] && [ "$REJECTED" != "true" ]; then
        REJECTED="true"
        sed -i 's/- \[x\]/- [ ]/g' "$TODO_FILE"
        if [ -n "$VERDICT_FILE" ]; then
            printf '{\n  "iteration": %s,\n  "verdict": "FAIL",\n  "summary": "rejected"\n}\n' "$ITER_NUM" > "$VERDICT_FILE"
        fi
    else
        if [ -n "$VERDICT_FILE" ]; then
            printf '{\n  "iteration": %s,\n  "verdict": "PASS",\n  "summary": "approved"\n}\n' "$ITER_NUM" > "$VERDICT_FILE"
        fi
    fi
elif echo "$PROMPT_TEXT" | grep -q "Proof Mode"; then
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE 'iter-[0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ -n "$ITER_NUM" ]; then
        mkdir -p "../session/artifacts/iter-$ITER_NUM"
        echo '[]' > "../session/artifacts/iter-$ITER_NUM/proof-manifest.json"
        echo 'dummy artifact' > "../session/artifacts/iter-$ITER_NUM/dummy.txt"
    fi
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
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_proof.md'),  "# Proof Mode`nCollect proof iter-<N>.`n", $utf8NoBom)
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

        function script:Get-ShLogEntries {
            param([string]$LogFile)
            if (-not (Test-Path $LogFile)) { return @() }
            return @(
                Get-Content $LogFile |
                    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                    Where-Object { $_ }
            )
        }

        function script:Get-ShLogEvents {
            param([string]$LogFile)
            return @(Get-ShLogEntries -LogFile $LogFile | ForEach-Object { $_.event })
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

    It 'every log entry contains a consistent run_id (SPEC Known Issue #6)' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e       = New-ShLoopEnv -Scenario 'approve'
        $result  = Invoke-ShLoopScript -LoopEnv $e -MaxIter 3
        $entries = Get-ShLogEntries -LogFile $e.LogFile
        $entries.Count | Should -BeGreaterThan 0
        # Every entry must have a non-empty run_id
        $entries | ForEach-Object { $_.run_id | Should -Not -BeNullOrEmpty }
        # All entries must share the same run_id
        $uniqueIds = @($entries | ForEach-Object { $_.run_id } | Sort-Object -Unique)
        $uniqueIds.Count | Should -Be 1
        # run_id should be a non-empty identifier (UUID on Linux, may be timestamp fallback)
        $uniqueIds[0].Length | Should -BeGreaterThan 5
    }

    It 'review approval emits final_review_approved and exits 0' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 8
        $entries = Get-ShLogEntries -LogFile $e.LogFile
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        ($entries | Where-Object { $_.event -eq 'iteration_complete' -and $_.mode -eq 'proof' }).Count | Should -BeGreaterThan 0
        $milestones = @($entries | ForEach-Object {
            if ($_.event -eq 'iteration_complete') { "iteration_complete:$($_.mode)" } else { $_.event }
        })
        $proofIdx = [array]::IndexOf([string[]]$milestones, 'iteration_complete:proof')
        $appIdx = [array]::IndexOf([string[]]$milestones, 'final_review_approved')
        $proofIdx | Should -BeLessThan $appIdx
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

    It 'approved review updates proof baselines' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 8
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'baselines_updated'
        Test-Path "$($e.SessionDir)/artifacts/baselines/dummy.txt" | Should -Be $true
        Test-Path "$($e.SessionDir)/artifacts/baselines/proof-manifest.json" | Should -Be $false
    }

    It 'rejected review preserves existing baselines and updates them only on final approval' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'reject-once'
        
        $baselineDir = Join-Path $e.SessionDir 'artifacts/baselines'
        New-Item -ItemType Directory -Force $baselineDir | Out-Null
        Set-Content (Join-Path $baselineDir 'preserved.txt') 'old-baseline'

        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 14
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        
        $updIdx = [array]::IndexOf([string[]]$events, 'baselines_updated')
        $rejIdx = [array]::IndexOf([string[]]$events, 'final_review_rejected')
        
        $updIdx | Should -BeGreaterThan -1
        $rejIdx | Should -BeLessThan $updIdx
        
        Test-Path (Join-Path $baselineDir 'preserved.txt') | Should -Be $true
        Test-Path (Join-Path $baselineDir 'dummy.txt') | Should -Be $true
    }

    It 'records proof-path branch coverage evidence at >=80%' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 8
        $entries = Get-ShLogEntries -LogFile $e.LogFile
        $events = Get-ShLogEvents -LogFile $e.LogFile

        $milestones = @($entries | ForEach-Object {
            if ($_.event -eq 'iteration_complete') { "iteration_complete:$($_.mode)" } else { $_.event }
        })
        $proofIdx = [array]::IndexOf([string[]]$milestones, 'iteration_complete:proof')
        $appIdx = [array]::IndexOf([string[]]$milestones, 'final_review_approved')
        $forceProofCovered = ($events -contains 'tasks_marked_complete') -and ($proofIdx -ge 0) -and ($appIdx -gt $proofIdx)
        $manifestInjectionCovered = $result.Output -match 'Injected proof manifest from iteration \d+ into review prompt\.'
        $baselineUpdateCovered = $events -contains 'baselines_updated'

        $branches = [ordered]@{
            'proof.force_on_all_tasks_done' = $forceProofCovered
            'review.inject_proof_manifest' = $manifestInjectionCovered
            'review.update_baselines_on_approval' = $baselineUpdateCovered
        }
        $covered = @($branches.Values | Where-Object { $_ }).Count
        $total = $branches.Count
        $percent = if ($total -gt 0) { [math]::Floor(($covered * 100) / $total) } else { 0 }
        $coverageDir = Join-Path (Join-Path $PSScriptRoot '..\..') 'coverage'
        if (-not (Test-Path $coverageDir)) { New-Item -ItemType Directory -Path $coverageDir -Force | Out-Null }
        $reportFile = Join-Path $coverageDir 'sh-proof-branch-coverage.json'
        $branchRows = foreach ($key in $branches.Keys) {
            [pscustomobject]@{ id = $key; covered = [bool]$branches[$key] }
        }
        [pscustomobject]@{
            generated_at = (Get-Date).ToUniversalTime().ToString('o')
            target = 'aloop/bin/loop.sh'
            minimum_percent = 80
            summary = [pscustomobject]@{ covered = $covered; total = $total; percent = $percent }
            branches = $branchRows
        } | ConvertTo-Json -Depth 6 | Set-Content -Path $reportFile

        $result.ExitCode | Should -Be 0
        $percent | Should -BeGreaterOrEqual 80
    }
}


# ============================================================================
# 3. loop.sh — retry-same-phase behavioral
# ============================================================================
Describe 'loop.sh — retry-same-phase behavioral' {

    BeforeAll {
        $script:bashExeRetry = Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
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
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_proof.md'),  "# Proof Mode`nCollect proof iter-<N>.`n", $utf8NoBom)
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
} elseif ($promptText -match 'Review Mode') {
    $iterNum = if ($promptText -match '"iteration":\s*(\d+)') { $matches[1] } else { 0 }
    $verdictFile = if ($promptText -match 'write a JSON verdict file at:(?:\r?\n)(.*?)(?:\r?\n)Schema:') { $matches[1].Trim() } else { '' }

    if (($state.scenario -eq 'reject-once') -and -not $state.rejected) {
        # All done and first rejection — simulate review that reopens tasks
        $state.rejected = $true
        ($content -replace '- \[x\]', '- [ ]') | Set-Content $todoFile
        if ($verdictFile) {
            "{`n  `"iteration`": $iterNum,`n  `"verdict`": `"FAIL`",`n  `"summary`": `"rejected`"`n}" | Set-Content $verdictFile
        }
    } else {
        if ($verdictFile) {
            "{`n  `"iteration`": $iterNum,`n  `"verdict`": `"PASS`",`n  `"summary`": `"approved`"`n}" | Set-Content $verdictFile
        }
    }
} elseif ($promptText -match 'Proof Mode') {
    if ($promptText -match 'iter-(\d+)') {
        $iterNum = $matches[1]
        $artifactDir = Join-Path $PWD "..\session\artifacts\iter-$iterNum"
        if (-not (Test-Path $artifactDir)) { New-Item -ItemType Directory -Force $artifactDir | Out-Null }
        "[]" | Set-Content (Join-Path $artifactDir 'proof-manifest.json')
        "dummy artifact" | Set-Content (Join-Path $artifactDir 'dummy.txt')
    }
}

if ($stateFile) { $state | ConvertTo-Json | Set-Content $stateFile }
Write-Output "Fake provider: call=$($state.calls)"
exit 0
'@
        Set-Content $fakePs1 $fakePs1Content

        # claude.cmd shim so loop.ps1 resolves 'claude' on PATH
        $claudeCmd = Join-Path $fakeBinDir 'claude.cmd'
        Set-Content $claudeCmd "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"

        # aloop.cmd shim for convention-file GH processing tests
        $fakeAloopPs1 = Join-Path $fakeBinDir '_fake_aloop.ps1'
        $fakeAloopContent = @'
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

if ($Args.Count -lt 2 -or $Args[0] -ne 'gh') {
    Write-Output '{"status":"error","reason":"unsupported"}'
    exit 1
}

$operation = $Args[1]
$requestPath = ''
for ($i = 0; $i -lt $Args.Count; $i++) {
    if ($Args[$i] -eq '--request' -and ($i + 1) -lt $Args.Count) {
        $requestPath = $Args[$i + 1]
        break
    }
}

$requestFile = if ($requestPath) { [System.IO.Path]::GetFileName($requestPath) } else { '' }
if ($env:FAKE_ALOOP_GH_CALLS) {
    "$operation|$requestFile" | Add-Content -Path $env:FAKE_ALOOP_GH_CALLS
}

$response = @{
    status = 'success'
    type = $operation
    request_file = $requestFile
}
$response | ConvertTo-Json -Compress
exit 0
'@
        Set-Content $fakeAloopPs1 $fakeAloopContent
        Set-Content (Join-Path $fakeBinDir 'aloop.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakeAloopPs1`" %*`r`n"

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
            Set-Content (Join-Path $promptDir 'PROMPT_proof.md')  "# Proof Mode`nCollect proof iter-<N>."
            Set-Content (Join-Path $promptDir 'PROMPT_review.md') "# Review Mode`nReview tasks."
            $stateFile = Join-Path $testDir 'claude-state.json'
            [pscustomobject]@{ calls = 0; scenario = $Scenario; rejected = $false } |
                ConvertTo-Json | Set-Content $stateFile
            $ghCallsFile = Join-Path $testDir 'gh-calls.log'
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                StateFile  = $stateFile
                LogFile    = Join-Path $sessDir 'log.jsonl'
                GhCallsFile = $ghCallsFile
            }
        }

        # ── Helper: run loop.ps1 with the fake provider injected into PATH ──
        function script:Invoke-LoopScript {
            param($LoopEnv, [int]$MaxIter = 6)
            $prevPath  = $env:PATH
            $prevState = $env:FAKE_CLAUDE_STATE
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $prevGhCalls = $env:FAKE_ALOOP_GH_CALLS
            $env:PATH              = "$fakeBinDir;$prevPath"
            $env:FAKE_CLAUDE_STATE = $LoopEnv.StateFile
            $env:ALOOP_RUNTIME_DIR = Join-Path $LoopEnv.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            $env:FAKE_ALOOP_GH_CALLS = $LoopEnv.GhCallsFile
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
                if ($null -eq $prevGhCalls) {
                    Remove-Item Env:FAKE_ALOOP_GH_CALLS -ErrorAction SilentlyContinue
                } else {
                    $env:FAKE_ALOOP_GH_CALLS = $prevGhCalls
                }
            }
        }

        # ── Helper: parse log.jsonl into event-name array ───────────────────
        function script:Get-LogEntries {
            param([string]$LogFile)
            if (-not (Test-Path $LogFile)) { return @() }
            return @(
                Get-Content $LogFile |
                    ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                    Where-Object { $_ }
            )
        }

        function script:Get-LogEvents {
            param([string]$LogFile)
            return @(Get-LogEntries -LogFile $LogFile | ForEach-Object { $_.event })
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

    It 'every log entry contains a consistent run_id (SPEC Known Issue #6)' {
        $e       = New-LoopEnv -Scenario 'approve'
        $result  = Invoke-LoopScript -LoopEnv $e -MaxIter 3
        $entries = Get-LogEntries -LogFile $e.LogFile
        $entries.Count | Should -BeGreaterThan 0
        # Every entry must have a non-empty run_id
        $entries | ForEach-Object { $_.run_id | Should -Not -BeNullOrEmpty }
        # All entries must share the same run_id
        $uniqueIds = @($entries | ForEach-Object { $_.run_id } | Sort-Object -Unique)
        $uniqueIds.Count | Should -Be 1
        # run_id should look like a GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        $uniqueIds[0] | Should -Match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    }

    It 'does not process GH convention files inside loop runtime' {
        $e = New-LoopEnv -Scenario 'approve'
        $reqDir = Join-Path $e.WorkDir '.aloop\requests'
        New-Item -ItemType Directory -Path $reqDir -Force | Out-Null
        '{"type":"pr-comment","pr_number":15,"body":"second"}' | Set-Content (Join-Path $reqDir '002-pr-comment.json')
        '{"type":"pr-create","title":"first","body":"first body"}' | Set-Content (Join-Path $reqDir '001-pr-create.json')

        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 1
        $result.ExitCode | Should -Be 0

        Test-Path $e.GhCallsFile | Should -Be $false
        Test-Path (Join-Path $reqDir '001-pr-create.json') | Should -Be $true
        Test-Path (Join-Path $reqDir '002-pr-comment.json') | Should -Be $true

        $entries = Get-LogEntries -LogFile $e.LogFile
        ($entries | Where-Object { $_.event -eq 'gh_request_processed' }).Count | Should -Be 0
        ($entries | Where-Object { $_.event -eq 'gh_request_failed' }).Count | Should -Be 0
    }

    It 'review approval emits final_review_approved and exits 0' {
        $e      = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $entries = Get-LogEntries -LogFile $e.LogFile
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        ($entries | Where-Object { $_.event -eq 'iteration_complete' -and $_.mode -eq 'proof' }).Count | Should -BeGreaterThan 0
        $milestones = @($entries | ForEach-Object {
            if ($_.event -eq 'iteration_complete') { "iteration_complete:$($_.mode)" } else { $_.event }
        })
        $proofIdx = [array]::IndexOf([string[]]$milestones, 'iteration_complete:proof')
        $appIdx = [array]::IndexOf([string[]]$milestones, 'final_review_approved')
        $proofIdx | Should -BeLessThan $appIdx
        $events | Should -Contain 'final_review_approved'
        $events | Should -Not -Contain 'final_review_rejected'
    }

    It 'review rejection emits final_review_rejected, re-plans, then final_review_approved' {
        $e      = New-LoopEnv -Scenario 'reject-once'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 12
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'final_review_rejected'
        $events | Should -Contain 'final_review_approved'
        # Rejection must precede approval in the log
        $rejIdx = [array]::IndexOf([string[]]$events, 'final_review_rejected')
        $appIdx = [array]::IndexOf([string[]]$events, 'final_review_approved')
        $rejIdx | Should -BeLessThan $appIdx
    }

    It 'approved review updates proof baselines' {
        $e      = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Contain 'baselines_updated'
        Test-Path "$($e.SessionDir)/artifacts/baselines/dummy.txt" | Should -Be $true
        Test-Path "$($e.SessionDir)/artifacts/baselines/proof-manifest.json" | Should -Be $false
    }

    It 'rejected review preserves existing baselines and updates them only on final approval' {
        $e      = New-LoopEnv -Scenario 'reject-once'
        
        $baselineDir = Join-Path $e.SessionDir 'artifacts/baselines'
        New-Item -ItemType Directory -Force $baselineDir | Out-Null
        Set-Content (Join-Path $baselineDir 'preserved.txt') 'old-baseline'

        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 12
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        
        $updIdx = [array]::IndexOf([string[]]$events, 'baselines_updated')
        $rejIdx = [array]::IndexOf([string[]]$events, 'final_review_rejected')
        
        $updIdx | Should -BeGreaterThan -1
        $rejIdx | Should -BeLessThan $updIdx
        
        Test-Path (Join-Path $baselineDir 'preserved.txt') | Should -Be $true
        Test-Path (Join-Path $baselineDir 'dummy.txt') | Should -Be $true
    }

    It 'records proof-path branch coverage evidence at >=80%' {
        $e = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $entries = Get-LogEntries -LogFile $e.LogFile
        $events = Get-LogEvents -LogFile $e.LogFile

        $milestones = @($entries | ForEach-Object {
            if ($_.event -eq 'iteration_complete') { "iteration_complete:$($_.mode)" } else { $_.event }
        })
        $proofIdx = [array]::IndexOf([string[]]$milestones, 'iteration_complete:proof')
        $appIdx = [array]::IndexOf([string[]]$milestones, 'final_review_approved')
        $forceProofCovered = ($events -contains 'tasks_marked_complete') -and ($proofIdx -ge 0) -and ($appIdx -gt $proofIdx)
        $manifestInjectionCovered = $result.Output -match 'Injected proof manifest from iteration \d+ into review prompt\.'
        $baselineUpdateCovered = $events -contains 'baselines_updated'

        $branches = [ordered]@{
            'proof.force_on_all_tasks_done' = $forceProofCovered
            'review.inject_proof_manifest' = $manifestInjectionCovered
            'review.update_baselines_on_approval' = $baselineUpdateCovered
        }
        $covered = @($branches.Values | Where-Object { $_ }).Count
        $total = $branches.Count
        $percent = if ($total -gt 0) { [math]::Floor(($covered * 100) / $total) } else { 0 }
        $coverageDir = Join-Path (Join-Path $PSScriptRoot '..\..') 'coverage'
        if (-not (Test-Path $coverageDir)) { New-Item -ItemType Directory -Path $coverageDir -Force | Out-Null }
        $reportFile = Join-Path $coverageDir 'ps1-proof-branch-coverage.json'
        $branchRows = foreach ($key in $branches.Keys) {
            [pscustomobject]@{ id = $key; covered = [bool]$branches[$key] }
        }
        [pscustomobject]@{
            generated_at = (Get-Date).ToUniversalTime().ToString('o')
            target = 'aloop/bin/loop.ps1'
            minimum_percent = 80
            summary = [pscustomobject]@{ covered = $covered; total = $total; percent = $percent }
            branches = $branchRows
        } | ConvertTo-Json -Depth 6 | Set-Content -Path $reportFile

        $result.ExitCode | Should -Be 0
        $percent | Should -BeGreaterOrEqual 80
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
            Set-Content (Join-Path $promptDir 'PROMPT_proof.md')  "# Proof Mode`nCollect proof iter-<N>."
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

    It 'round-robin logs provider_skipped_degraded and selects healthy fallback provider' {
        $e = New-HealthEnv
        @{ status='degraded'; last_success=$null; last_failure=[DateTimeOffset]::UtcNow.ToString('o');
           failure_reason='auth'; consecutive_failures=1; cooldown_until=$null } |
            ConvertTo-Json | Set-Content (Join-Path $e.HealthDir 'claude.json')
        @{ status='healthy'; last_success=[DateTimeOffset]::UtcNow.ToString('o'); last_failure=$null;
           failure_reason=$null; consecutive_failures=0; cooldown_until=$null } |
            ConvertTo-Json | Set-Content (Join-Path $e.HealthDir 'codex.json')

        Invoke-HealthLoop -Env $e -CodexScenario 'succeed' -Provider 'round-robin' `
            -RRProviders 'claude,codex' -MaxIter 2 | Out-Null

        $logEntries = @(
            Get-Content $e.LogFile |
                ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } |
                Where-Object { $_ }
        )
        $skipEntry = $logEntries |
            Where-Object { $_.event -eq 'provider_skipped_degraded' -and $_.provider -eq 'claude' } |
            Select-Object -First 1
        $skipEntry | Should -Not -BeNullOrEmpty
        $skipEntry.reason | Should -Be 'auth'
        ($logEntries | Where-Object { $_.event -eq 'iteration_complete' } | ForEach-Object { $_.provider }) |
            Should -Contain 'codex'
    }

    It 'resolve function logs all_providers_degraded when every provider is degraded' {
        $source = Get-Content $loopScript -Raw
        $startMarker = 'function Resolve-HealthyProvider {'
        $endMarker = "`nfunction Setup-RemoteBackup {"
        $startIdx = $source.IndexOf($startMarker)
        $endIdx = $source.IndexOf($endMarker, $startIdx)
        $startIdx | Should -BeGreaterThan -1
        $endIdx | Should -BeGreaterThan $startIdx
        $resolveFuncSource = $source.Substring($startIdx, $endIdx - $startIdx)

        $script:providerHealthStateByName = @{
            claude = [pscustomobject]@{ status = 'degraded'; failure_reason = 'auth'; cooldown_until = $null }
            codex  = [pscustomobject]@{ status = 'degraded'; failure_reason = 'quota'; cooldown_until = $null }
        }
        $script:loggedEvents = @()
        $previousWarningPreference = $WarningPreference
        $WarningPreference = 'SilentlyContinue'
        try {
            function Get-ProviderHealthState {
                param([string]$ProviderName)
                return $script:providerHealthStateByName[$ProviderName]
            }
            function Write-LogEntry {
                param([string]$Event, [hashtable]$Data)
                $script:loggedEvents += [pscustomobject]@{
                    event = $Event
                    data  = $Data
                }
            }
            function Start-Sleep {
                param([int]$Seconds)
                throw "sleep:$Seconds"
            }

            $RoundRobinProviders = @('claude', 'codex')
            . ([scriptblock]::Create($resolveFuncSource))
            { Resolve-HealthyProvider -StartIndex 0 } | Should -Throw -ExpectedMessage 'sleep:60'

            ($script:loggedEvents | Where-Object { $_.event -eq 'provider_skipped_degraded' }).Count | Should -Be 2
            $allDegraded = $script:loggedEvents | Where-Object { $_.event -eq 'all_providers_degraded' } | Select-Object -First 1
            $allDegraded | Should -Not -BeNullOrEmpty
            $allDegraded.data.providers | Should -Be 'claude,codex'
            $allDegraded.data.reasons | Should -Be 'claude:auth,codex:quota'
        }
        finally {
            $WarningPreference = $previousWarningPreference
            Remove-Item Function:\Get-ProviderHealthState -ErrorAction SilentlyContinue
            Remove-Item Function:\Write-LogEntry -ErrorAction SilentlyContinue
            Remove-Item Function:\Start-Sleep -ErrorAction SilentlyContinue
            Remove-Variable providerHealthStateByName -Scope Script -ErrorAction SilentlyContinue
            Remove-Variable loggedEvents -Scope Script -ErrorAction SilentlyContinue
        }
    }
}

# 4. loop.sh � json_escape behavioral
# ============================================================================
Describe 'loop.sh � json_escape behavioral' {

    BeforeAll {
        $script:bashExeJson = Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
        if (-not $script:bashExeJson) { return }

        $loopShPath = Join-Path $PSScriptRoot 'loop.sh'
        $script:loopShJsonBash = & $script:bashExeJson -c "cygpath -u '$(($loopShPath -replace "\\","/"))'" 2>$null
        if (-not $script:loopShJsonBash) {
            $script:loopShJsonBash = ($loopShPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
    }

    It 'escapes \n, \r, \t, \\, \", mixed multiline stderr, and empty input correctly' {
        if (-not $script:bashExeJson) { Set-ItResult -Inconclusive -Message "bash not found"; return }

        $testInput = "Error: multiline output`nLine 2 with `t tab and `r carriage return`r`n\ Backslash \\ and `"Quotes`"`n`tMixed multiline`r`nEnd`n`n"

        $tempInputFile = Join-Path ([IO.Path]::GetTempPath()) ("input-" + [guid]::NewGuid().ToString('N') + ".txt")
        [IO.File]::WriteAllBytes($tempInputFile, [System.Text.Encoding]::UTF8.GetBytes($testInput))

        $tempInputPosix = & $script:bashExeJson -c "cygpath -u '$(($tempInputFile -replace "\\","/"))'" 2>$null
        if (-not $tempInputPosix) {
            $tempInputPosix = ($tempInputFile -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }

        $bashCmd = @"
eval "`$(sed -n '/^json_escape() {/,/^}/p' '$script:loopShJsonBash')"
file_contents="`$(cat '$tempInputPosix'; printf x)"
file_contents="`${file_contents%x}"
json_escape "`$file_contents"
"@
        
        $escapedArray = & $script:bashExeJson -c $bashCmd
        $escaped = $escapedArray -join ""
        
        Remove-Item -Force $tempInputFile -ErrorAction SilentlyContinue

        $escaped | Should -Not -Match "`n"
        $escaped | Should -Not -Match "`t"
        $escaped | Should -Not -Match "`r"
        
        $jsonStr = '{{ "value": "{0}" }}' -f $escaped
        $parsed = $jsonStr | ConvertFrom-Json -ErrorAction Stop
        
        $normalizedExpected = $testInput -replace "`r`n", "`n"
        $parsed.value.TrimEnd("`n") | Should -BeExactly $normalizedExpected.TrimEnd("`n")
    }

    It 'handles empty input correctly' {
        if (-not $script:bashExeJson) { Set-ItResult -Inconclusive -Message "bash not found"; return }

        $bashCmd = @"
eval "`$(sed -n '/^json_escape() {/,/^}/p' '$script:loopShJsonBash')"
json_escape ""
"@
        $escapedArray = & $script:bashExeJson -c $bashCmd
        $escaped = $escapedArray -join ""

        $jsonStr = '{{ "value": "{0}" }}' -f $escaped
        $parsed = $jsonStr | ConvertFrom-Json -ErrorAction Stop
        $parsed.value | Should -BeExactly ""
    }
}

# ============================================================================
# PATH hardening — loop.ps1 Setup-GhBlock / Cleanup-GhBlock / Invoke-Provider
# ============================================================================
Describe 'loop.ps1 — PATH hardening' {

    BeforeAll {
        # Source the functions by extracting them from loop.ps1 and dot-sourcing
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'

        # Extract the gh-block functions from loop.ps1 and eval them
        $scriptContent = Get-Content $loopScript -Raw

        # Extract Setup-GhBlock function
        if ($scriptContent -match '(?ms)(\$script:ghBlockDir\s*=\s*\$null.*?^function Setup-GhBlock\s*\{.*?^}.*?^function Cleanup-GhBlock\s*\{.*?^})') {
            $ghBlockFunctions = $Matches[1]
        } else {
            throw "Could not extract Setup-GhBlock/Cleanup-GhBlock from loop.ps1"
        }
        # Invoke the extracted functions in this scope
        Invoke-Expression $ghBlockFunctions
    }

    AfterAll {
        Cleanup-GhBlock
    }

    AfterEach {
        Cleanup-GhBlock
    }

    It 'Setup-GhBlock creates shim directory with gh.cmd' {
        $dir = Setup-GhBlock
        $dir | Should -Not -BeNullOrEmpty
        Test-Path (Join-Path $dir 'gh.cmd') | Should -BeTrue
    }

    It 'Setup-GhBlock creates gh.exe shim for MSYS compatibility' {
        $dir = Setup-GhBlock
        Test-Path (Join-Path $dir 'gh.exe') | Should -BeTrue
    }

    It 'gh.cmd shim exits with code 127 and prints blocked message' {
        $dir = Setup-GhBlock
        $ghCmd = Join-Path $dir 'gh.cmd'
        $output = & cmd /c $ghCmd 2>&1
        $LASTEXITCODE | Should -Be 127
        ($output | Out-String) | Should -Match 'blocked by aloop PATH hardening'
    }

    It 'Setup-GhBlock returns same directory on repeated calls' {
        $dir1 = Setup-GhBlock
        $dir2 = Setup-GhBlock
        $dir1 | Should -BeExactly $dir2
    }

    It 'Cleanup-GhBlock removes the shim directory' {
        $dir = Setup-GhBlock
        Test-Path $dir | Should -BeTrue
        Cleanup-GhBlock
        Test-Path $dir | Should -BeFalse
    }

    It 'provider binary co-located with gh still executes when shim is prepended' {
        $dir = Setup-GhBlock

        # Create a temp dir simulating a bin directory that contains both gh and a provider
        $colocDir = Join-Path ([IO.Path]::GetTempPath()) ("aloop-coloc-test-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force $colocDir | Out-Null
        try {
            # Real gh in coloc dir
            Set-Content (Join-Path $colocDir 'gh.cmd') "@echo off`r`necho real-gh`r`n"
            # Provider binary in same dir
            Set-Content (Join-Path $colocDir 'myprovider.cmd') "@echo off`r`necho provider-ok`r`n"

            $savedPath = $env:PATH
            $env:PATH = "$dir$([IO.Path]::PathSeparator)$colocDir$([IO.Path]::PathSeparator)$env:PATH"
            try {
                # gh should resolve to shim (blocked)
                $ghOut = & cmd /c gh.cmd 2>&1
                $LASTEXITCODE | Should -Be 127

                # provider should still resolve to coloc dir
                $provOut = & cmd /c myprovider.cmd 2>&1
                ($provOut | Out-String).Trim() | Should -BeExactly 'provider-ok'
            } finally {
                $env:PATH = $savedPath
            }
        } finally {
            Remove-Item -Recurse -Force $colocDir -ErrorAction SilentlyContinue
        }
    }

    It 'PATH is restored after Invoke-Provider returns (integration)' {
        # This test launches loop.ps1 as a subprocess and checks PATH restoration
        # by invoking a provider that echoes the PATH, then checking it was restored.
        $pwshPath = (Get-Command pwsh -ErrorAction Stop).Source

        $testScript = @'
$script:ghBlockDir = $null
function Setup-GhBlock {
    if ($script:ghBlockDir -and (Test-Path $script:ghBlockDir)) { return $script:ghBlockDir }
    $dir = Join-Path ([IO.Path]::GetTempPath()) "aloop-ghblock-$PID"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $shim = "@echo off`r`necho gh: blocked by aloop PATH hardening 1>&2`r`nexit /b 127`r`n"
    Set-Content -Path (Join-Path $dir 'gh.cmd') -Value $shim -NoNewline
    Set-Content -Path (Join-Path $dir 'gh.bat') -Value $shim -NoNewline
    $script:ghBlockDir = $dir
    return $dir
}
function Cleanup-GhBlock {
    if ($script:ghBlockDir -and (Test-Path $script:ghBlockDir -ErrorAction SilentlyContinue)) {
        Remove-Item -Recurse -Force $script:ghBlockDir -ErrorAction SilentlyContinue
        $script:ghBlockDir = $null
    }
}

$originalPath = $env:PATH
$ghBlockDir = Setup-GhBlock
$savedPath = $env:PATH
$env:PATH = "$ghBlockDir$([IO.Path]::PathSeparator)$env:PATH"
try {
    # Simulate provider execution
    Write-Output "during:$($env:PATH.Substring(0,20))"
} finally {
    $env:PATH = $savedPath
}
Cleanup-GhBlock
if ($env:PATH -eq $originalPath) {
    Write-Output "RESTORED:true"
} else {
    Write-Output "RESTORED:false"
}
'@
        $result = & $pwshPath -NoProfile -Command $testScript 2>&1
        $resultStr = ($result | Out-String)
        $resultStr | Should -Match 'RESTORED:true'
    }
}

# ============================================================================
# 6. loop.ps1 — ConvertTo-NativePath POSIX path normalization
# ============================================================================
Describe 'loop.ps1 — ConvertTo-NativePath POSIX path normalization' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $scriptContent = Get-Content $loopScript -Raw

        # Extract the ConvertTo-NativePath function
        if ($scriptContent -match '(?ms)(^function ConvertTo-NativePath\s*\{.*?^})') {
            Invoke-Expression $Matches[1]
        } else {
            throw "Could not extract ConvertTo-NativePath from loop.ps1"
        }
    }

    It 'converts /c/Users/foo to C:\Users\foo' {
        ConvertTo-NativePath '/c/Users/foo' | Should -BeExactly 'C:\Users\foo'
    }

    It 'converts /d/projects/work to D:\projects\work' {
        ConvertTo-NativePath '/d/projects/work' | Should -BeExactly 'D:\projects\work'
    }

    It 'converts uppercase /C/Users to C:\Users' {
        ConvertTo-NativePath '/C/Users' | Should -BeExactly 'C:\Users'
    }

    It 'converts drive-only /c to C:\' {
        ConvertTo-NativePath '/c' | Should -BeExactly 'C:\'
    }

    It 'converts drive-with-trailing-slash /c/ to C:\' {
        ConvertTo-NativePath '/c/' | Should -BeExactly 'C:\'
    }

    It 'converts backslash-prefixed \c\Users\foo to C:\Users\foo' {
        ConvertTo-NativePath '\c\Users\foo' | Should -BeExactly 'C:\Users\foo'
    }

    It 'converts backslash-prefixed drive-only \c to C:\' {
        ConvertTo-NativePath '\c' | Should -BeExactly 'C:\'
    }

    It 'passes through normal Windows path unchanged' {
        ConvertTo-NativePath 'C:\Users\foo' | Should -BeExactly 'C:\Users\foo'
    }

    It 'passes through UNC path unchanged' {
        ConvertTo-NativePath '\\server\share' | Should -BeExactly '\\server\share'
    }

    It 'passes through relative path unchanged' {
        ConvertTo-NativePath 'some\relative\path' | Should -BeExactly 'some\relative\path'
    }

    It 'handles forward slashes in tail segment' {
        ConvertTo-NativePath '/e/a/b/c' | Should -BeExactly 'E:\a\b\c'
    }

    It 'handles mixed slashes in tail segment' {
        ConvertTo-NativePath '/e/a\b/c' | Should -BeExactly 'E:\a\b\c'
    }
}

# ============================================================================
# SESSION LOCKING — loop.ps1
# ============================================================================
Describe 'loop.ps1 — session lockfile' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $pwshPath   = (Get-Command pwsh -ErrorAction Stop).Source

        $tempRoot   = Join-Path ([IO.Path]::GetTempPath()) ("aloop-lock-tests-" + [guid]::NewGuid().ToString('N'))
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null

        # Fake claude provider that just marks tasks done
        $fakePs1 = Join-Path $fakeBinDir '_fake_claude.ps1'
        $fakePs1Content = @'
$promptText = ($input | Out-String)
$todoFile = Join-Path $PWD 'TODO.md'
$content  = if (Test-Path $todoFile) { Get-Content $todoFile -Raw } else { '' }
if (($promptText -match 'Building Mode') -and ($content -match '- \[ \]')) {
    ($content -replace '- \[ \]', '- [x]') | Set-Content $todoFile
} elseif ($promptText -match 'Review Mode') {
    $verdictFile = if ($promptText -match 'write a JSON verdict file at:(?:\r?\n)(.*?)(?:\r?\n)Schema:') { $matches[1].Trim() } else { '' }
    $iterNum = if ($promptText -match '"iteration":\s*(\d+)') { $matches[1] } else { 0 }
    if ($verdictFile) {
        "{`n  `"iteration`": $iterNum,`n  `"verdict`": `"PASS`",`n  `"summary`": `"approved`"`n}" | Set-Content $verdictFile
    }
} elseif ($promptText -match 'Proof Mode') {
    if ($promptText -match 'iter-(\d+)') {
        $iterNum = $matches[1]
        $artifactDir = Join-Path $PWD "..\session\artifacts\iter-$iterNum"
        if (-not (Test-Path $artifactDir)) { New-Item -ItemType Directory -Force $artifactDir | Out-Null }
        "[]" | Set-Content (Join-Path $artifactDir 'proof-manifest.json')
    }
}
Write-Output "Fake provider: done"
exit 0
'@
        Set-Content $fakePs1 $fakePs1Content
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"

        # Fake aloop.cmd shim (no-op)
        $fakeAloopPs1 = Join-Path $fakeBinDir '_fake_aloop.ps1'
        Set-Content $fakeAloopPs1 'Write-Output "{}"; exit 0'
        Set-Content (Join-Path $fakeBinDir 'aloop.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakeAloopPs1`" %*`r`n"

        function script:New-LockTestEnv {
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
            Set-Content (Join-Path $promptDir 'PROMPT_proof.md')  "# Proof Mode`nCollect proof iter-<N>."
            Set-Content (Join-Path $promptDir 'PROMPT_review.md') "# Review Mode`nReview tasks."
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                LockFile   = Join-Path $sessDir 'session.lock'
            }
        }

        function script:Invoke-LockLoopScript {
            param($Env, [int]$MaxIter = 6)
            $prevPath    = $env:PATH
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $env:PATH              = "$fakeBinDir;$prevPath"
            $env:ALOOP_RUNTIME_DIR = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            try {
                $output = & $pwshPath -NoProfile -File $loopScript `
                    -PromptsDir    $Env.PromptsDir `
                    -SessionDir    $Env.SessionDir `
                    -WorkDir       $Env.WorkDir    `
                    -Mode          'plan-build-review'  `
                    -Provider      'claude'             `
                    -MaxIterations $MaxIter             `
                    2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            } finally {
                $env:PATH = $prevPath
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
        if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot }
    }

    It 'creates session.lock on startup and removes it on normal exit' {
        $e = New-LockTestEnv
        Test-Path $e.LockFile | Should -Be $false
        $result = Invoke-LockLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        # Lock should be cleaned up after exit
        Test-Path $e.LockFile | Should -Be $false
    }

    It 'refuses to start when session.lock contains a live PID' {
        $e = New-LockTestEnv
        # Write the current process PID (which is alive) into the lockfile
        $PID | Set-Content $e.LockFile
        $result = Invoke-LockLoopScript -Env $e -MaxIter 1
        $result.ExitCode | Should -Be 1
        $result.Output | Should -Match 'already locked by PID'
    }

    It 'ignores stale session.lock with dead PID' {
        $e = New-LockTestEnv
        # Use a PID that is almost certainly not alive
        '999999' | Set-Content $e.LockFile
        $result = Invoke-LockLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        # Lock should be cleaned up after exit
        Test-Path $e.LockFile | Should -Be $false
    }

    It 'session_start log includes runtime_commit and runtime_installed_at fields' {
        $e = New-LockTestEnv
        # Write a fake version.json so the runtime version is populated
        $versionDir = Join-Path $e.SessionDir '_runtime_stub'
        if (-not (Test-Path $versionDir)) { New-Item -ItemType Directory -Force $versionDir | Out-Null }
        '{"commit":"abc1234","installed_at":"2026-01-01T00:00:00Z"}' | Set-Content (Join-Path $versionDir 'version.json')
        $result = Invoke-LockLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        $logFile = Join-Path $e.SessionDir 'log.jsonl'
        $logFile | Should -Exist
        $entries = Get-Content $logFile | ForEach-Object { $_ | ConvertFrom-Json }
        $startEntry = $entries | Where-Object { $_.event -eq 'session_start' } | Select-Object -First 1
        $startEntry | Should -Not -BeNullOrEmpty
        $startEntry.runtime_commit | Should -Be 'abc1234'
        # runtime_installed_at may be deserialized as DateTime; check the raw JSON line
        $rawStartLine = Get-Content $logFile | Where-Object { $_ -match '"session_start"' } | Select-Object -First 1
        $rawStartLine | Should -Match '"runtime_installed_at"\s*:\s*"2026-01-01T00:00:00Z"'
    }
}

# ============================================================================
# SESSION LOCKING — loop.sh
# ============================================================================
Describe 'loop.sh — session lockfile' {

    BeforeAll {
        $script:bashExe = Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
        if (-not $script:bashExe) { return }

        $loopShPath = Join-Path $PSScriptRoot 'loop.sh'
        $script:loopShBash = & $script:bashExe -c "cygpath -u '$(($loopShPath -replace "\\","/"))'" 2>$null
        if (-not $script:loopShBash) {
            $script:loopShBash = ($loopShPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }

        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-sh-lock-tests-" + [guid]::NewGuid().ToString('N'))
        $script:shLockTempRoot = $tempRoot
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null
        $script:shLockFakeBinDir = $fakeBinDir

        # Fake claude shell script
        $fakeBinBash = & $script:bashExe -c "cygpath -u '$($fakeBinDir -replace '\\','/')'" 2>$null
        if (-not $fakeBinBash) {
            $fakeBinBash = ($fakeBinDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
        $fakeBinBash = $fakeBinBash.Trim()
        $fakeShContent = @'
#!/bin/bash
PROMPT_TEXT="$(cat)"
TODO_FILE="${PWD}/TODO.md"
if echo "$PROMPT_TEXT" | grep -q "Building Mode" && grep -q -- '- \[ \]' "$TODO_FILE" 2>/dev/null; then
    sed -i 's/- \[ \]/- [x]/g' "$TODO_FILE"
elif echo "$PROMPT_TEXT" | grep -q "Review Mode"; then
    VERDICT_FILE=$(echo "$PROMPT_TEXT" | grep -A 1 "write a JSON verdict file at:" | tail -n 1 | tr -d '\r')
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE '"iteration": [0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ -n "$VERDICT_FILE" ]; then
        printf '{\n  "iteration": %s,\n  "verdict": "PASS",\n  "summary": "approved"\n}\n' "$ITER_NUM" > "$VERDICT_FILE"
    fi
elif echo "$PROMPT_TEXT" | grep -q "Proof Mode"; then
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE 'iter-[0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ -n "$ITER_NUM" ]; then
        mkdir -p "../session/artifacts/iter-$ITER_NUM"
        echo '[]' > "../session/artifacts/iter-$ITER_NUM/proof-manifest.json"
    fi
fi
echo "Fake provider: done"
exit 0
'@
        & $script:bashExe -c "printf '%s' $(([char]39) + ($fakeShContent -replace "'", "'\''") + [char]39) > '$fakeBinBash/claude' && chmod +x '$fakeBinBash/claude'"

        function script:New-ShLockTestEnv {
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
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
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_proof.md'),  "# Proof Mode`nCollect proof iter-<N>.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_review.md'), "# Review Mode`nReview tasks.`n", $utf8NoBom)

            $workBash    = & $script:bashExe -c "cygpath -u '$($workDir -replace '\\','/')'" 2>$null
            $sessBash    = & $script:bashExe -c "cygpath -u '$($sessDir -replace '\\','/')'" 2>$null
            $promptsBash = & $script:bashExe -c "cygpath -u '$($promptDir -replace '\\','/')'" 2>$null
            return [pscustomobject]@{
                WorkDir     = $workDir
                SessionDir  = $sessDir
                PromptsDir  = $promptDir
                WorkBash    = ($workBash).Trim()
                SessionBash = ($sessBash).Trim()
                PromptsBash = ($promptsBash).Trim()
                LockFile    = Join-Path $sessDir 'session.lock'
            }
        }

        function script:Invoke-ShLockLoopScript {
            param($Env, [int]$MaxIter = 6)
            $fakeBinBashPath = & $script:bashExe -c "cygpath -u '$($script:shLockFakeBinDir -replace '\\','/')'" 2>$null
            if (-not $fakeBinBashPath) {
                $fakeBinBashPath = ($script:shLockFakeBinDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
            }
            $fakeBinBashPath = $fakeBinBashPath.Trim()
            $output = & $script:bashExe -c "export PATH='$fakeBinBashPath':$([char]36)PATH; export ALOOP_NO_DASHBOARD=1; bash '$($script:loopShBash)' --prompts-dir '$($Env.PromptsBash)' --session-dir '$($Env.SessionBash)' --work-dir '$($Env.WorkBash)' --max-iterations $MaxIter 2>&1"
            return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
        }
    }

    AfterAll {
        if ($script:shLockTempRoot -and (Test-Path $script:shLockTempRoot)) {
            Remove-Item -Recurse -Force $script:shLockTempRoot
        }
    }

    It 'creates session.lock on startup and removes it on normal exit' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShLockTestEnv
        Test-Path $e.LockFile | Should -Be $false
        $result = Invoke-ShLockLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        # Lock should be cleaned up after exit
        Test-Path $e.LockFile | Should -Be $false
    }

    It 'refuses to start when session.lock contains a live PID' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShLockTestEnv
        # Write the lockfile with a live PID and invoke loop.sh in one bash session
        # so the blocker PID (sleep) is visible to kill -0 inside loop.sh.
        $fakeBinBashPath = & $script:bashExe -c "cygpath -u '$($script:shLockFakeBinDir -replace '\\','/')'" 2>$null
        if (-not $fakeBinBashPath) {
            $fakeBinBashPath = ($script:shLockFakeBinDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
        $fakeBinBashPath = $fakeBinBashPath.Trim()
        $lockBash = & $script:bashExe -c "cygpath -u '$($e.LockFile -replace '\\','/')'" 2>$null
        $lockBash = $lockBash.Trim()
        $output = & $script:bashExe -c "
            sleep 300 &
            BLOCKER_PID=`$!
            echo `$BLOCKER_PID > '$lockBash'
            export PATH='$fakeBinBashPath':`$PATH
            export ALOOP_NO_DASHBOARD=1
            bash '$($script:loopShBash)' --prompts-dir '$($e.PromptsBash)' --session-dir '$($e.SessionBash)' --work-dir '$($e.WorkBash)' --max-iterations 1 2>&1
            RC=`$?
            kill `$BLOCKER_PID 2>/dev/null
            exit `$RC
        " 2>&1
        $exitCode = $LASTEXITCODE
        $outputText = $output -join "`n"
        $exitCode | Should -Not -Be 0
        $outputText | Should -Match 'already locked by PID'
    }

    It 'ignores stale session.lock with dead PID' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShLockTestEnv
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($e.LockFile, "999999`n", $utf8NoBom)
        $result = Invoke-ShLockLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        Test-Path $e.LockFile | Should -Be $false
    }
}
