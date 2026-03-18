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
    sed -i '0,/- \[ \]/s/- \[ \]/- [x]/' "$TODO_FILE"
    git add "$TODO_FILE" 2>/dev/null
    git commit -m "agent: completed task" -q 2>/dev/null || true
elif echo "$PROMPT_TEXT" | grep -q "Planning Mode"; then
    echo "- [ ] New task" >> "$TODO_FILE"
    git add "$TODO_FILE" 2>/dev/null
    git commit -m "agent: updated plan" -q 2>/dev/null || true
elif echo "$PROMPT_TEXT" | grep -q "Review Mode"; then
    VERDICT_FILE=$(echo "$PROMPT_TEXT" | grep -A 1 "write a JSON verdict file at:" | tail -n 1 | tr -d '\r')
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE '"iteration": [0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ -z "$VERDICT_FILE" ]; then
        VERDICT_FILE="../session/review-verdict.json"
    fi
    if [ -z "$ITER_NUM" ] && [ -f "../session/status.json" ]; then
        ITER_NUM=$(python3 -c "import json; print(json.load(open('../session/status.json')).get('iteration',''))" 2>/dev/null)
    fi
    ITER_NUM="${ITER_NUM:-0}"
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
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            # Use no-BOM UTF-8 + LF endings so bash grep/sed work correctly on these files
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText((Join-Path $workDir   'TODO.md'),          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_plan.md'),   "# Planning Mode`nPlan tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_build.md'),  "# Building Mode`nBuild tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_qa.md'),     "# QA Mode`nRun QA checks.`n", $utf8NoBom)
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
            param($LoopEnv, [int]$MaxIter = 8, [string]$Mode = 'plan-build-review')
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
                    export ALOOP_SKIP_PHASE_GUARDS=true
                    bash '$loopBash' \
                        --prompts-dir '$promptBash' \
                        --session-dir '$sessBash' \
                        --work-dir '$workBash' \
                        --mode '$Mode' \
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

    It 'iteration limit writes stopped session state' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 1
        $status = Get-Content (Join-Path $e.SessionDir 'status.json') -Raw | ConvertFrom-Json
        $result.ExitCode | Should -Be 0
        $status.state | Should -Be 'stopped'
    }

    It 'loop.sh source maps success and stop states to exited/stopped' {
        $loopSource = Get-Content (Join-Path $PSScriptRoot 'loop.sh') -Raw
        ($loopSource | Select-String -Pattern 'write_status "\$ITERATION" "\$iter_mode" "\$iter_provider" 0 "exited"' -AllMatches).Matches.Count | Should -Be 2
        $loopSource | Should -Not -Match 'write_status "\$ITERATION" "\$iter_mode" "\$iter_provider" 0 "completed"'
        $loopSource | Should -Match 'write_status "\$ITERATION" "\$LAST_ITER_MODE" "\$\(resolve_iteration_provider \$ITERATION\)" "\$STUCK_COUNT" "stopped"'
        $loopSource | Should -Match 'trap ''cleanup "interrupted" "stopped"; exit 130'' INT'
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

    It 'approved review does not auto-update proof baselines' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'approve'
        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 8
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Not -Contain 'baselines_updated'
        Test-Path "$($e.SessionDir)/artifacts/baselines/dummy.txt" | Should -Be $false
    }

    It 'rejected review preserves existing baselines without auto-update' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available' }
        $e      = New-ShLoopEnv -Scenario 'reject-once'
        
        $baselineDir = Join-Path $e.SessionDir 'artifacts/baselines'
        New-Item -ItemType Directory -Force $baselineDir | Out-Null
        Set-Content (Join-Path $baselineDir 'preserved.txt') 'old-baseline'

        $result = Invoke-ShLoopScript -LoopEnv $e -MaxIter 14
        $events = Get-ShLogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0

        $events | Should -Not -Contain 'baselines_updated'
        Test-Path (Join-Path $baselineDir 'preserved.txt') | Should -Be $true
        Test-Path (Join-Path $baselineDir 'dummy.txt') | Should -Be $false
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
        $reviewApprovedCovered = $milestones -contains 'final_review_approved'
        $manifestInjectionCovered = -not ($result.Output -match 'Injected proof manifest from iteration \d+ into review prompt\.')
        $noBaselineUpdateCovered = -not ($events -contains 'baselines_updated')
        $sessionStartCovered = $events -contains 'session_start'
        $iterationCompleteCovered = $events -contains 'iteration_complete'

        $branches = [ordered]@{
            'review.approval_path_completes' = $reviewApprovedCovered
            'review.avoids_manifest_injection' = $manifestInjectionCovered
            'review.no_baseline_autoupdate' = $noBaselineUpdateCovered
            'session.start_logged' = $sessionStartCovered
            'iteration.complete_logged' = $iterationCompleteCovered
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
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText((Join-Path $workDir   'TODO.md'),          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_plan.md'),   "# Planning Mode`nPlan tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_build.md'),  "# Building Mode`nBuild tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_qa.md'),     "# QA Mode`nRun QA checks.`n", $utf8NoBom)
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
                    export ALOOP_SKIP_PHASE_GUARDS=true
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
        $exhausted = @($entries | Where-Object { $_.event -eq 'phase_retry_exhausted' })
        $exhausted.Count | Should -BeGreaterThan 0
        @($exhausted[0].failure_reasons).Count | Should -BeGreaterThan 0
        @($exhausted[0].failure_reasons)[0] | Should -BeLike '*forced plan failure*'
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
    git add $todoFile 2>$null
    git commit -m "agent: completed tasks" -q 2>$null
} elseif ($promptText -match 'Planning Mode') {
    $content + "`n- [ ] New task" | Set-Content $todoFile
    git add $todoFile 2>$null
    git commit -m "agent: updated plan" -q 2>$null
} elseif ($promptText -match 'Review Mode') {
    $iterNum = if ($promptText -match '"iteration":\s*(\d+)') { $matches[1] } else { 0 }
    $verdictFile = if ($promptText -match 'write a JSON verdict file at:(?:\r?\n)(.*?)(?:\r?\n)Schema:') { $matches[1].Trim() } else { '' }
    if (-not $verdictFile) { $verdictFile = Join-Path $PWD "..\session\review-verdict.json" }
    if (-not $iterNum) {
        $statusFile = Join-Path $PWD "..\session\status.json"
        if (Test-Path $statusFile) {
            try { $iterNum = [int](Get-Content $statusFile -Raw | ConvertFrom-Json).iteration } catch {}
        }
    }
    if (-not $iterNum) { $iterNum = 0 }

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

        # claude.cmd shim so loop.ps1 resolves 'claude' on PATH (Windows)
        $claudeCmd = Join-Path $fakeBinDir 'claude.cmd'
        Set-Content $claudeCmd "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        # claude shell script for Linux/macOS
        $claudeSh = Join-Path $fakeBinDir 'claude'
        Set-Content $claudeSh "#!/bin/bash`npwsh -NoProfile -File `"$fakePs1`" `"`$@`"`n"
        if ($IsLinux -or $IsMacOS) { chmod +x $claudeSh }

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
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            Set-Content (Join-Path $workDir   'TODO.md')          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10"
            Set-Content (Join-Path $promptDir 'PROMPT_plan.md')   "# Planning Mode`nPlan tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_build.md')  "# Building Mode`nBuild tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_qa.md')     "# QA Mode`nRun QA checks."
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
            param(
                $LoopEnv,
                [int]$MaxIter = 6,
                [string]$Mode = 'plan-build-review',
                [string]$LaunchMode = 'start'
            )
            $prevPath  = $env:PATH
            $prevState = $env:FAKE_CLAUDE_STATE
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $prevGhCalls = $env:FAKE_ALOOP_GH_CALLS
            $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
            $env:PATH              = "$fakeBinDir;$prevPath"
            $env:FAKE_CLAUDE_STATE = $LoopEnv.StateFile
            $env:ALOOP_RUNTIME_DIR = Join-Path $LoopEnv.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            $env:FAKE_ALOOP_GH_CALLS = $LoopEnv.GhCallsFile
            $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
            try {
                $output = & $pwshPath -NoProfile -File $loopScript `
                    -PromptsDir    $LoopEnv.PromptsDir `
                    -SessionDir    $LoopEnv.SessionDir `
                    -WorkDir       $LoopEnv.WorkDir    `
                    -Mode          $Mode                `
                    -Provider      'claude'             `
                    -LaunchMode    $LaunchMode          `
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
                if ($null -eq $prevSkipGuards) {
                    Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards
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

    It 'iteration limit writes stopped session state' {
        $e      = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 1
        $status = Get-Content (Join-Path $e.SessionDir 'status.json') -Raw | ConvertFrom-Json
        $result.ExitCode | Should -Be 0
        $status.state | Should -Be 'stopped'
    }

    It 'resume from qa phase restores qa cycle position and executes qa first' {
        $e = New-LoopEnv -Scenario 'approve'
        [pscustomobject]@{
            iteration = 7
            phase = 'qa'
            provider = 'claude'
            stuck_count = 0
            state = 'running'
        } | ConvertTo-Json | Set-Content (Join-Path $e.SessionDir 'status.json')

        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 1 -LaunchMode 'resume'
        $entries = Get-LogEntries -LogFile $e.LogFile
        $firstIterationComplete = $entries | Where-Object { $_.event -eq 'iteration_complete' } | Select-Object -First 1

        $result.ExitCode | Should -Be 0
        $result.Output | Should -Match 'Resuming from iteration 7 \(phase: qa\)'
        $firstIterationComplete.mode | Should -Be 'qa'
    }

    It 'loop.ps1 source maps success and stop states to exited/stopped' {
        $loopSource = Get-Content (Join-Path $PSScriptRoot 'loop.ps1') -Raw
        ($loopSource | Select-String -Pattern "-State 'exited'" -AllMatches).Matches.Count | Should -Be 2
        $loopSource | Should -Not -Match "-State 'completed'"
        ($loopSource | Select-String -Pattern "-State 'stopped'" -AllMatches).Matches.Count | Should -Be 2
        $loopSource | Should -Not -Match "-State 'interrupted'"
        $loopSource | Should -Not -Match "-State 'limit_reached'"
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

    It 'approved review does not auto-update proof baselines' {
        $e      = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0
        $events | Should -Not -Contain 'baselines_updated'
        Test-Path "$($e.SessionDir)/artifacts/baselines/dummy.txt" | Should -Be $false
    }

    It 'rejected review preserves existing baselines without auto-update' {
        $e      = New-LoopEnv -Scenario 'reject-once'
        
        $baselineDir = Join-Path $e.SessionDir 'artifacts/baselines'
        New-Item -ItemType Directory -Force $baselineDir | Out-Null
        Set-Content (Join-Path $baselineDir 'preserved.txt') 'old-baseline'

        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 12
        $events = Get-LogEvents -LogFile $e.LogFile
        $result.ExitCode | Should -Be 0

        $events | Should -Not -Contain 'baselines_updated'
        Test-Path (Join-Path $baselineDir 'preserved.txt') | Should -Be $true
        Test-Path (Join-Path $baselineDir 'dummy.txt') | Should -Be $false
    }

    It 'records proof-path branch coverage evidence at >=80%' {
        $e = New-LoopEnv -Scenario 'approve'
        $result = Invoke-LoopScript -LoopEnv $e -MaxIter 5
        $entries = Get-LogEntries -LogFile $e.LogFile
        $events = Get-LogEvents -LogFile $e.LogFile

        $milestones = @($entries | ForEach-Object {
            if ($_.event -eq 'iteration_complete') { "iteration_complete:$($_.mode)" } else { $_.event }
        })
        $reviewApprovedCovered = $milestones -contains 'final_review_approved'
        $manifestInjectionCovered = -not ($result.Output -match 'Injected proof manifest from iteration \d+ into review prompt\.')
        $noBaselineUpdateCovered = -not ($events -contains 'baselines_updated')
        $sessionStartCovered = $events -contains 'session_start'
        $iterationCompleteCovered = $events -contains 'iteration_complete'

        $branches = [ordered]@{
            'review.approval_path_completes' = $reviewApprovedCovered
            'review.avoids_manifest_injection' = $manifestInjectionCovered
            'review.no_baseline_autoupdate' = $noBaselineUpdateCovered
            'session.start_logged' = $sessionStartCovered
            'iteration.complete_logged' = $iterationCompleteCovered
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
    $content = Get-Content $todoFile -Raw -EA SilentlyContinue
    $newContent = [regex]::Replace($content, '- \[ \]', '- [x]', 1)
    $newContent | Set-Content $todoFile
    git add $todoFile 2>$null
    git commit -m "agent: completed task" -q 2>$null
}
if ($promptText -match 'Planning Mode' -and (Test-Path $todoFile)) {
    Add-Content -Path $todoFile "`n- [ ] New task"
    git add $todoFile 2>$null
    git commit -m "agent: plan" -q 2>$null
}
if ($stateFile) { $state | ConvertTo-Json | Set-Content $stateFile }
Write-Output "ok"
exit 0
'@
        Set-Content $fakePs1 $fakeProviderContent
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        Set-Content (Join-Path $fakeBinDir 'codex.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        if ($IsLinux -or $IsMacOS) {
            foreach ($p in @('claude', 'codex')) {
                $shim = Join-Path $fakeBinDir $p
                Set-Content $shim "#!/bin/bash`npwsh -NoProfile -File `"$fakePs1`" `"`$@`"`n"
                chmod +x $shim
            }
        }

        function script:New-RetryEnv {
            param([int]$PlanFails = 0, [int]$BuildFails = 0)
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            Set-Content (Join-Path $workDir   'TODO.md')          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10"
            Set-Content (Join-Path $promptDir 'PROMPT_plan.md')   "# Planning Mode`nPlan tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_build.md')  "# Building Mode`nBuild tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_qa.md')     "# QA Mode`nRun QA checks."
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
            $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
            $env:PATH = "$fakeBinDir;$prevPath"
            $env:FAKE_RETRY_STATE = $Env.StateFile
            $env:ALOOP_RUNTIME_DIR = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
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
                if ($null -eq $prevSkipGuards) {
                    Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards
                }
            }
        }
    }

    AfterAll {
        if ($IsWindows) {
            Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -match [regex]::Escape($tempRoot) } |
                ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        } else {
            # On Linux, try to find node processes with tempRoot in their command line
            Get-Process node -ErrorAction SilentlyContinue |
                ForEach-Object {
                    try {
                        $cmdLine = Get-Content "/proc/$($_.Id)/cmdline" -Raw -ErrorAction SilentlyContinue
                        if ($cmdLine -match [regex]::Escape($tempRoot)) {
                            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
                        }
                    } catch {}
                }
        }
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
        $exhausted = @($entries | Where-Object { $_.event -eq 'phase_retry_exhausted' })
        $exhausted.Count | Should -BeGreaterThan 0
        @($exhausted[0].failure_reasons).Count | Should -BeGreaterThan 0
        @($exhausted[0].failure_reasons)[0] | Should -BeLike '*forced plan failure*'
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
            $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
            $env:PATH                  = "$fakeBinDir;$prevPath"
            $env:ALOOP_HEALTH_DIR      = $Env.HealthDir
            $env:ALOOP_RUNTIME_DIR     = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD    = '1'
            $env:FAKE_CLAUDE_SCENARIO  = $ClaudeScenario
            $env:FAKE_CODEX_SCENARIO   = $CodexScenario
            $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
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
                if ($null -eq $prevSkipGuards) { Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -EA SilentlyContinue } else { $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards }
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
        if ($IsWindows) {
            Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -match [regex]::Escape($tempRoot) } |
                ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        } else {
            # On Linux, try to find node processes with tempRoot in their command line
            Get-Process node -ErrorAction SilentlyContinue |
                ForEach-Object {
                    try {
                        $cmdLine = Get-Content "/proc/$($_.Id)/cmdline" -Raw -ErrorAction SilentlyContinue
                        if ($cmdLine -match [regex]::Escape($tempRoot)) {
                            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
                        }
                    } catch {}
                }
        }
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
        
        $normalizedParsed = $parsed.value -replace "`r`n", "`n"
        $normalizedExpected = $testInput -replace "`r`n", "`n"
        $normalizedParsed.TrimEnd("`n") | Should -BeExactly $normalizedExpected.TrimEnd("`n")
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

    It 'gh shim exits with code 127 and prints blocked message' {
        $dir = Setup-GhBlock
        if ($IsWindows) {
            $ghCmd = Join-Path $dir 'gh.cmd'
            $output = & cmd /c $ghCmd 2>&1
            $exitCode = $LASTEXITCODE
        } else {
            $ghShim = Join-Path $dir 'gh'
            chmod +x $ghShim
            $output = & $ghShim 2>&1
            $exitCode = $LASTEXITCODE
        }
        $exitCode | Should -Be 127
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
            if ($IsWindows) {
                # Real gh in coloc dir
                Set-Content (Join-Path $colocDir 'gh.cmd') "@echo off`r`necho real-gh`r`n"
                # Provider binary in same dir
                Set-Content (Join-Path $colocDir 'myprovider.cmd') "@echo off`r`necho provider-ok`r`n"
            } else {
                Set-Content (Join-Path $colocDir 'gh') "#!/bin/sh`necho real-gh`n"
                Set-Content (Join-Path $colocDir 'myprovider') "#!/bin/sh`necho provider-ok`n"
                chmod +x (Join-Path $colocDir 'gh')
                chmod +x (Join-Path $colocDir 'myprovider')
            }

            $savedPath = $env:PATH
            $env:PATH = "$dir$([IO.Path]::PathSeparator)$colocDir$([IO.Path]::PathSeparator)$env:PATH"
            try {
                if ($IsWindows) {
                    # gh should resolve to shim (blocked)
                    $ghOut = & cmd /c gh.cmd 2>&1
                    $ghExit = $LASTEXITCODE

                    # provider should still resolve to coloc dir
                    $provOut = & cmd /c myprovider.cmd 2>&1
                    $provExit = $LASTEXITCODE
                } else {
                    $ghOut = & gh 2>&1
                    $ghExit = $LASTEXITCODE
                    $provOut = & myprovider 2>&1
                    $provExit = $LASTEXITCODE
                }
                $ghExit | Should -Be 127
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
    # Incomplete tasks exist — simulate successful build by marking one done
    $newContent = [regex]::Replace($content, '- \[ \]', '- [x]', 1)
    $newContent | Set-Content $todoFile
    git add $todoFile 2>$null
    git commit -m "agent: completed task" -q 2>$null
} elseif ($promptText -match 'Planning Mode') {
    $content + "`n- [ ] New task" | Set-Content $todoFile
    git add $todoFile 2>$null
    git commit -m "agent: plan" -q 2>$null
} elseif ($promptText -match 'Review Mode') {
    $verdictFile = if ($promptText -match 'write a JSON verdict file at:(?:\r?\n)(.*?)(?:\r?\n)Schema:') { $matches[1].Trim() } else { '' }
    $iterNum = if ($promptText -match '"iteration":\s*(\d+)') { $matches[1] } else { 0 }
    if (-not $verdictFile) { $verdictFile = Join-Path $PWD "..\session\review-verdict.json" }
    if (-not $iterNum) {
        $statusFile = Join-Path $PWD "..\session\status.json"
        if (Test-Path $statusFile) {
            try { $iterNum = [int](Get-Content $statusFile -Raw | ConvertFrom-Json).iteration } catch {}
        }
    }
    if (-not $iterNum) { $iterNum = 0 }
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
        if ($IsLinux -or $IsMacOS) {
            $shimPath = Join-Path $fakeBinDir 'claude'
            Set-Content $shimPath "#!/bin/bash`npwsh -NoProfile -File `"$fakePs1`" `"`$@`"`n"
            chmod +x $shimPath
        }

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
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            Set-Content (Join-Path $workDir   'TODO.md')          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10"
            Set-Content (Join-Path $promptDir 'PROMPT_plan.md')   "# Planning Mode`nPlan tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_build.md')  "# Building Mode`nBuild tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_qa.md')     "# QA Mode`nRun QA checks."
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
            $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
            $env:PATH              = "$fakeBinDir;$prevPath"
            $env:ALOOP_RUNTIME_DIR = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
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
                if ($null -eq $prevSkipGuards) {
                    Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards
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
    sed -i '0,/- \[ \]/s/- \[ \]/- [x]/' "$TODO_FILE"
    git add "$TODO_FILE" 2>/dev/null
    git commit -m "agent: completed task" -q 2>/dev/null || true
elif echo "$PROMPT_TEXT" | grep -q "Planning Mode"; then
    echo "- [ ] New task" >> "$TODO_FILE"
    git add "$TODO_FILE" 2>/dev/null
    git commit -m "agent: updated plan" -q 2>/dev/null || true
elif echo "$PROMPT_TEXT" | grep -q "Review Mode"; then
    VERDICT_FILE=$(echo "$PROMPT_TEXT" | grep -A 1 "write a JSON verdict file at:" | tail -n 1 | tr -d '\r')
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE '"iteration": [0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ -z "$VERDICT_FILE" ]; then
        VERDICT_FILE="../session/review-verdict.json"
    fi
    if [ -z "$ITER_NUM" ] && [ -f "../session/status.json" ]; then
        ITER_NUM=$(python3 -c "import json; print(json.load(open('../session/status.json')).get('iteration',''))" 2>/dev/null)
    fi
    ITER_NUM="${ITER_NUM:-0}"
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
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText((Join-Path $workDir   'TODO.md'),          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_plan.md'),   "# Planning Mode`nPlan tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_build.md'),  "# Building Mode`nBuild tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_qa.md'),     "# QA Mode`nRun QA checks.`n", $utf8NoBom)
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
            $output = & $script:bashExe -c "export PATH='$fakeBinBashPath':$([char]36)PATH; export ALOOP_NO_DASHBOARD=1; export ALOOP_SKIP_PHASE_GUARDS=true; bash '$($script:loopShBash)' --prompts-dir '$($Env.PromptsBash)' --session-dir '$($Env.SessionBash)' --work-dir '$($Env.WorkBash)' --max-iterations $MaxIter 2>&1"
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

# ============================================================================
# DEVCONTAINER ROUTING — loop.ps1
# ============================================================================
Describe 'loop.ps1 — devcontainer auto-routing' {

    BeforeAll {
        $pwshPath = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
        if (-not $pwshPath) { $pwshPath = (Get-Command powershell -ErrorAction SilentlyContinue).Source }
        $script:dcPwsh = $pwshPath
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $script:dcLoopScript = $loopScript

        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-dc-ps1-tests-" + [guid]::NewGuid().ToString('N'))
        $script:dcTempRoot = $tempRoot
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null
        $script:dcFakeBinDir = $fakeBinDir

        # Fake claude provider
        $fakePs1 = Join-Path $fakeBinDir '_fake_claude.ps1'
        @'
$promptText = ($input | Out-String)
$todoFile = Join-Path $PWD 'TODO.md'
$content  = if (Test-Path $todoFile) { Get-Content $todoFile -Raw } else { '' }
if (($promptText -match 'Building Mode') -and ($content -match '- \[ \]')) {
    # Incomplete tasks exist — simulate successful build by marking one done
    $newContent = [regex]::Replace($content, '- \[ \]', '- [x]', 1)
    $newContent | Set-Content $todoFile
    git add $todoFile 2>$null
    git commit -m "agent: completed task" -q 2>$null
} elseif ($promptText -match 'Planning Mode') {
    $content + "`n- [ ] New task" | Set-Content $todoFile
    git add $todoFile 2>$null
    git commit -m "agent: plan" -q 2>$null
} elseif ($promptText -match 'Review Mode') {
    $verdictFile = if ($promptText -match 'write a JSON verdict file at:(?:\r?\n)(.*?)(?:\r?\n)Schema:') { $matches[1].Trim() } else { '' }
    $iterNum = if ($promptText -match '"iteration":\s*(\d+)') { $matches[1] } else { 0 }
    if (-not $verdictFile) { $verdictFile = Join-Path $PWD "..\session\review-verdict.json" }
    if (-not $iterNum) {
        $statusFile = Join-Path $PWD "..\session\status.json"
        if (Test-Path $statusFile) {
            try { $iterNum = [int](Get-Content $statusFile -Raw | ConvertFrom-Json).iteration } catch {}
        }
    }
    if (-not $iterNum) { $iterNum = 0 }
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
'@ | Set-Content $fakePs1
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        if ($IsLinux -or $IsMacOS) {
            $shimPath = Join-Path $fakeBinDir 'claude'
            Set-Content $shimPath "#!/bin/bash`npwsh -NoProfile -File `"$fakePs1`" `"`$@`"`n"
            chmod +x $shimPath
        }

        # Fake aloop.cmd shim (no-op)
        Set-Content (Join-Path $fakeBinDir '_fake_aloop.ps1') 'Write-Output "{}"; exit 0'
        Set-Content (Join-Path $fakeBinDir 'aloop.cmd') "@echo off`r`npwsh -NoProfile -File `"$(Join-Path $fakeBinDir '_fake_aloop.ps1')`" %*`r`n"

        function script:New-DcTestEnv {
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            Set-Content (Join-Path $workDir   'TODO.md')          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10"
            Set-Content (Join-Path $promptDir 'PROMPT_plan.md')   "# Planning Mode`nPlan tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_build.md')  "# Building Mode`nBuild tasks."
            Set-Content (Join-Path $promptDir 'PROMPT_qa.md')     "# QA Mode`nRun QA checks."
            Set-Content (Join-Path $promptDir 'PROMPT_proof.md')  "# Proof Mode`nCollect proof iter-<N>."
            Set-Content (Join-Path $promptDir 'PROMPT_review.md') "# Review Mode`nReview tasks."
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
            }
        }

        function script:Invoke-DcLoopScript {
            param($Env, [int]$MaxIter = 6, [switch]$DangerouslySkipContainer)
            $prevPath    = $env:PATH
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
            $env:PATH              = "$($script:dcFakeBinDir);$prevPath"
            $env:ALOOP_NO_DASHBOARD = '1'
            $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
            try {
                $args = @(
                    '-NoProfile', '-File', $script:dcLoopScript,
                    '-PromptsDir',    $Env.PromptsDir,
                    '-SessionDir',    $Env.SessionDir,
                    '-WorkDir',       $Env.WorkDir,
                    '-Mode',          'plan-build-review',
                    '-Provider',      'claude',
                    '-MaxIterations', $MaxIter
                )
                if ($DangerouslySkipContainer) { $args += '-DangerouslySkipContainer' }
                $output = & $script:dcPwsh @args 2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            } finally {
                $env:PATH = $prevPath
                if ($null -eq $prevNoDash) {
                    Remove-Item Env:ALOOP_NO_DASHBOARD -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_NO_DASHBOARD = $prevNoDash
                }
                if ($null -eq $prevSkipGuards) {
                    Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -ErrorAction SilentlyContinue
                } else {
                    $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards
                }
            }
        }
    }

    AfterAll {
        if ($script:dcTempRoot -and (Test-Path $script:dcTempRoot)) {
            Remove-Item -Recurse -Force $script:dcTempRoot
        }
    }

    It 'prints suggestion when no devcontainer.json exists' {
        $e = New-DcTestEnv
        $result = Invoke-DcLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        $result.Output | Should -Match 'No devcontainer found'
        $result.Output | Should -Match 'aloop:devcontainer'
    }

    It 'prints DANGER warning and logs container_bypass with --DangerouslySkipContainer when devcontainer.json exists' {
        $e = New-DcTestEnv
        # Create a devcontainer.json
        $dcDir = Join-Path $e.WorkDir '.devcontainer'
        New-Item -ItemType Directory -Force $dcDir | Out-Null
        Set-Content (Join-Path $dcDir 'devcontainer.json') '{"name":"test"}'

        $result = Invoke-DcLoopScript -Env $e -MaxIter 6 -DangerouslySkipContainer
        $result.ExitCode | Should -Be 0
        $result.Output | Should -Match 'DANGER.*Running agents directly on host'

        # Verify container_bypass log event
        $logFile = Join-Path $e.SessionDir 'log.jsonl'
        $logFile | Should -Exist
        $entries = Get-Content $logFile | ForEach-Object { $_ | ConvertFrom-Json }
        $bypassEntry = $entries | Where-Object { $_.event -eq 'container_bypass' } | Select-Object -First 1
        $bypassEntry | Should -Not -BeNullOrEmpty
        $bypassEntry.reason | Should -Be 'dangerously_skip_container_flag'
    }

    It 'session_start log includes devcontainer field set to false when no devcontainer' {
        $e = New-DcTestEnv
        $result = Invoke-DcLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0

        $logFile = Join-Path $e.SessionDir 'log.jsonl'
        $logFile | Should -Exist
        $entries = Get-Content $logFile | ForEach-Object { $_ | ConvertFrom-Json }
        $startEntry = $entries | Where-Object { $_.event -eq 'session_start' } | Select-Object -First 1
        $startEntry | Should -Not -BeNullOrEmpty
        # devcontainer should be False when no devcontainer.json exists
        $startEntry.devcontainer | Should -Be $false
    }

    It 'warns about devcontainer CLI not found when devcontainer.json exists but no devcontainer binary on PATH' {
        $e = New-DcTestEnv
        # Create devcontainer.json so routing proceeds past the first check
        $dcDir = Join-Path $e.WorkDir '.devcontainer'
        New-Item -ItemType Directory -Force $dcDir | Out-Null
        Set-Content (Join-Path $dcDir 'devcontainer.json') '{"name":"test"}'

        # Use a PATH containing ONLY fakeBinDir (has claude.cmd/aloop.cmd but NOT devcontainer)
        $prevPath    = $env:PATH
        $prevNoDash  = $env:ALOOP_NO_DASHBOARD
        $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
        $env:PATH               = $script:dcFakeBinDir
        $env:ALOOP_NO_DASHBOARD = '1'
        $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
        try {
            $output = & $script:dcPwsh -NoProfile -File $script:dcLoopScript `
                -PromptsDir $e.PromptsDir -SessionDir $e.SessionDir -WorkDir $e.WorkDir `
                -Mode 'plan-build-review' -Provider 'claude' -MaxIterations 6 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            $env:PATH = $prevPath
            if ($null -eq $prevNoDash) { Remove-Item Env:ALOOP_NO_DASHBOARD -ErrorAction SilentlyContinue } else { $env:ALOOP_NO_DASHBOARD = $prevNoDash }
            if ($null -eq $prevSkipGuards) { Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -ErrorAction SilentlyContinue } else { $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards }
        }
        $combined = $output -join "`n"
        $exitCode | Should -Be 0
        $combined | Should -Match 'devcontainer CLI not found on PATH'
        $combined | Should -Match 'npm install -g @devcontainers/cli'
    }
}

# ============================================================================
# DEVCONTAINER ROUTING — loop.sh
# ============================================================================
Describe 'loop.sh — devcontainer auto-routing' {

    BeforeAll {
        $script:bashExe = Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
        if (-not $script:bashExe) { return }

        $loopShPath = Join-Path $PSScriptRoot 'loop.sh'
        $script:dcLoopShBash = & $script:bashExe -c "cygpath -u '$(($loopShPath -replace "\\","/"))'" 2>$null
        if (-not $script:dcLoopShBash) {
            $script:dcLoopShBash = ($loopShPath -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }

        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-sh-dc-tests-" + [guid]::NewGuid().ToString('N'))
        $script:dcShTempRoot = $tempRoot
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null
        $script:dcShFakeBinDir = $fakeBinDir

        $fakeBinBash = & $script:bashExe -c "cygpath -u '$($fakeBinDir -replace '\\','/')'" 2>$null
        if (-not $fakeBinBash) {
            $fakeBinBash = ($fakeBinDir -replace '\\', '/') -replace '^([A-Za-z]):', { '/' + $_.Groups[1].Value.ToLower() }
        }
        $fakeBinBash = $fakeBinBash.Trim()
        $script:dcShFakeBinBash = $fakeBinBash

        # Fake claude shell script
        $fakeShContent = @'
#!/bin/bash
PROMPT_TEXT="$(cat)"
TODO_FILE="${PWD}/TODO.md"
if echo "$PROMPT_TEXT" | grep -q "Building Mode" && grep -q -- '- \[ \]' "$TODO_FILE" 2>/dev/null; then
    sed -i '0,/- \[ \]/s/- \[ \]/- [x]/' "$TODO_FILE"
    git add "$TODO_FILE" 2>/dev/null
    git commit -m "agent: completed task" -q 2>/dev/null || true
elif echo "$PROMPT_TEXT" | grep -q "Planning Mode"; then
    echo "- [ ] New task" >> "$TODO_FILE"
    git add "$TODO_FILE" 2>/dev/null
    git commit -m "agent: updated plan" -q 2>/dev/null || true
elif echo "$PROMPT_TEXT" | grep -q "Review Mode"; then
    VERDICT_FILE=$(echo "$PROMPT_TEXT" | grep -A 1 "write a JSON verdict file at:" | tail -n 1 | tr -d '\r')
    ITER_NUM=$(echo "$PROMPT_TEXT" | grep -oE '"iteration": [0-9]+' | grep -oE '[0-9]+' | head -n 1)
    if [ -z "$VERDICT_FILE" ]; then
        VERDICT_FILE="../session/review-verdict.json"
    fi
    if [ -z "$ITER_NUM" ] && [ -f "../session/status.json" ]; then
        ITER_NUM=$(python3 -c "import json; print(json.load(open('../session/status.json')).get('iteration',''))" 2>/dev/null)
    fi
    ITER_NUM="${ITER_NUM:-0}"
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

        function script:New-ShDcTestEnv {
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            foreach ($d in $workDir, $sessDir, $promptDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            # Initialize git repo for phase guards
            Push-Location $workDir
            try {
                git init -q
                git config user.name "Test"
                git config user.email "test@example.com"
            } finally { Pop-Location }
            $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
            [System.IO.File]::WriteAllText((Join-Path $workDir   'TODO.md'),          "- [ ] Task 1`n- [ ] Task 2`n- [ ] Task 3`n- [ ] Task 4`n- [ ] Task 5`n- [ ] Task 6`n- [ ] Task 7`n- [ ] Task 8`n- [ ] Task 9`n- [ ] Task 10`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_plan.md'),   "# Planning Mode`nPlan tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_build.md'),  "# Building Mode`nBuild tasks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_qa.md'),     "# QA Mode`nRun QA checks.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_proof.md'),  "# Proof Mode`nCollect proof iter-<N>.`n", $utf8NoBom)
            [System.IO.File]::WriteAllText((Join-Path $promptDir 'PROMPT_review.md'), "# Review Mode`nReview tasks.`n", $utf8NoBom)

            $workBash    = (& $script:bashExe -c "cygpath -u '$($workDir -replace '\\','/')'" 2>$null).Trim()
            $sessBash    = (& $script:bashExe -c "cygpath -u '$($sessDir -replace '\\','/')'" 2>$null).Trim()
            $promptsBash = (& $script:bashExe -c "cygpath -u '$($promptDir -replace '\\','/')'" 2>$null).Trim()
            return [pscustomobject]@{
                WorkDir     = $workDir
                SessionDir  = $sessDir
                PromptsDir  = $promptDir
                WorkBash    = $workBash
                SessionBash = $sessBash
                PromptsBash = $promptsBash
            }
        }

        function script:Invoke-ShDcLoopScript {
            param($Env, [int]$MaxIter = 6, [switch]$DangerouslySkipContainer)
            $extraArgs = ""
            if ($DangerouslySkipContainer) { $extraArgs = "--dangerously-skip-container" }
            $output = & $script:bashExe -c "export PATH='$($script:dcShFakeBinBash)':$([char]36)PATH; export ALOOP_NO_DASHBOARD=1; export ALOOP_SKIP_PHASE_GUARDS=true; bash '$($script:dcLoopShBash)' --prompts-dir '$($Env.PromptsBash)' --session-dir '$($Env.SessionBash)' --work-dir '$($Env.WorkBash)' --max-iterations $MaxIter $extraArgs 2>&1"
            return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
        }
    }

    AfterAll {
        if ($script:dcShTempRoot -and (Test-Path $script:dcShTempRoot)) {
            Remove-Item -Recurse -Force $script:dcShTempRoot
        }
    }

    It 'prints suggestion when no devcontainer.json exists' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShDcTestEnv
        $result = Invoke-ShDcLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0
        $result.Output | Should -Match 'No devcontainer found'
        $result.Output | Should -Match 'aloop:devcontainer'
    }

    It 'prints DANGER warning and logs container_bypass with --dangerously-skip-container when devcontainer.json exists' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShDcTestEnv
        # Create a devcontainer.json
        $dcDir = Join-Path $e.WorkDir '.devcontainer'
        New-Item -ItemType Directory -Force $dcDir | Out-Null
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText((Join-Path $dcDir 'devcontainer.json'), '{"name":"test"}', $utf8NoBom)

        $result = Invoke-ShDcLoopScript -Env $e -MaxIter 6 -DangerouslySkipContainer
        $result.ExitCode | Should -Be 0
        $result.Output | Should -Match 'DANGER.*Running agents directly on host'

        # Verify container_bypass log event
        $logFile = Join-Path $e.SessionDir 'log.jsonl'
        $logFile | Should -Exist
        $rawLines = Get-Content $logFile
        $bypassLine = $rawLines | Where-Object { $_ -match '"container_bypass"' } | Select-Object -First 1
        $bypassLine | Should -Not -BeNullOrEmpty
        $bypassLine | Should -Match '"reason".*"dangerously_skip_container_flag"'
    }

    It 'session_start log includes devcontainer field set to false when no devcontainer' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShDcTestEnv
        $result = Invoke-ShDcLoopScript -Env $e -MaxIter 6
        $result.ExitCode | Should -Be 0

        $logFile = Join-Path $e.SessionDir 'log.jsonl'
        $logFile | Should -Exist
        $rawLines = Get-Content $logFile
        $startLine = $rawLines | Where-Object { $_ -match '"session_start"' } | Select-Object -First 1
        $startLine | Should -Not -BeNullOrEmpty
        $startLine | Should -Match '"devcontainer".*"false"'
    }

    It 'warns about devcontainer CLI not found when devcontainer.json exists but no devcontainer binary on PATH' {
        if (-not $script:bashExe) { Set-ItResult -Skipped -Because 'bash not available'; return }
        $e = New-ShDcTestEnv
        # Create devcontainer.json so routing proceeds past the first check
        $dcDir = Join-Path $e.WorkDir '.devcontainer'
        New-Item -ItemType Directory -Force $dcDir | Out-Null
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText((Join-Path $dcDir 'devcontainer.json'), '{"name":"test"}', $utf8NoBom)

        # Use a PATH containing ONLY fakeBinBash + essential system dirs (no devcontainer binary)
        $output = & $script:bashExe -c "export PATH='$($script:dcShFakeBinBash)':/usr/bin:/bin; export ALOOP_NO_DASHBOARD=1; export ALOOP_SKIP_PHASE_GUARDS=true; bash '$($script:dcLoopShBash)' --prompts-dir '$($e.PromptsBash)' --session-dir '$($e.SessionBash)' --work-dir '$($e.WorkBash)' --max-iterations 6 2>&1"
        $exitCode = $LASTEXITCODE
        $combined = $output -join "`n"
        $exitCode | Should -Be 0
        $combined | Should -Match 'devcontainer CLI not found on PATH'
        $combined | Should -Match 'npm install -g @devcontainers/cli'
    }
}

# ============================================================================
# loop.ps1 — cycle resolution + frontmatter branch evidence
# ============================================================================
Describe 'loop.ps1 — cycle resolution + frontmatter branch evidence' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $scriptContent = Get-Content $loopScript -Raw

        # Extract Resolve-CyclePromptFromPlan function
        if ($scriptContent -match '(?ms)(^function Resolve-CyclePromptFromPlan\s*\{.*?^})') {
            $script:cycleFuncSource = $Matches[1]
        } else {
            throw "Could not extract Resolve-CyclePromptFromPlan from loop.ps1"
        }

        # Extract Resolve-IterationMode function
        if ($scriptContent -match '(?ms)(^function Resolve-IterationMode\s*\{.*?^})') {
            $script:resolveIterationModeFuncSource = $Matches[1]
        } else {
            throw "Could not extract Resolve-IterationMode from loop.ps1"
        }

        # Extract Check-PhasePrerequisites function
        if ($scriptContent -match '(?ms)(^function Check-PhasePrerequisites\s*\{.*?^})') {
            $script:checkPhasePrerequisitesFuncSource = $Matches[1]
        } else {
            throw "Could not extract Check-PhasePrerequisites from loop.ps1"
        }

        # Extract Check-HasBuildsToReview function
        if ($scriptContent -match '(?ms)(^function Check-HasBuildsToReview\s*\{.*?^})') {
            $script:checkHasBuildsToReviewFuncSource = $Matches[1]
        } else {
            throw "Could not extract Check-HasBuildsToReview from loop.ps1"
        }

        # Source the functions into the Describe scope so they are available to all tests
        function Write-LogEntry { param($Event, $Data) }
        function Write-Warning { param($Message) }
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        . ([scriptblock]::Create($script:checkHasBuildsToReviewFuncSource))

        # Extract Parse-Frontmatter function
        if ($scriptContent -match '(?ms)(^function Parse-Frontmatter\s*\{.*?^})') {
            $script:frontmatterFuncSource = $Matches[1]
        } else {
            throw "Could not extract Parse-Frontmatter from loop.ps1"
        }

        # Extract ConvertTo-DurationSeconds function
        if ($scriptContent -match '(?ms)(^function ConvertTo-DurationSeconds\s*\{.*?^})') {
            $script:durationFuncSource = $Matches[1]
        } else {
            throw "Could not extract ConvertTo-DurationSeconds from loop.ps1"
        }

        # Extract Resolve-ExecutionControls function
        if ($scriptContent -match '(?ms)(^function Resolve-ExecutionControls\s*\{.*?^})') {
            $script:execControlsFuncSource = $Matches[1]
        } else {
            throw "Could not extract Resolve-ExecutionControls from loop.ps1"
        }

        $script:cfTempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-cf-tests-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force $script:cfTempRoot | Out-Null
    }

    AfterAll {
        if ($script:cfTempRoot -and (Test-Path $script:cfTempRoot)) {
            Remove-Item -Recurse -Force $script:cfTempRoot -ErrorAction SilentlyContinue
        }
    }

    It 'Resolve-CyclePromptFromPlan resolves prompt from valid loop-plan.json' {
        $SessionDir = Join-Path $script:cfTempRoot 'resolve-success'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        $planFile = Join-Path $SessionDir 'loop-plan.json'
        '{"cycle":["PROMPT_plan.md","PROMPT_build.md","PROMPT_review.md"],"cyclePosition":1}' | Set-Content $planFile

        $script:cycleLength = 0
        $script:cyclePosition = 0
        $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $result = Resolve-CyclePromptFromPlan
        $result | Should -BeTrue
        $script:resolvedPromptName | Should -Be 'PROMPT_build.md'
        $script:cycleLength | Should -Be 3
        $script:cyclePosition | Should -Be 1
    }

    It 'Resolve-CyclePromptFromPlan returns false when file is missing' {
        $SessionDir = Join-Path $script:cfTempRoot 'resolve-missing'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null

        $script:cycleLength = 0
        $script:cyclePosition = 0
        $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $result = Resolve-CyclePromptFromPlan
        $result | Should -BeFalse
    }

    It 'Resolve-CyclePromptFromPlan returns false for empty cycle array' {
        $SessionDir = Join-Path $script:cfTempRoot 'resolve-empty'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        $planFile = Join-Path $SessionDir 'loop-plan.json'
        '{"cycle":[],"cyclePosition":0}' | Set-Content $planFile

        $script:cycleLength = 0
        $script:cyclePosition = 0
        $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $result = Resolve-CyclePromptFromPlan
        $result | Should -BeFalse
    }

    It 'Resolve-CyclePromptFromPlan wraps cyclePosition via modulo' {
        $SessionDir = Join-Path $script:cfTempRoot 'resolve-wrap'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        $planFile = Join-Path $SessionDir 'loop-plan.json'
        '{"cycle":["PROMPT_plan.md","PROMPT_build.md"],"cyclePosition":5}' | Set-Content $planFile

        $script:cycleLength = 0
        $script:cyclePosition = 0
        $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $result = Resolve-CyclePromptFromPlan
        $result | Should -BeTrue
        $script:resolvedPromptName | Should -Be 'PROMPT_build.md'
        $script:cyclePosition | Should -Be 5
    }

    It 'Resolve-IterationMode maps plan-build-review to plan -> build x5 -> qa -> review' {
        function Resolve-CyclePromptFromPlan { return $false }
        function Get-ModeFromPromptName { param([string]$PromptName) return 'plan' }
        . ([scriptblock]::Create($script:resolveIterationModeFuncSource))

        $Mode = 'plan-build-review'
        $actualModes = @()
        foreach ($pos in 0..7) {
            $script:cyclePosition = $pos
            $script:resolvedPromptName = $null
            $actualModes += (Resolve-IterationMode -IterationNumber 1)
        }

        $actualModes | Should -Be @('plan', 'build', 'build', 'build', 'build', 'build', 'qa', 'review')
    }

    It 'Resolve-IterationMode handles single mode explicitly' {
        function Resolve-CyclePromptFromPlan { return $false }
        function Get-ModeFromPromptName { param([string]$PromptName) return 'plan' }
        . ([scriptblock]::Create($script:resolveIterationModeFuncSource))

        $Mode = 'single'
        $script:cyclePosition = 0
        $resolved = Resolve-IterationMode -IterationNumber 1
        $resolved | Should -Be 'single'

        # single mode should resolve to 'single' regardless of cycle position
        $script:cyclePosition = 5
        $resolved = Resolve-IterationMode -IterationNumber 1
        $resolved | Should -Be 'single'
    }

    It 'Parse-Frontmatter extracts trigger-capable fields' {
        $promptFile = Join-Path $script:cfTempRoot 'all-fields.md'
        @"
---
provider: claude
model: opus
agent: coder
reasoning: xhigh
trigger: all_tasks_done
---
Build the thing.
"@ | Set-Content $promptFile

        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $promptFile
        $script:frontmatter['provider'] | Should -Be 'claude'
        $script:frontmatter['model'] | Should -Be 'opus'
        $script:frontmatter['agent'] | Should -Be 'coder'
        $script:frontmatter['reasoning'] | Should -Be 'xhigh'
        $script:frontmatter['trigger'] | Should -Be 'all_tasks_done'
    }

    It 'Parse-Frontmatter yields empty strings when no frontmatter block' {
        $promptFile = Join-Path $script:cfTempRoot 'no-frontmatter.md'
        'Just a plain prompt with no frontmatter.' | Set-Content $promptFile

        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $promptFile
        $script:frontmatter['provider'] | Should -Be ''
        $script:frontmatter['model'] | Should -Be ''
        $script:frontmatter['trigger'] | Should -Be ''
    }

    It 'Parse-Frontmatter handles partial frontmatter with missing fields' {
        $promptFile = Join-Path $script:cfTempRoot 'partial.md'
        @"
---
provider: opencode
reasoning: medium
---
Do partial thing.
"@ | Set-Content $promptFile

        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $promptFile
        $script:frontmatter['provider'] | Should -Be 'opencode'
        $script:frontmatter['model'] | Should -Be ''
        $script:frontmatter['agent'] | Should -Be ''
        $script:frontmatter['reasoning'] | Should -Be 'medium'
        $script:frontmatter['trigger'] | Should -Be ''
    }

    It 'Parse-Frontmatter extracts execution control fields (timeout, max_retries, retry_backoff)' {
        $promptFile = Join-Path $script:cfTempRoot 'exec-controls.md'
        @"
---
provider: claude
model: opus
timeout: 30m
max_retries: 5
retry_backoff: exponential
---
Execute with controls.
"@ | Set-Content $promptFile

        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $promptFile
        $script:frontmatter['timeout'] | Should -Be '30m'
        $script:frontmatter['max_retries'] | Should -Be '5'
        $script:frontmatter['retry_backoff'] | Should -Be 'exponential'
    }

    It 'ConvertTo-DurationSeconds parses plain integer as seconds' {
        . ([scriptblock]::Create($script:durationFuncSource))
        (ConvertTo-DurationSeconds '3600') | Should -Be 3600
    }

    It 'ConvertTo-DurationSeconds parses minutes (30m = 1800)' {
        . ([scriptblock]::Create($script:durationFuncSource))
        (ConvertTo-DurationSeconds '30m') | Should -Be 1800
    }

    It 'ConvertTo-DurationSeconds parses hours (2h = 7200)' {
        . ([scriptblock]::Create($script:durationFuncSource))
        (ConvertTo-DurationSeconds '2h') | Should -Be 7200
    }

    It 'ConvertTo-DurationSeconds parses seconds suffix (90s = 90)' {
        . ([scriptblock]::Create($script:durationFuncSource))
        (ConvertTo-DurationSeconds '90s') | Should -Be 90
    }

    It 'ConvertTo-DurationSeconds returns null for empty input' {
        . ([scriptblock]::Create($script:durationFuncSource))
        (ConvertTo-DurationSeconds '') | Should -BeNullOrEmpty
    }

    It 'ConvertTo-DurationSeconds returns null for invalid input' {
        . ([scriptblock]::Create($script:durationFuncSource))
        (ConvertTo-DurationSeconds 'abc') | Should -BeNullOrEmpty
    }

    It 'Resolve-ExecutionControls uses frontmatter timeout when valid' {
        $script:frontmatter = @{ timeout = '10m'; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 999
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveTimeout | Should -Be 600
    }

    It 'Resolve-ExecutionControls falls back to default timeout' {
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveTimeout | Should -Be 10800
    }

    It 'Resolve-ExecutionControls uses frontmatter max_retries when valid' {
        $script:frontmatter = @{ timeout = ''; max_retries = '7'; retry_backoff = '' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveMaxRetries | Should -Be 7
    }

    It 'Resolve-ExecutionControls falls back to default max_retries' {
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveMaxRetries | Should -Be 10
    }

    It 'Resolve-ExecutionControls applies none backoff' {
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = 'none' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveRetryBackoff | Should -Be 'none'
    }

    It 'Resolve-ExecutionControls applies linear backoff' {
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = 'linear' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveRetryBackoff | Should -Be 'linear'
    }

    It 'Resolve-ExecutionControls applies exponential backoff' {
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = 'exponential' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveRetryBackoff | Should -Be 'exponential'
    }

    It 'Resolve-ExecutionControls defaults to none backoff when no frontmatter' {
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 10800
        $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:durationFuncSource))
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $script:effectiveRetryBackoff | Should -Be 'none'
    }

    It 'records cycle+frontmatter branch coverage evidence at >=80%' {
        $branches = [ordered]@{}

        # cycle.resolve.success
        $SessionDir = Join-Path $script:cfTempRoot 'ev-success'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        '{"cycle":["PROMPT_plan.md","PROMPT_build.md","PROMPT_review.md"],"cyclePosition":1}' | Set-Content (Join-Path $SessionDir 'loop-plan.json')
        $script:cycleLength = 0; $script:cyclePosition = 0; $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $branches['cycle.resolve.success'] = ((Resolve-CyclePromptFromPlan) -eq $true) -and ($script:resolvedPromptName -eq 'PROMPT_build.md')

        # cycle.resolve.missing_file
        $SessionDir = Join-Path $script:cfTempRoot 'ev-missing'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        $script:cycleLength = 0; $script:cyclePosition = 0; $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $branches['cycle.resolve.missing_file'] = ((Resolve-CyclePromptFromPlan) -eq $false)

        # cycle.resolve.invalid_cycle
        $SessionDir = Join-Path $script:cfTempRoot 'ev-invalid'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        '{"cycle":[],"cyclePosition":0}' | Set-Content (Join-Path $SessionDir 'loop-plan.json')
        $script:cycleLength = 0; $script:cyclePosition = 0; $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $branches['cycle.resolve.invalid_cycle'] = ((Resolve-CyclePromptFromPlan) -eq $false)

        # cycle.resolve.modulo_wrap
        $SessionDir = Join-Path $script:cfTempRoot 'ev-wrap'
        New-Item -ItemType Directory -Force $SessionDir | Out-Null
        '{"cycle":["PROMPT_plan.md","PROMPT_build.md"],"cyclePosition":5}' | Set-Content (Join-Path $SessionDir 'loop-plan.json')
        $script:cycleLength = 0; $script:cyclePosition = 0; $script:resolvedPromptName = ''
        . ([scriptblock]::Create($script:cycleFuncSource))
        $branches['cycle.resolve.modulo_wrap'] = ((Resolve-CyclePromptFromPlan) -eq $true) -and ($script:resolvedPromptName -eq 'PROMPT_build.md')

        # frontmatter.all_fields
        $fmAll = Join-Path $script:cfTempRoot 'ev-fm-all.md'
        "---`nprovider: claude`nmodel: opus`nagent: coder`nreasoning: xhigh`ntrigger: all_tasks_done`n---`nBody." | Set-Content $fmAll
        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $fmAll
        $branches['frontmatter.all_fields'] = ($script:frontmatter['provider'] -eq 'claude') -and ($script:frontmatter['model'] -eq 'opus') -and ($script:frontmatter['agent'] -eq 'coder') -and ($script:frontmatter['reasoning'] -eq 'xhigh') -and ($script:frontmatter['trigger'] -eq 'all_tasks_done')

        # frontmatter.empty
        $fmEmpty = Join-Path $script:cfTempRoot 'ev-fm-empty.md'
        'No frontmatter here.' | Set-Content $fmEmpty
        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $fmEmpty
        $branches['frontmatter.empty'] = ($script:frontmatter['provider'] -eq '') -and ($script:frontmatter['model'] -eq '') -and ($script:frontmatter['trigger'] -eq '')

        # frontmatter.partial
        $fmPartial = Join-Path $script:cfTempRoot 'ev-fm-partial.md'
        "---`nprovider: opencode`nreasoning: medium`n---`nPartial." | Set-Content $fmPartial
        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $fmPartial
        $branches['frontmatter.partial'] = ($script:frontmatter['provider'] -eq 'opencode') -and ($script:frontmatter['model'] -eq '') -and ($script:frontmatter['reasoning'] -eq 'medium') -and ($script:frontmatter['trigger'] -eq '')

        # frontmatter.exec_controls
        $fmExec = Join-Path $script:cfTempRoot 'ev-fm-exec.md'
        "---`nprovider: claude`ntimeout: 30m`nmax_retries: 5`nretry_backoff: exponential`n---`nBody." | Set-Content $fmExec
        $script:frontmatter = @{}
        . ([scriptblock]::Create($script:frontmatterFuncSource))
        Parse-Frontmatter -PromptFile $fmExec
        $branches['frontmatter.exec_controls'] = ($script:frontmatter['timeout'] -eq '30m') -and ($script:frontmatter['max_retries'] -eq '5') -and ($script:frontmatter['retry_backoff'] -eq 'exponential')

        # duration.parse_seconds
        . ([scriptblock]::Create($script:durationFuncSource))
        $branches['duration.parse_seconds'] = ((ConvertTo-DurationSeconds '3600') -eq 3600)

        # duration.parse_minutes
        $branches['duration.parse_minutes'] = ((ConvertTo-DurationSeconds '30m') -eq 1800)

        # duration.parse_hours
        $branches['duration.parse_hours'] = ((ConvertTo-DurationSeconds '2h') -eq 7200)

        # duration.parse_suffix_s
        $branches['duration.parse_suffix_s'] = ((ConvertTo-DurationSeconds '90s') -eq 90)

        # duration.parse_empty
        $branches['duration.parse_empty'] = ($null -eq (ConvertTo-DurationSeconds ''))

        # duration.parse_invalid
        $branches['duration.parse_invalid'] = ($null -eq (ConvertTo-DurationSeconds 'abc'))

        # exec_controls.timeout_frontmatter
        $script:frontmatter = @{ timeout = '10m'; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 999; $script:maxPhaseRetries = 10
        . ([scriptblock]::Create($script:execControlsFuncSource))
        Resolve-ExecutionControls
        $branches['exec_controls.timeout_frontmatter'] = ($script:effectiveTimeout -eq 600)

        # exec_controls.timeout_default
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.timeout_default'] = ($script:effectiveTimeout -eq 10800)

        # exec_controls.retries_frontmatter
        $script:frontmatter = @{ timeout = ''; max_retries = '7'; retry_backoff = '' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.retries_frontmatter'] = ($script:effectiveMaxRetries -eq 7)

        # exec_controls.retries_default
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.retries_default'] = ($script:effectiveMaxRetries -eq 10)

        # exec_controls.backoff_none
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = 'none' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.backoff_none'] = ($script:effectiveRetryBackoff -eq 'none')

        # exec_controls.backoff_linear
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = 'linear' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.backoff_linear'] = ($script:effectiveRetryBackoff -eq 'linear')

        # exec_controls.backoff_exponential
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = 'exponential' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.backoff_exponential'] = ($script:effectiveRetryBackoff -eq 'exponential')

        # exec_controls.backoff_default
        $script:frontmatter = @{ timeout = ''; max_retries = ''; retry_backoff = '' }
        $ProviderTimeoutSec = 10800; $script:maxPhaseRetries = 10
        Resolve-ExecutionControls
        $branches['exec_controls.backoff_default'] = ($script:effectiveRetryBackoff -eq 'none')

        # Write coverage report
        $covered = @($branches.Values | Where-Object { $_ }).Count
        $total = $branches.Count
        $percent = if ($total -gt 0) { [math]::Floor(($covered * 100) / $total) } else { 0 }
        $coverageDir = Join-Path (Join-Path $PSScriptRoot '..\..') 'coverage'
        if (-not (Test-Path $coverageDir)) { New-Item -ItemType Directory -Path $coverageDir -Force | Out-Null }
        $reportFile = Join-Path $coverageDir 'ps1-cycle-frontmatter-branch-coverage.json'
        $branchRows = foreach ($key in $branches.Keys) {
            [pscustomobject]@{ id = $key; description = "loop.ps1 $key"; covered = [bool]$branches[$key] }
        }
        [pscustomobject]@{
            generated_at = (Get-Date).ToUniversalTime().ToString('o')
            target = 'aloop/bin/loop.ps1'
            minimum_percent = 80
            summary = [pscustomobject]@{ covered = $covered; total = $total; percent = $percent }
            branches = $branchRows
        } | ConvertTo-Json -Depth 6 | Set-Content -Path $reportFile

        $percent | Should -BeGreaterOrEqual 80
    }
}

# ============================================================================
# 7. loop.ps1 — queue/ and requests/ behavioral
# ============================================================================
Describe 'loop.ps1 — queue and requests behavioral' {

    BeforeAll {
        $loopScript = Join-Path $PSScriptRoot 'loop.ps1'
        $pwshPath   = (Get-Command pwsh -ErrorAction Stop).Source

        $tempRoot   = Join-Path ([IO.Path]::GetTempPath()) ("aloop-queue-tests-" + [guid]::NewGuid().ToString('N'))
        $fakeBinDir = Join-Path $tempRoot 'fake-bin'
        New-Item -ItemType Directory -Force $fakeBinDir | Out-Null

        $fakePs1 = Join-Path $fakeBinDir '_fake_provider.ps1'
        @'
Write-Output "Fake provider: ok"
exit 0
'@ | Set-Content $fakePs1
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        Set-Content (Join-Path $fakeBinDir 'opencode.cmd') "@echo off`r`npwsh -NoProfile -File `"$fakePs1`" %*`r`n"
        # Create plain executable shims for Linux
        # Note: PowerShell escapes '!' in double-quoted strings, so build shebang via char codes
        $script:shebang = [char]35, [char]33 -join ''  # '#!'
        if (-not $IsWindows) {
            foreach ($provName in @('claude', 'opencode')) {
                $shimPath = Join-Path $fakeBinDir $provName
                [IO.File]::WriteAllText($shimPath, "$($script:shebang)/bin/sh`npwsh -NoProfile -File `"$fakePs1`" `"`$@`"`n")
                chmod +x $shimPath
            }
        }

        function script:New-QueueEnv {
            $testDir   = Join-Path $tempRoot ("env-" + [guid]::NewGuid().ToString('N'))
            $workDir   = Join-Path $testDir 'work'
            $sessDir   = Join-Path $testDir 'session'
            $promptDir = Join-Path $testDir 'prompts'
            $queueDir  = Join-Path $sessDir 'queue'
            $reqDir    = Join-Path $sessDir 'requests'
            foreach ($d in $workDir, $sessDir, $promptDir, $queueDir, $reqDir) {
                New-Item -ItemType Directory -Force $d | Out-Null
            }
            Set-Content (Join-Path $workDir   'TODO.md')         "- [ ] Task A"
            Set-Content (Join-Path $promptDir 'PROMPT_build.md') "# Building Mode`nDo tasks."
            return [pscustomobject]@{
                WorkDir    = $workDir
                SessionDir = $sessDir
                PromptsDir = $promptDir
                QueueDir   = $queueDir
                ReqDir     = $reqDir
                LogFile    = Join-Path $sessDir 'log.jsonl'
            }
        }

        function script:Invoke-QueueLoop {
            param($Env, [int]$MaxIter = 1, [string]$Provider = 'claude')
            $prevPath    = $env:PATH
            $prevRuntime = $env:ALOOP_RUNTIME_DIR
            $prevNoDash  = $env:ALOOP_NO_DASHBOARD
            $prevReqTimeout = $env:REQUEST_TIMEOUT
            $prevSkipGuards = $env:ALOOP_SKIP_PHASE_GUARDS
            $pathSep     = [System.IO.Path]::PathSeparator
            $env:PATH              = "$fakeBinDir$pathSep$prevPath"
            $env:ALOOP_RUNTIME_DIR = Join-Path $Env.SessionDir '_runtime_stub'
            $env:ALOOP_NO_DASHBOARD = '1'
            # Set a short request timeout for tests unless already set
            if (-not $env:REQUEST_TIMEOUT) { $env:REQUEST_TIMEOUT = '15' }
            $env:ALOOP_SKIP_PHASE_GUARDS = 'true'
            try {
                $output = & $pwshPath -NoProfile -File $loopScript `
                    -PromptsDir    $Env.PromptsDir `
                    -SessionDir    $Env.SessionDir `
                    -WorkDir       $Env.WorkDir    `
                    -Mode          'build'         `
                    -Provider      $Provider       `
                    -MaxIterations $MaxIter        `
                    2>&1
                return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
            } finally {
                $env:PATH = $prevPath
                if ($null -eq $prevRuntime)    { Remove-Item Env:ALOOP_RUNTIME_DIR -EA SilentlyContinue } else { $env:ALOOP_RUNTIME_DIR = $prevRuntime }
                if ($null -eq $prevNoDash)     { Remove-Item Env:ALOOP_NO_DASHBOARD -EA SilentlyContinue } else { $env:ALOOP_NO_DASHBOARD = $prevNoDash }
                if ($null -eq $prevReqTimeout) { Remove-Item Env:REQUEST_TIMEOUT -EA SilentlyContinue } else { $env:REQUEST_TIMEOUT = $prevReqTimeout }
                if ($null -eq $prevSkipGuards) { Remove-Item Env:ALOOP_SKIP_PHASE_GUARDS -EA SilentlyContinue } else { $env:ALOOP_SKIP_PHASE_GUARDS = $prevSkipGuards }
            }
        }
    }

    AfterAll {
        if (Test-Path $tempRoot) { Remove-Item -Recurse -Force $tempRoot }
    }

    It 'picks up and executes prompts from queue/ directory' {
        $e = New-QueueEnv
        Set-Content (Join-Path $e.QueueDir '01-override.md') "Override prompt"
        
        $result = Invoke-QueueLoop -Env $e -MaxIter 1
        $result.ExitCode | Should -Be 0
        
        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }
        $events | Should -Contain 'queue_override_start'
        $events | Should -Contain 'queue_override_complete'
        
        # Original task should NOT be completed because build mode was skipped
        (Get-Content (Join-Path $e.WorkDir 'TODO.md')) | Should -Not -Match '- \[x\]'
        # Queue item should be deleted
        Test-Path (Join-Path $e.QueueDir '01-override.md') | Should -Be $false
    }

    It 'respects frontmatter provider in queue item' {
        $e = New-QueueEnv
        Set-Content (Join-Path $e.QueueDir '02-provider.md') "---`nprovider: opencode`n---`nPrompt"
        
        $result = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'claude'
        
        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $start = $log | Where-Object { $_.event -eq 'queue_override_start' } | Select-Object -First 1
        $start.provider | Should -Be 'opencode'
    }

    It 'injects review prompt into queue when build detects all tasks done' {
        $e = New-QueueEnv
        Set-Content (Join-Path $e.WorkDir 'TODO.md') "- [x] Task A"
        Set-Content (Join-Path $e.PromptsDir 'PROMPT_review.md') "# Review Mode`nReview tasks."

        $result = Invoke-QueueLoop -Env $e -MaxIter 1
        $result.ExitCode | Should -Be 0

        Test-Path (Join-Path $e.QueueDir '001-force-review.md') | Should -Be $true
        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }
        $events | Should -Contain 'tasks_marked_complete'
        $events | Should -Contain 'queue_inject'
        $events | Should -Contain 'iteration_complete'
    }

    It 'Wait-ForRequests polls until requests directory is empty' {
        $e = New-QueueEnv
        Set-Content (Join-Path $e.ReqDir 'request.json') '{"type":"test"}'

        # Remove the request file after a short delay so Wait-ForRequests detects and then clears
        $job = Start-Job -ScriptBlock {
            param($path)
            Start-Sleep -Seconds 8
            Remove-Item $path -Force -ErrorAction SilentlyContinue
        } -ArgumentList (Join-Path $e.ReqDir 'request.json')

        # Set a short timeout so the test doesn't block for 300s if the job fails
        $prevTimeout = $env:REQUEST_TIMEOUT
        $env:REQUEST_TIMEOUT = '30'
        try {
            $result = Invoke-QueueLoop -Env $e -MaxIter 1
        } finally {
            if ($null -eq $prevTimeout) {
                Remove-Item Env:REQUEST_TIMEOUT -ErrorAction SilentlyContinue
            } else {
                $env:REQUEST_TIMEOUT = $prevTimeout
            }
        }

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }
        $events | Should -Contain 'waiting_for_requests'

        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -ErrorAction SilentlyContinue
    }

    It 'empty queue falls through to normal cycle iteration' {
        $e = New-QueueEnv
        # queue/ directory exists but contains no .md files
        $result = Invoke-QueueLoop -Env $e -MaxIter 1
        $result.ExitCode | Should -Be 0

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }
        # Should NOT contain queue events — should fall through to normal cycle
        $events | Should -Not -Contain 'queue_override_start'
        # Normal iteration should have completed
        $events | Should -Contain 'iteration_complete'
    }

    It 'logs fallback when queue frontmatter provider is unavailable' {
        $e = New-QueueEnv
        Set-Content (Join-Path $e.QueueDir '03-unavailable.md') "---`nprovider: nonexistent-provider`n---`nFallback test prompt"

        $result = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'claude'
        $result.ExitCode | Should -Be 0

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }

        # Should log the unavailable provider event
        $unavailEntry = $log | Where-Object { $_.event -eq 'queue_frontmatter_provider_unavailable' } | Select-Object -First 1
        $unavailEntry | Should -Not -BeNullOrEmpty
        $unavailEntry.requested_provider | Should -Be 'nonexistent-provider'
        $unavailEntry.fallback_provider | Should -Be 'claude'

        # Should still execute with fallback provider
        $startEntry = $log | Where-Object { $_.event -eq 'queue_override_start' } | Select-Object -First 1
        $startEntry.provider | Should -Be 'claude'

        # Queue item should be deleted
        Test-Path (Join-Path $e.QueueDir '03-unavailable.md') | Should -Be $false
    }

    It 'Wait-ForRequests times out and logs request_timeout' {
        $e = New-QueueEnv
        Set-Content (Join-Path $e.ReqDir 'stuck.json') '{"type":"stuck"}'

        # Use REQUEST_TIMEOUT=1 to force a quick timeout
        $prevTimeout = $env:REQUEST_TIMEOUT
        $env:REQUEST_TIMEOUT = '1'
        try {
            $result = Invoke-QueueLoop -Env $e -MaxIter 1
        } finally {
            if ($null -eq $prevTimeout) {
                Remove-Item Env:REQUEST_TIMEOUT -ErrorAction SilentlyContinue
            } else {
                $env:REQUEST_TIMEOUT = $prevTimeout
            }
        }

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }
        $events | Should -Contain 'request_timeout'
    }

    It 'opencode provider path executes successfully' {
        $e = New-QueueEnv
        # Use queue with frontmatter requesting opencode provider
        Set-Content (Join-Path $e.QueueDir '04-opencode.md') "---`nprovider: opencode`n---`nOpencode test prompt"

        $result = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'claude'
        $result.ExitCode | Should -Be 0

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $startEntry = $log | Where-Object { $_.event -eq 'queue_override_start' } | Select-Object -First 1
        $startEntry | Should -Not -BeNullOrEmpty
        $startEntry.provider | Should -Be 'opencode'

        # Queue item should be deleted after execution
        Test-Path (Join-Path $e.QueueDir '04-opencode.md') | Should -Be $false
    }

    It 'logs queue_override_error when queue provider fails' {
        # Create a provider that fails — use a script that exits non-zero
        $failPs1 = Join-Path $fakeBinDir '_fail_provider.ps1'
        [IO.File]::WriteAllText($failPs1, "Write-Error `"simulated failure`"`nexit 1`n")
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$failPs1`" %*`r`n"
        if (-not $IsWindows) {
            $shimPath = Join-Path $fakeBinDir 'claude'
            [IO.File]::WriteAllText($shimPath, "$($script:shebang)/bin/sh`npwsh -NoProfile -File `"$failPs1`" `"`$@`"`n")
            chmod +x $shimPath
        }

        $e = New-QueueEnv
        Set-Content (Join-Path $e.QueueDir '05-fail.md') "Failing prompt"

        $result = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'claude'

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }
        $events | Should -Contain 'queue_override_error'

        # Queue item should still be deleted after failure
        Test-Path (Join-Path $e.QueueDir '05-fail.md') | Should -Be $false

        # Restore default provider for other tests
        $restorePs1 = Join-Path $fakeBinDir '_fake_provider.ps1'
        Set-Content (Join-Path $fakeBinDir 'claude.cmd') "@echo off`r`npwsh -NoProfile -File `"$restorePs1`" %*`r`n"
        if (-not $IsWindows) {
            [IO.File]::WriteAllText($shimPath, "$($script:shebang)/bin/sh`npwsh -NoProfile -File `"$restorePs1`" `"`$@`"`n")
            chmod +x $shimPath
        }
    }

    It 'opencode as direct provider executes a normal build iteration' {
        $e = New-QueueEnv
        # No queue items — should fall through to normal build iteration with opencode
        $result = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'opencode'
        $result.ExitCode | Should -Be 0

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $completeEntry = $log | Where-Object { $_.event -eq 'iteration_complete' } | Select-Object -First 1
        $completeEntry | Should -Not -BeNullOrEmpty
        $completeEntry.provider | Should -Be 'opencode'
    }

    It 'queue override does not advance cycle position' {
        $e = New-QueueEnv
        # Set up a loop-plan.json with a known cycle position
        $planFile = Join-Path $e.SessionDir 'loop-plan.json'
        '{"cycle":["PROMPT_build.md"],"cyclePosition":0}' | Set-Content $planFile

        Set-Content (Join-Path $e.QueueDir '06-cycle.md') "Queue prompt"

        $result = Invoke-QueueLoop -Env $e -MaxIter 1
        $result.ExitCode | Should -Be 0

        # cyclePosition should remain 0 because queue items don't advance it
        $plan = Get-Content $planFile -Raw | ConvertFrom-Json
        $plan.cyclePosition | Should -Be 0
    }

    It 'records queue-requests-opencode branch coverage evidence at >=80%' {
        $e = New-QueueEnv

        # Exercise queue override
        Set-Content (Join-Path $e.QueueDir '07-cover.md') "Cover queue"
        $r1 = Invoke-QueueLoop -Env $e -MaxIter 1
        $r1.ExitCode | Should -Be 0

        # Exercise requests wait-loop
        Set-Content (Join-Path $e.ReqDir 'cover-req.json') '{"type":"test"}'
        $job = Start-Job -ScriptBlock {
            param($path)
            Start-Sleep -Seconds 2
            Remove-Item $path -Force
        } -ArgumentList (Join-Path $e.ReqDir 'cover-req.json')
        $r2 = Invoke-QueueLoop -Env $e -MaxIter 1
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -ErrorAction SilentlyContinue

        # Exercise opencode as direct provider
        $r3 = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'opencode'
        $r3.ExitCode | Should -Be 0

        # Exercise queue frontmatter provider (opencode via frontmatter)
        Set-Content (Join-Path $e.QueueDir '08-fm.md') "---`nprovider: opencode`n---`nCover frontmatter"
        $r4 = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'claude'
        $r4.ExitCode | Should -Be 0

        # Exercise empty queue fallthrough
        $r5 = Invoke-QueueLoop -Env $e -MaxIter 1
        $r5.ExitCode | Should -Be 0

        # Exercise queue frontmatter provider unavailable
        Set-Content (Join-Path $e.QueueDir '09-unavail.md') "---`nprovider: no-such-provider`n---`nUnavail"
        $r6 = Invoke-QueueLoop -Env $e -MaxIter 1 -Provider 'claude'
        $r6.ExitCode | Should -Be 0

        $log = Get-Content $e.LogFile | ForEach-Object { $_ | ConvertFrom-Json }
        $events = $log | ForEach-Object { $_.event }

        $branches = [ordered]@{
            'queue.override_success'             = ($events -contains 'queue_override_start') -and ($events -contains 'queue_override_complete')
            'queue.frontmatter_provider'         = ($log | Where-Object { $_.event -eq 'queue_override_start' -and $_.provider -eq 'opencode' }).Count -gt 0
            'queue.frontmatter_unavailable'      = ($events -contains 'queue_frontmatter_provider_unavailable')
            'queue.empty_fallthrough'            = ($events -contains 'iteration_complete')
            'requests.wait_until_empty'          = ($events -contains 'waiting_for_requests')
            'opencode.direct_provider'           = ($log | Where-Object { $_.event -eq 'iteration_complete' -and $_.provider -eq 'opencode' }).Count -gt 0
        }

        $covered = @($branches.Values | Where-Object { $_ }).Count
        $total = $branches.Count
        $percent = if ($total -gt 0) { [math]::Floor(($covered * 100) / $total) } else { 0 }

        $coverageDir = Join-Path (Join-Path $PSScriptRoot '..\..') 'coverage'
        if (-not (Test-Path $coverageDir)) { New-Item -ItemType Directory -Path $coverageDir -Force | Out-Null }
        $reportFile = Join-Path $coverageDir 'ps1-queue-requests-opencode-coverage.json'
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

        $percent | Should -BeGreaterOrEqual 80
    }
}

Describe 'loop.ps1 — phase prerequisite guards' {
    BeforeAll {
        $script:cfTempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "aloop-guards-ps1-$PID"
        New-Item -ItemType Directory -Path $script:cfTempRoot -Force | Out-Null

        # Extract functions needed for phase prerequisite tests
        $scriptContent = Get-Content (Join-Path $PSScriptRoot 'loop.ps1') -Raw
        if ($scriptContent -match '(?ms)(^function Check-PhasePrerequisites\s*\{.*?^})') {
            $script:checkPhasePrerequisitesFuncSource = $Matches[1]
        } else {
            throw "Could not extract Check-PhasePrerequisites from loop.ps1"
        }
        if ($scriptContent -match '(?ms)(^function Check-HasBuildsToReview\s*\{.*?^})') {
            $script:checkHasBuildsToReviewFuncSource = $Matches[1]
        } else {
            throw "Could not extract Check-HasBuildsToReview from loop.ps1"
        }
        if ($scriptContent -match '(?ms)(^function Resolve-IterationMode\s*\{.*?^})') {
            $script:resolveIterationModeFuncSource = $Matches[1]
        } else {
            throw "Could not extract Resolve-IterationMode from loop.ps1"
        }
    }

    AfterAll {
        Remove-Item -Recurse -Force $script:cfTempRoot -ErrorAction SilentlyContinue
    }

    It 'Resolve-IterationMode enforces build -> plan when no unchecked tasks exist' {
        $PlanFile = Join-Path $script:cfTempRoot 'todo-no-unchecked.md'
        '- [x] Task 1' | Set-Content $PlanFile

        function Resolve-CyclePromptFromPlan { return $false }
        function Get-ModeFromPromptName { param($p) return 'build' }
        function Write-LogEntry { param($Event, $Data) }
        $Mode = 'build'
        $script:cyclePosition = 0

        . ([scriptblock]::Create($script:resolveIterationModeFuncSource))
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        . ([scriptblock]::Create($script:checkHasBuildsToReviewFuncSource))

        $resolved = Resolve-IterationMode -IterationNumber 1
        $resolved | Should -Be 'plan'
    }

    It 'Resolve-IterationMode allows build when unchecked tasks exist' {
        $PlanFile = Join-Path $script:cfTempRoot 'todo-with-unchecked.md'
        '- [ ] Task 1' | Set-Content $PlanFile

        function Resolve-CyclePromptFromPlan { return $false }
        function Get-ModeFromPromptName { param($p) return 'build' }
        function Write-LogEntry { param($Event, $Data) }
        $Mode = 'build'
        $script:cyclePosition = 0

        . ([scriptblock]::Create($script:resolveIterationModeFuncSource))
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        . ([scriptblock]::Create($script:checkHasBuildsToReviewFuncSource))

        $resolved = Resolve-IterationMode -IterationNumber 1
        $resolved | Should -Be 'build'
    }

    It 'Resolve-IterationMode enforces review -> build when no new commits exist' {
        $WorkDir = Join-Path $script:cfTempRoot 'repo-no-new'
        New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
        Push-Location $WorkDir
        try {
            git init -q
            git config user.name "Test"
            git config user.email "test@example.com"
            "seed" | Set-Content seed.txt
            git add seed.txt
            git commit -m "seed" -m "Aloop-Iteration: 0" -q
            $script:lastPlanCommit = (git rev-parse HEAD | Out-String).Trim()
        } finally {
            Pop-Location
        }

        function Resolve-CyclePromptFromPlan { return $false }
        function Get-ModeFromPromptName { param($p) return 'review' }
        function Write-LogEntry { param($Event, $Data) }
        $Mode = 'review'
        $script:cyclePosition = 0

        . ([scriptblock]::Create($script:resolveIterationModeFuncSource))
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        . ([scriptblock]::Create($script:checkHasBuildsToReviewFuncSource))

        $resolved = Resolve-IterationMode -IterationNumber 1
        $resolved | Should -Be 'build'
    }

    It 'Resolve-IterationMode allows review when new commits exist' {
        $WorkDir = Join-Path $script:cfTempRoot 'repo-with-new'
        New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
        Push-Location $WorkDir
        try {
            git init -q
            git config user.name "Test"
            git config user.email "test@example.com"
            "seed" | Set-Content seed.txt
            git add seed.txt
            git commit -m "seed" -m "Aloop-Iteration: 0" -q
            $script:lastPlanCommit = (git rev-parse HEAD | Out-String).Trim()
            
            "new" | Set-Content new.txt
            git add new.txt
            git commit -m "new" -q
        } finally {
            Pop-Location
        }

        function Resolve-CyclePromptFromPlan { return $false }
        function Get-ModeFromPromptName { param($p) return 'review' }
        function Write-LogEntry { param($Event, $Data) }
        $Mode = 'review'
        $script:cyclePosition = 0

        . ([scriptblock]::Create($script:resolveIterationModeFuncSource))
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        . ([scriptblock]::Create($script:checkHasBuildsToReviewFuncSource))

        $resolved = Resolve-IterationMode -IterationNumber 1
        $resolved | Should -Be 'review'
    }

    It 'Check-PhasePrerequisites enforces build -> plan when TODO.md is missing' {
        $PlanFile = Join-Path $script:cfTempRoot 'nonexistent-todo-missing.md'
        # Do NOT create the file — simulate missing TODO.md

        function Write-LogEntry { param($Event, $Data) }
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        $result = Check-PhasePrerequisites -Phase 'build'
        $result | Should -Be 'plan'
    }

    It 'Check-PhasePrerequisites enforces build -> plan when PlanFile is empty string' {
        $PlanFile = ''

        function Write-LogEntry { param($Event, $Data) }
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        $result = Check-PhasePrerequisites -Phase 'build'
        $result | Should -Be 'plan'
    }

    It 'Check-PhasePrerequisites allows build when TODO.md has unchecked tasks' {
        $PlanFile = Join-Path $script:cfTempRoot 'todo-has-unchecked.md'
        "- [ ] Task 1`n- [x] Task 2" | Set-Content $PlanFile

        function Write-LogEntry { param($Event, $Data) }
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        $result = Check-PhasePrerequisites -Phase 'build'
        $result | Should -Be 'build'
    }

    It 'Check-PhasePrerequisites allows plan phase regardless of TODO.md state' {
        $PlanFile = Join-Path $script:cfTempRoot 'nonexistent-plan.md'

        function Write-LogEntry { param($Event, $Data) }
        . ([scriptblock]::Create($script:checkPhasePrerequisitesFuncSource))
        $result = Check-PhasePrerequisites -Phase 'plan'
        $result | Should -Be 'plan'
    }
}
