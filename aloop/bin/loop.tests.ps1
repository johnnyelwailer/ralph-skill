#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
<#
.SYNOPSIS
    Pester regression tests for the mandatory final-review exit invariant in
    loop.ps1 and loop.sh.
    Covers: forced review after build completion, review-approval exit,
    review rejection re-plan, steering precedence, and required log events.
.NOTES
    Run:  Invoke-Pester ./aloop/bin/loop.tests.ps1 -Output Detailed
#>

# ============================================================================
# 1. loop.ps1 — static analysis
# ============================================================================
Describe 'loop.ps1 — final-review exit invariant (static analysis)' {

    BeforeAll {
        $scriptPath    = Join-Path $PSScriptRoot 'loop.ps1'
        $scriptContent = Get-Content $scriptPath -Raw
    }

    Context 'Flag declarations' {
        It 'declares $script:allTasksMarkedDone initialised to $false' {
            $scriptContent | Should -Match '\$script:allTasksMarkedDone\s*=\s*\$false'
        }
        It 'declares $script:forceReviewNext initialised to $false' {
            $scriptContent | Should -Match '\$script:forceReviewNext\s*=\s*\$false'
        }
    }

    Context 'Build completion — plan-build-review branch sets flags and continues without exiting' {
        It 'sets $script:allTasksMarkedDone = $true on build completion in plan-build-review mode' {
            $scriptContent | Should -Match '\$script:allTasksMarkedDone\s*=\s*\$true'
        }
        It 'sets $script:forceReviewNext = $true on build completion in plan-build-review mode' {
            $scriptContent | Should -Match '\$script:forceReviewNext\s*=\s*\$true'
        }
        It 'uses continue (not exit) in the plan-build-review completion branch' {
            # tasks_marked_complete log event is emitted just before 'continue' in the plan-build-review branch
            $scriptContent | Should -Match '"tasks_marked_complete"[\s\S]{0,200}\bcontinue\b'
        }
        It 'does NOT call exit inside the plan-build-review completion branch' {
            # No 'exit' should appear between the tasks_marked_complete event and the continue keyword
            $match = [regex]::Match($scriptContent, '"tasks_marked_complete"([\s\S]{0,300})\bcontinue\b')
            $match.Success | Should -BeTrue
            $match.Groups[1].Value | Should -Not -Match '\bexit\b'
        }
        It 'has exit 0 in the non-review-mode completion branch (build-only)' {
            # The else branch (build-only / plan-build) logs all_tasks_complete then exits
            $scriptContent | Should -Match '"all_tasks_complete"[\s\S]{0,200}exit 0'
        }
    }

    Context 'Resolve-IterationMode handles forceReviewNext flag' {
        It 'checks $script:forceReviewNext in Resolve-IterationMode' {
            $scriptContent | Should -Match 'if \(\$script:forceReviewNext\)'
        }
        It 'clears forceReviewNext to $false after consuming it' {
            # At least two occurrences: the initialisation and the reset inside Resolve-IterationMode
            $matches = [regex]::Matches($scriptContent, '\$script:forceReviewNext\s*=\s*\$false')
            $matches.Count | Should -BeGreaterOrEqual 2
        }
        It "returns 'review' when forceReviewNext is set" {
            $scriptContent | Should -Match "forceReviewNext\)[\s\S]{0,100}return 'review'"
        }
    }

    Context 'Review gate — approval path' {
        It "checks allTasksMarkedDone in the review branch condition" {
            $scriptContent | Should -Match "iterationMode -eq 'review'[\s\S]{0,100}allTasksMarkedDone"
        }
        It 'logs final_review_approved event on approval' {
            $scriptContent | Should -Match '"final_review_approved"'
        }
        It 'exits 0 after logging final_review_approved' {
            $match = [regex]::Match(
                $scriptContent,
                '"final_review_approved"[\s\S]{0,300}exit 0'
            )
            $match.Success | Should -BeTrue
        }
    }

    Context 'Review gate — rejection path' {
        It 'logs final_review_rejected event on rejection' {
            $scriptContent | Should -Match '"final_review_rejected"'
        }
        It 'resets $script:allTasksMarkedDone to $false after rejection' {
            # allTasksMarkedDone is reset before the final_review_rejected event is logged
            $scriptContent | Should -Match 'allTasksMarkedDone\s*=\s*\$false[\s\S]{0,200}final_review_rejected'
        }
        It 'sets $script:forcePlanNext = $true after rejection' {
            # forcePlanNext is set before the final_review_rejected event is logged
            $scriptContent | Should -Match 'forcePlanNext\s*=\s*\$true[\s\S]{0,200}final_review_rejected'
        }
    }

    Context 'Steering takes priority and resets allTasksMarkedDone' {
        It 'resets $script:allTasksMarkedDone to $false in the steering detection block' {
            # allTasksMarkedDone is reset before the steering_detected event is logged
            $scriptContent | Should -Match 'allTasksMarkedDone\s*=\s*\$false[\s\S]{0,200}steering_detected'
        }
    }

    Context 'All three required log events are present in source' {
        It 'source emits tasks_marked_complete event' {
            $scriptContent | Should -Match '"tasks_marked_complete"'
        }
        It 'source emits final_review_approved event' {
            $scriptContent | Should -Match '"final_review_approved"'
        }
        It 'source emits final_review_rejected event' {
            $scriptContent | Should -Match '"final_review_rejected"'
        }
    }

    Context 'Provider health primitives are present with lock retries and graceful failure logging' {
        It 'declares provider health directory under ~/.aloop/health' {
            $scriptContent | Should -Match '\$providerHealthDir\s*=\s*Join-Path\s+\(Join-Path\s+\$HOME\s+''\.aloop''\)\s+''health'''
        }
        It 'declares 5 lock retry delays (50..250ms)' {
            $scriptContent | Should -Match '\$healthLockRetryDelaysMs\s*=\s*@\(50,\s*100,\s*150,\s*200,\s*250\)'
        }
        It 'provides Get-ProviderHealthPath helper' {
            $scriptContent | Should -Match 'function\s+Get-ProviderHealthPath'
        }
        It 'provides default health state helper with required schema fields' {
            $scriptContent | Should -Match 'function\s+New-ProviderHealthState'
            $scriptContent | Should -Match 'status\s*=\s*''healthy'''
            $scriptContent | Should -Match 'last_success\s*='
            $scriptContent | Should -Match 'last_failure\s*='
            $scriptContent | Should -Match 'failure_reason\s*='
            $scriptContent | Should -Match 'consecutive_failures\s*=\s*0'
            $scriptContent | Should -Match 'cooldown_until\s*='
        }
        It 'writes with exclusive lock (FileShare.None)' {
            $scriptContent | Should -Match 'Set-ProviderHealthState[\s\S]{0,500}FileShare\]::None'
        }
        It 'reads with shared lock (FileShare.Read)' {
            $scriptContent | Should -Match 'Get-ProviderHealthState[\s\S]{0,500}FileShare\]::Read'
        }
        It 'logs health_lock_failed when lock retries are exhausted' {
            $scriptContent | Should -Match '"health_lock_failed"'
        }
    }
}

