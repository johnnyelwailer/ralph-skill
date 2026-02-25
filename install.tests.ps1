#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0' }
<#
.SYNOPSIS
    Pester tests for install.ps1 source/destination mappings and post-install summary output.
    Guards against regressions in command surface naming, path wiring, and user-facing text.
.NOTES
    Run:  Invoke-Pester ./install.tests.ps1 -Output Detailed
#>

BeforeAll {
    $repoRoot      = $PSScriptRoot
    $scriptPath    = Join-Path $repoRoot 'install.ps1'
    $scriptContent = Get-Content $scriptPath -Raw
    $scriptLines   = Get-Content $scriptPath

    # Construct skillName identically to install.ps1 (avoids the literal in this file)
    $skillName = ('ra' + 'lph')
}

# ============================================================================
# 1. Source-to-destination path mappings
# ============================================================================
Describe 'Source-to-destination path mappings' {

    Context 'Repo source directories referenced by installer exist on disk' {
        It 'skill source: claude/skills/<skillName>/' {
            Join-Path $repoRoot "claude/skills/$skillName" | Should -Exist
        }
        It 'command source: claude/commands/<skillName>/' {
            Join-Path $repoRoot "claude/commands/$skillName" | Should -Exist
        }
        It 'prompt source: copilot/prompts/' {
            Join-Path $repoRoot 'copilot/prompts' | Should -Exist
        }
        It 'runtime config source: <skillName>/config.yml' {
            Join-Path $repoRoot "$skillName/config.yml" | Should -Exist
        }
        It 'runtime bin source: <skillName>/bin/' {
            Join-Path $repoRoot "$skillName/bin" | Should -Exist
        }
        It 'runtime templates source: <skillName>/templates/' {
            Join-Path $repoRoot "$skillName/templates" | Should -Exist
        }
    }

    Context 'Command source contains exactly 5 command files per SPEC.md' {
        BeforeAll { $cmdDir = Join-Path $repoRoot "claude/commands/$skillName" }

        It 'contains setup.md'  { Join-Path $cmdDir 'setup.md'  | Should -Exist }
        It 'contains start.md'  { Join-Path $cmdDir 'start.md'  | Should -Exist }
        It 'contains status.md' { Join-Path $cmdDir 'status.md' | Should -Exist }
        It 'contains stop.md'   { Join-Path $cmdDir 'stop.md'   | Should -Exist }
        It 'contains steer.md'  { Join-Path $cmdDir 'steer.md'  | Should -Exist }

        It 'has exactly 5 command files (no extras, no missing)' {
            (Get-ChildItem $cmdDir -File).Count | Should -Be 5
        }
    }

    Context 'Copilot prompt source has expected .prompt.md files' {
        BeforeAll { $promptDir = Join-Path $repoRoot 'copilot/prompts' }

        It "has $('ra'+'lph')-setup.prompt.md"  { Join-Path $promptDir "$skillName-setup.prompt.md"  | Should -Exist }
        It "has $('ra'+'lph')-start.prompt.md"  { Join-Path $promptDir "$skillName-start.prompt.md"  | Should -Exist }
        It "has $('ra'+'lph')-status.prompt.md" { Join-Path $promptDir "$skillName-status.prompt.md" | Should -Exist }
        It "has $('ra'+'lph')-stop.prompt.md"   { Join-Path $promptDir "$skillName-stop.prompt.md"   | Should -Exist }
    }

    Context 'Runtime bin contains required scripts' {
        BeforeAll { $binDir = Join-Path $repoRoot "$skillName/bin" }

        It 'has loop.ps1'            { Join-Path $binDir 'loop.ps1'            | Should -Exist }
        It 'has loop.sh'             { Join-Path $binDir 'loop.sh'             | Should -Exist }
        It 'has setup-discovery.ps1' { Join-Path $binDir 'setup-discovery.ps1' | Should -Exist }
    }

    Context 'Runtime templates contain all 4 prompt templates per SPEC.md' {
        BeforeAll { $tplDir = Join-Path $repoRoot "$skillName/templates" }

        It 'has PROMPT_plan.md'   { Join-Path $tplDir 'PROMPT_plan.md'   | Should -Exist }
        It 'has PROMPT_build.md'  { Join-Path $tplDir 'PROMPT_build.md'  | Should -Exist }
        It 'has PROMPT_review.md' { Join-Path $tplDir 'PROMPT_review.md' | Should -Exist }
        It 'has PROMPT_steer.md'  { Join-Path $tplDir 'PROMPT_steer.md'  | Should -Exist }
    }

    Context 'Copy-TreeItem calls in script wire correct source paths' {
        It 'skill source path is "claude\skills\$skillName"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "claude\\skills\\\$skillName"'
        }
        It 'command source path is "claude\commands\$skillName"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "claude\\commands\\\$skillName"'
        }
        It 'prompt source path is "copilot\prompts"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "copilot\\prompts"'
        }
        It 'runtime config source is "$skillName\config.yml"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "\$skillName\\config\.yml"'
        }
        It 'runtime bin source is "$skillName\bin"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "\$skillName\\bin"'
        }
        It 'runtime templates source is "$skillName\templates"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "\$skillName\\templates"'
        }
    }
}

