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
    $pwshPath      = (Get-Command pwsh -ErrorAction Stop).Source

    $skillName = 'aloop'
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
        It 'runtime cli source: <skillName>/cli/dist/' {
            Join-Path $repoRoot "$skillName/cli/dist" | Should -Exist
        }
        It 'runtime cli source: <skillName>/cli/aloop.mjs' {
            Join-Path $repoRoot "$skillName/cli/aloop.mjs" | Should -Exist
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

        It "has aloop-setup.prompt.md"  { Join-Path $promptDir "aloop-setup.prompt.md"  | Should -Exist }
        It "has aloop-start.prompt.md"  { Join-Path $promptDir "aloop-start.prompt.md"  | Should -Exist }
        It "has aloop-status.prompt.md" { Join-Path $promptDir "aloop-status.prompt.md" | Should -Exist }
        It "has aloop-stop.prompt.md"   { Join-Path $promptDir "aloop-stop.prompt.md"   | Should -Exist }
        It "has aloop-steer.prompt.md"  { Join-Path $promptDir "aloop-steer.prompt.md"  | Should -Exist }
        It 'has exactly 5 .prompt.md files (no extras, no missing)' {
            (Get-ChildItem $promptDir -File -Filter '*.prompt.md').Count | Should -Be 5
        }
    }

    Context 'Runtime bin contains required scripts' {
        BeforeAll { $binDir = Join-Path $repoRoot "$skillName/bin" }

        It 'has loop.ps1'            { Join-Path $binDir 'loop.ps1'            | Should -Exist }
        It 'has loop.sh'             { Join-Path $binDir 'loop.sh'             | Should -Exist }
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
        It 'runtime cli source is "$skillName\cli\dist"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "\$skillName\\cli\\dist"'
        }
        It 'runtime cli aloop.mjs source is "$skillName\cli\aloop.mjs"' {
            $scriptContent | Should -Match 'Join-Path \$scriptDir "\$skillName\\cli\\aloop\.mjs"'
        }
    }
}