# ============================================================================
# 2. loop.sh — static analysis
# ============================================================================
Describe 'loop.sh — final-review exit invariant (static analysis)' {

    BeforeAll {
        $scriptPath    = Join-Path $PSScriptRoot 'loop.sh'
        $scriptContent = Get-Content $scriptPath -Raw
    }

    Context 'Flag declarations' {
        It 'declares ALL_TASKS_MARKED_DONE=false' {
            $scriptContent | Should -Match 'ALL_TASKS_MARKED_DONE=false'
        }
        It 'declares FORCE_REVIEW_NEXT=false' {
            $scriptContent | Should -Match 'FORCE_REVIEW_NEXT=false'
        }
    }

    Context 'Build completion — plan-build-review branch sets flags and continues without exiting' {
        It 'sets ALL_TASKS_MARKED_DONE=true on build completion' {
            $scriptContent | Should -Match 'ALL_TASKS_MARKED_DONE=true'
        }
        It 'sets FORCE_REVIEW_NEXT=true on build completion' {
            $scriptContent | Should -Match 'FORCE_REVIEW_NEXT=true'
        }
        It 'uses continue (not exit) in the plan-build-review completion branch' {
            $match = [regex]::Match($scriptContent, 'plan-build-review[\s\S]*?\bcontinue\b')
            $match.Success | Should -BeTrue
        }
        It 'does NOT call exit inside the plan-build-review completion branch' {
            # No exit keyword should appear between the tasks_marked_complete event and continue in loop.sh
            $match = [regex]::Match(
                $scriptContent,
                '"tasks_marked_complete"([\s\S]{0,300})\bcontinue\b'
            )
            $match.Success | Should -BeTrue
            $match.Groups[1].Value | Should -Not -Match '\bexit\b'
        }
    }

    Context 'resolve_iteration_mode handles FORCE_REVIEW_NEXT flag' {
        It 'checks FORCE_REVIEW_NEXT=true in resolve_iteration_mode' {
            $scriptContent | Should -Match 'FORCE_REVIEW_NEXT.*true'
        }
        It 'resets FORCE_REVIEW_NEXT=false after consuming it' {
            # At least two occurrences: declaration and reset
            $matches = [regex]::Matches($scriptContent, 'FORCE_REVIEW_NEXT=false')
            $matches.Count | Should -BeGreaterOrEqual 2
        }
        It 'echoes "review" when FORCE_REVIEW_NEXT is set' {
            $match = [regex]::Match(
                $scriptContent,
                'FORCE_REVIEW_NEXT.*true[\s\S]{0,200}echo "review"'
            )
            $match.Success | Should -BeTrue
        }
    }

    Context 'Review gate' {
        It 'checks ALL_TASKS_MARKED_DONE in review gate condition' {
            $scriptContent | Should -Match 'ALL_TASKS_MARKED_DONE.*true'
        }
        It 'logs final_review_approved event' {
            $scriptContent | Should -Match '"final_review_approved"'
        }
        It 'resets ALL_TASKS_MARKED_DONE=false on rejection' {
            # ALL_TASKS_MARKED_DONE is reset before the final_review_rejected event is logged
            $scriptContent | Should -Match 'ALL_TASKS_MARKED_DONE=false[\s\S]{0,200}final_review_rejected'
        }
        It 'sets FORCE_PLAN_NEXT=true on rejection' {
            # FORCE_PLAN_NEXT is set before the final_review_rejected event is logged
            $scriptContent | Should -Match 'FORCE_PLAN_NEXT=true[\s\S]{0,200}final_review_rejected'
        }
    }

    Context 'Steering takes priority and resets ALL_TASKS_MARKED_DONE' {
        It 'resets ALL_TASKS_MARKED_DONE=false when steering is detected' {
            $match = [regex]::Match(
                $scriptContent,
                'STEERING[\s\S]{0,600}ALL_TASKS_MARKED_DONE=false'
            )
            $match.Success | Should -BeTrue
        }
    }

    Context 'All three required log events are present in source' {
        It 'source emits tasks_marked_complete event' {
            $scriptContent | Should -Match '"tasks_marked_complete"'
        }
        It 'source emits final_review_approved event' {
            $scriptContent | Should -Match '"final_review_approved"'
        }
        It 'source emits final_review_rejected event' {
            $scriptContent | Should -Match '"final_review_rejected"'
        }
    }
}