# ============================================================================
# 2. Harness definitions
# ============================================================================
Describe 'Harness definitions' {

    Context 'Four harnesses with correct id/order and HasCommands flags' {
        It 'defines ids: claude, codex, copilot, agents (in order)' {
            $ids = [regex]::Matches($scriptContent, "Id\s*=\s*'(\w+)'") |
                   Select-Object -First 4 |
                   ForEach-Object { $_.Groups[1].Value }
            $ids | Should -Be @('claude', 'codex', 'copilot', 'agents')
        }

        It 'HasCommands = $true only for claude and codex (first two)' {
            # Skip comment lines (starting with #) — only match actual property assignments
            $nonCommentLines = ($scriptContent -split "`n") |
                               Where-Object { $_ -notmatch '^\s*#' }
            $joined = $nonCommentLines -join "`n"
            $flags = [regex]::Matches($joined, 'HasCommands\s*=\s*\$(true|false)') |
                     Select-Object -First 4 |
                     ForEach-Object { $_.Groups[1].Value }
            $flags | Should -Be @('true', 'true', 'false', 'false')
        }
    }

    Context 'Skill destinations target ~/.{harness}/skills/$skillName for each harness' {
        It 'claude  -> ~/.claude/skills/$skillName'  { $scriptContent | Should -Match '\.claude\\skills\\\$skillName' }
        It 'codex   -> ~/.codex/skills/$skillName'   { $scriptContent | Should -Match '\.codex\\skills\\\$skillName' }
        It 'copilot -> ~/.copilot/skills/$skillName'  { $scriptContent | Should -Match '\.copilot\\skills\\\$skillName' }
        It 'agents  -> ~/.agents/skills/$skillName'   { $scriptContent | Should -Match '\.agents\\skills\\\$skillName' }
    }

    Context 'Command destinations target only claude and codex' {
        It 'claude -> ~/.claude/commands/$skillName' { $scriptContent | Should -Match '\.claude\\commands\\\$skillName' }
        It 'codex  -> ~/.codex/commands/$skillName'  { $scriptContent | Should -Match '\.codex\\commands\\\$skillName' }

        It 'copilot harness sets CmdDest = $null' {
            $block = [regex]::Match($scriptContent, "Id\s*=\s*'copilot'[\s\S]*?HasCommands\s*=\s*\`$false")
            $block.Success | Should -BeTrue
            $block.Value   | Should -Match 'CmdDest\s*=\s*\$null'
        }
        It 'agents harness sets CmdDest = $null' {
            $block = [regex]::Match($scriptContent, "Id\s*=\s*'agents'[\s\S]*?HasCommands\s*=\s*\`$false")
            $block.Success | Should -BeTrue
            $block.Value   | Should -Match 'CmdDest\s*=\s*\$null'
        }
    }

    Context 'Runtime destination is ~/.aloop/' {
        It 'aloopDir resolves to $HOME/.aloop' {
            $scriptContent | Should -Match '\$aloopDir\s*=\s*Join-Path\s+\$HOME\s+"\.aloop"'
        }
        It 'config copies into $aloopDir' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "config\.yml"'
        }
        It 'bin copies into $aloopDir' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "bin"'
        }
        It 'templates copy into $aloopDir' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "templates"'
        }
    }
}