# ============================================================================
# 1b. Review gate: command/prompt CLI entrypoint consistency
# ============================================================================
Describe 'Command and prompt CLI entrypoint consistency' {
    It 'uses the installed aloop.mjs entrypoint for all node-based CLI invocations' {
        $docs = @(
            Get-ChildItem (Join-Path $repoRoot "claude/commands/$skillName") -File -Filter '*.md'
            Get-ChildItem (Join-Path $repoRoot 'copilot/prompts') -File -Filter 'aloop-*.prompt.md'
        )

        foreach ($doc in $docs) {
            $content = Get-Content $doc.FullName -Raw
            $codeSpans = [regex]::Matches($content, '`([^`]+)`') | ForEach-Object { $_.Groups[1].Value }

            foreach ($span in $codeSpans) {
                if ($span -match '^node\s+~/') {
                    $span | Should -Match '^node ~/.aloop/cli/aloop\.mjs(?:\s|$)'
                }
            }

            $content | Should -Not -Match 'node ~/.aloop/cli/dist/index\.js'
            $content | Should -Not -Match 'node ~/.aloop/cli/src/index\.ts'
        }
    }

    It 'keeps setup/start docs wired to fallback commands via aloop.mjs' {
        $expectedSnippets = @(
            @{ Path = 'claude/commands/aloop/setup.md'; Pattern = 'node ~/.aloop/cli/aloop\.mjs discover' },
            @{ Path = 'claude/commands/aloop/setup.md'; Pattern = 'node ~/.aloop/cli/aloop\.mjs scaffold' },
            @{ Path = 'claude/commands/aloop/start.md'; Pattern = 'node ~/.aloop/cli/aloop\.mjs resolve' },
            @{ Path = 'copilot/prompts/aloop-setup.prompt.md'; Pattern = 'node ~/.aloop/cli/aloop\.mjs discover' },
            @{ Path = 'copilot/prompts/aloop-setup.prompt.md'; Pattern = 'node ~/.aloop/cli/aloop\.mjs scaffold' },
            @{ Path = 'copilot/prompts/aloop-start.prompt.md'; Pattern = 'node ~/.aloop/cli/aloop\.mjs resolve' }
        )

        foreach ($item in $expectedSnippets) {
            $fullPath = Join-Path $repoRoot $item.Path
            (Get-Content $fullPath -Raw) | Should -Match $item.Pattern
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
        It 'cli copies into $aloopDir\cli\dist' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "cli\\dist"'
        }
        It 'aloop.mjs copies into $aloopDir\cli' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "cli\\aloop\.mjs"'
        }
        It 'aloop.cmd shim is created in $aloopDir\bin' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "bin\\aloop\.cmd"'
        }
        It 'aloop shim is created in $aloopDir\bin' {
            $scriptContent | Should -Match 'Join-Path \$aloopDir "bin\\aloop"'
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

        It 'CLI line references $aloopDir\cli\' {
            $line = $scriptLines | Where-Object { $_ -match 'CLI:' -and $_ -match 'cli' }
            $line | Should -Not -BeNullOrEmpty
            $line | Should -Match '\$aloopDir\\cli\\'
        }

        It 'Shims line references aloop.cmd and aloop' {
            $line = $scriptLines | Where-Object { $_ -match 'Shims:' -and $_ -match 'aloop' }
            $line | Should -Not -BeNullOrEmpty
            $line | Should -Match 'aloop\.cmd'
            $line | Should -Match '\baloop\b'
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

# ============================================================================
# 5. Behavioral execution coverage for key installer branches
# ============================================================================
Describe 'Installer behavioral branches' {
    BeforeAll {
        $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("aloop-install-tests-" + [guid]::NewGuid().ToString('N'))
        $testHome = Join-Path $tempRoot 'home'
        $testAppData = Join-Path $tempRoot 'appdata'
        New-Item -ItemType Directory -Path $testHome -Force | Out-Null
        New-Item -ItemType Directory -Path $testAppData -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $testAppData 'Code\User') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $testAppData 'Code - Insiders\User') -Force | Out-Null

        function Invoke-InstallerIsolated {
            param(
                [string[]]$InstallerArgs,
                [string]$HomePath = $testHome,
                [string]$AppDataPath = $testAppData,
                [string]$PathValue = $env:PATH
            )

            $previousHome = $env:HOME
            $previousUserProfile = $env:USERPROFILE
            $previousAppData = $env:APPDATA
            $previousPath = $env:PATH
            try {
                $env:HOME = $HomePath
                $env:USERPROFILE = $HomePath
                $env:APPDATA = $AppDataPath
                $env:PATH = $PathValue
                return (& $pwshPath -NoProfile -File $scriptPath @InstallerArgs 2>&1 | Out-String)
            } finally {
                $env:HOME = $previousHome
                $env:USERPROFILE = $previousUserProfile
                $env:APPDATA = $previousAppData
                $env:PATH = $previousPath
            }
        }
    }

    AfterAll {
        if (Test-Path $tempRoot) {
            Remove-Item -Recurse -Force $tempRoot
        }
    }

    It 'supports -DryRun path and reports dry-run mode in summary' {
        $output = Invoke-InstallerIsolated -InstallerArgs @('-All', '-SkipCliCheck', '-DryRun')

        $output | Should -Match 'Mode: DRY RUN'
        $output | Should -Match '\[DRY RUN\]'
        (Test-Path (Join-Path $testHome '.aloop\projects')) | Should -BeFalse
        (Test-Path (Join-Path $testHome '.aloop\sessions')) | Should -BeFalse
    }

    It 'supports -Force path and creates runtime/config targets' {
        $output = Invoke-InstallerIsolated -InstallerArgs @('-All', '-SkipCliCheck', '-Force')

        $output | Should -Match 'Mode: FORCE'
        (Join-Path $testHome '.aloop\config.yml') | Should -Exist
        (Join-Path $testHome '.aloop\bin\loop.ps1') | Should -Exist
        (Join-Path $testHome '.aloop\templates\PROMPT_plan.md') | Should -Exist
        (Join-Path $testHome '.aloop\cli') | Should -Exist
        (Join-Path $testHome '.aloop\cli\dist\index.js') | Should -Exist
        (Join-Path $testHome '.aloop\cli\aloop.mjs') | Should -Exist
        (Join-Path $testHome '.aloop\bin\aloop.cmd') | Should -Exist
        (Join-Path $testHome '.aloop\bin\aloop') | Should -Exist
        (Join-Path $testHome '.aloop\projects') | Should -Exist
        (Join-Path $testHome '.aloop\sessions') | Should -Exist
    }

    It 'copies commands only for harnesses where HasCommands is true' {
        Invoke-InstallerIsolated -InstallerArgs @('-All', '-SkipCliCheck', '-Force') | Out-Null

        (Join-Path $testHome ".claude\commands\$skillName\setup.md") | Should -Exist
        (Join-Path $testHome ".codex\commands\$skillName\setup.md") | Should -Exist
        (Join-Path $testHome '.copilot\commands') | Should -Not -Exist
        (Join-Path $testHome '.agents\commands') | Should -Not -Exist
    }

    It 'covers no-harness summary variant for unknown harness values' {
        $output = Invoke-InstallerIsolated -InstallerArgs @('-Harnesses', 'unknown', '-SkipCliCheck', '-DryRun')

        $output | Should -Match 'WARNING: Unknown harness'
        $output | Should -Match 'No harnesses selected\. Skipping skill/command installation\.'
    }

    It 'removes stale non-command harness command directories during install' {
        $staleCopilot = Join-Path $testHome '.copilot\commands\aloop'
        $staleAgents = Join-Path $testHome '.agents\commands\aloop'
        New-Item -ItemType Directory -Path $staleCopilot -Force | Out-Null
        New-Item -ItemType Directory -Path $staleAgents -Force | Out-Null
        Set-Content -Path (Join-Path $staleCopilot 'stale.txt') -Value 'x'
        Set-Content -Path (Join-Path $staleAgents 'stale.txt') -Value 'x'

        Invoke-InstallerIsolated -InstallerArgs @('-All', '-SkipCliCheck', '-Force') | Out-Null

        (Test-Path $staleCopilot) | Should -BeFalse
        (Test-Path $staleAgents) | Should -BeFalse
        (Test-Path (Join-Path $testHome '.copilot\commands')) | Should -BeFalse
        (Test-Path (Join-Path $testHome '.agents\commands')) | Should -BeFalse
    }

    It 'covers CLI check branch when npm is unavailable' {
        $pathWithoutTools = Join-Path $tempRoot 'path-without-tools'
        New-Item -ItemType Directory -Path $pathWithoutTools -Force | Out-Null

        $output = Invoke-InstallerIsolated -InstallerArgs @('-All', '-DryRun') -PathValue $pathWithoutTools

        $output | Should -Match '\[MISSING\]'
        $output | Should -Match 'npm not found — cannot auto-install'
    }

    It 'covers CLI auto-install dry-run branch when npm is available' {
        $fakeNpmPath = Join-Path $tempRoot 'fake-npm'
        New-Item -ItemType Directory -Path $fakeNpmPath -Force | Out-Null
        Set-Content -Path (Join-Path $fakeNpmPath 'npm.cmd') -Value "@echo off`r`nexit /b 0"

        $output = Invoke-InstallerIsolated -InstallerArgs @('-All', '-DryRun') -PathValue $fakeNpmPath

        $output | Should -Match '\[DRY RUN\] npm install -g'
    }

    It 'skips VS Code prompt install when no VS Code user directory exists' {
        $appDataWithoutVsCode = Join-Path $tempRoot 'appdata-no-vscode'
        New-Item -ItemType Directory -Path $appDataWithoutVsCode -Force | Out-Null

        $output = Invoke-InstallerIsolated -InstallerArgs @('-Harnesses', 'copilot', '-SkipCliCheck', '-Force') -AppDataPath $appDataWithoutVsCode

        $output | Should -Match 'No VS Code installation found — skipped \.prompt\.md files\.'
        (Test-Path (Join-Path $appDataWithoutVsCode 'Code\User\prompts')) | Should -BeFalse
        (Test-Path (Join-Path $appDataWithoutVsCode 'Code - Insiders\User\prompts')) | Should -BeFalse
    }

    It 'installs prompts for VS Code stable and skips VS Code Insiders when absent' {
        $appDataStableOnly = Join-Path $tempRoot 'appdata-stable-only'
        New-Item -ItemType Directory -Path (Join-Path $appDataStableOnly 'Code\User') -Force | Out-Null

        $output = Invoke-InstallerIsolated -InstallerArgs @('-Harnesses', 'copilot', '-SkipCliCheck', '-Force') -AppDataPath $appDataStableOnly

        (Join-Path $appDataStableOnly 'Code\User\prompts\aloop-setup.prompt.md') | Should -Exist
        (Test-Path (Join-Path $appDataStableOnly 'Code - Insiders\User\prompts\aloop-setup.prompt.md')) | Should -BeFalse
        $output | Should -Match '\[VS Code Insiders\] not installed — skipping'
    }

    It 'CLI shims contain correct invocation path to aloop.mjs' {
        Invoke-InstallerIsolated -InstallerArgs @('-All', '-SkipCliCheck', '-Force') | Out-Null

        $cmdContent = Get-Content (Join-Path $testHome '.aloop\bin\aloop.cmd') -Raw
        $shContent  = Get-Content (Join-Path $testHome '.aloop\bin\aloop')  -Raw

        $cmdContent | Should -Match 'aloop\.mjs'
        $shContent  | Should -Match 'aloop\.mjs'
        $shContent  | Should -Match '#!/bin/sh'
    }
}