# ============================================================================
# 3. loop.ps1 — behavioral end-to-end
# ============================================================================
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

$todoFile = Join-Path $PWD 'TODO.md'
$content  = if (Test-Path $todoFile) { Get-Content $todoFile -Raw } else { '' }

if ($content -match '- \[ \]') {
    # Incomplete tasks exist — simulate successful build by marking all done
    ($content -replace '- \[ \]', '- [x]') | Set-Content $todoFile
} elseif ($state.scenario -eq 'reject-once' -and -not $state.rejected) {
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
            $env:PATH              = "$fakeBinDir;$prevPath"
            $env:FAKE_CLAUDE_STATE = $LoopEnv.StateFile
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
# 4. loop.ps1 — round-robin health integration (static analysis)
# ============================================================================
Describe 'loop.ps1 — round-robin provider-health integration (static analysis)' {

    BeforeAll {
        $scriptPath    = Join-Path $PSScriptRoot 'loop.ps1'
        $scriptContent = Get-Content $scriptPath -Raw
    }

    Context 'Cooldown schedule helper' {
        It 'declares Get-ProviderCooldownSeconds function' {
            $scriptContent | Should -Match 'function\s+Get-ProviderCooldownSeconds'
        }
        It 'returns 120 for 2 consecutive failures' {
            $scriptContent | Should -Match '2\s*\{\s*return 120\s*\}'
        }
        It 'hard-caps at 3600 seconds' {
            $scriptContent | Should -Match 'return 3600'
        }
    }

    Context 'Failure classification helper' {
        It 'declares Classify-ProviderFailure function' {
            $scriptContent | Should -Match 'function\s+Classify-ProviderFailure'
        }
        It 'classifies rate_limit' {
            $scriptContent | Should -Match 'rate_limit'
        }
        It 'classifies auth as degraded trigger' {
            $scriptContent | Should -Match 'auth'
        }
        It 'classifies concurrent_cap' {
            $scriptContent | Should -Match 'concurrent_cap'
        }
        It 'classifies timeout' {
            $scriptContent | Should -Match "'timeout'"
        }
    }

    Context 'Health update functions' {
        It 'declares Update-ProviderHealthOnSuccess' {
            $scriptContent | Should -Match 'function\s+Update-ProviderHealthOnSuccess'
        }
        It 'declares Update-ProviderHealthOnFailure' {
            $scriptContent | Should -Match 'function\s+Update-ProviderHealthOnFailure'
        }
        It 'logs provider_recovered on success after unhealthy state' {
            $scriptContent | Should -Match "'provider_recovered'"
        }
        It 'logs provider_cooldown on failure entering cooldown' {
            $scriptContent | Should -Match "'provider_cooldown'"
        }
        It 'logs provider_degraded on auth failure' {
            $scriptContent | Should -Match "'provider_degraded'"
        }
        It 'marks auth failures as degraded (no auto-recover)' {
            $scriptContent | Should -Match "reason.*auth[\s\S]{0,100}degraded|degraded[\s\S]{0,100}reason.*auth"
        }
    }

    Context 'All-providers-unavailable sleep' {
        It 'declares Resolve-HealthyProvider function' {
            $scriptContent | Should -Match 'function\s+Resolve-HealthyProvider'
        }
        It 'logs all_providers_unavailable event' {
            $scriptContent | Should -Match "'all_providers_unavailable'"
        }
        It 'sleeps when all providers are unavailable' {
            $scriptContent | Should -Match 'all_providers_unavailable[\s\S]{0,400}Start-Sleep'
        }
    }

    Context 'Round-robin selection uses health-aware helper' {
        It 'Resolve-IterationProvider calls Resolve-HealthyProvider for round-robin' {
            $scriptContent | Should -Match 'Resolve-IterationProvider[\s\S]{0,300}Resolve-HealthyProvider'
        }
    }

    Context 'Health updates wired into main loop' {
        It 'calls Update-ProviderHealthOnSuccess after successful provider invocation' {
            $scriptContent | Should -Match 'Update-ProviderHealthOnSuccess'
        }
        It 'calls Update-ProviderHealthOnFailure in the catch block' {
            $scriptContent | Should -Match 'Update-ProviderHealthOnFailure'
        }
        It 'passes lastProviderOutputText to failure classifier' {
            $scriptContent | Should -Match '\$script:lastProviderOutputText'
        }
    }
}