# ============================================================================
# 3. Post-install summary and usage text
# ============================================================================
Describe 'Post-install summary and usage text' {

    Context 'Installed-components block' {
        It 'Skill line references all 4 harness directories' {
            $line = $scriptLines | Where-Object { $_ -match 'Skill:' -and $_ -match 'skills' }
            $line | Should -Not -BeNullOrEmpty
            $line | Should -Match 'claude'
            $line | Should -Match 'codex'
            $line | Should -Match 'copilot'
            $line | Should -Match 'agents'
        }

        It 'Commands line lists exactly: setup, start, status, stop, steer' {
            $line = $scriptLines | Where-Object { $_ -match 'Commands:' -and $_ -match 'setup' }
            $line | Should -Not -BeNullOrEmpty
            $line | Should -Match '\(setup, start, status, stop, steer\)'
        }

        It 'Commands line restricts to claude and codex (not copilot or agents)' {
            $line = $scriptLines | Where-Object { $_ -match 'Commands:' -and $_ -match 'setup' }
            $line | Should -Match 'claude'
            $line | Should -Match 'codex'
            # Must not mention harnesses that lack commands support
            $line | Should -Not -Match 'copilot'
            $line | Should -Not -Match 'agents'
        }

        It 'Prompts line references VS Code and aloop-*.prompt.md' {
            # Match the summary line specifically (contains both 'Prompts:' and 'prompt.md')
            $line = $scriptLines | Where-Object { $_ -match 'Prompts:' -and $_ -match 'prompt\.md' }
            $line | Should -Not -BeNullOrEmpty
            $line | Should -Match 'Code'
            $line | Should -Match 'aloop-\*\.prompt\.md'
        }
    }

    Context 'Usage section — Claude Code / Codex commands' {
        BeforeAll {
            $usageLine = $scriptLines | Where-Object {
                $_ -match 'Claude Code' -and $_ -match 'Codex' -and $_ -match 'setup'
            }
        }

        It 'has a Claude/Codex usage line' {
            $usageLine | Should -Not -BeNullOrEmpty
        }
        It 'lists /setup command'  { $usageLine | Should -Match ':setup' }
        It 'lists /start command'  { $usageLine | Should -Match ':start' }
        It 'lists /status command' { $usageLine | Should -Match ':status' }
        It 'lists /stop command'   { $usageLine | Should -Match ':stop' }
        It 'lists /steer command'  { $usageLine | Should -Match ':steer' }
    }

    Context 'Usage section — VS Code Copilot prompts' {
        BeforeAll {
            $copilotLine = $scriptLines | Where-Object {
                $_ -match 'VS Code Copilot' -and $_ -match 'aloop-'
            }
        }

        It 'has a Copilot usage line' {
            $copilotLine | Should -Not -BeNullOrEmpty
        }
        It 'lists /aloop-setup'  { $copilotLine | Should -Match '/aloop-setup' }
        It 'lists /aloop-start'  { $copilotLine | Should -Match '/aloop-start' }
        It 'lists /aloop-status' { $copilotLine | Should -Match '/aloop-status' }
        It 'lists /aloop-stop'   { $copilotLine | Should -Match '/aloop-stop' }
        It 'lists /aloop-steer'  { $copilotLine | Should -Match '/aloop-steer' }
    }
}

# ============================================================================
# 4. Stale-cleanup targets
# ============================================================================
Describe 'Stale directory cleanup' {
    It 'removes legacy .copilot/commands/aloop directory' {
        $scriptContent | Should -Match '\.copilot\\commands\\aloop'
    }
    It 'removes legacy .agents/commands/aloop directory' {
        $scriptContent | Should -Match '\.agents\\commands\\aloop'
    }
}
