#!/usr/bin/env pwsh
# Ralph Skill Installer
# Copies skill/command files to the correct directories for each AI harness,
# and installs the Ralph runtime (~/.ralph/).
#
# Usage: ./install.ps1 [-Force] [-DryRun] [-All] [-Harnesses claude,codex,...] [-SkipCliCheck]
#
# Harness skill/command directories (official sources):
#   Claude Code      : ~/.claude/skills/  + ~/.claude/commands/  (https://docs.anthropic.com/claude-code)
#   Codex CLI        : ~/.codex/skills/   + ~/.codex/commands/   (https://github.com/openai/codex)
#   GH Copilot       : ~/.copilot/skills/ only — no commands dir (https://code.visualstudio.com/docs/copilot/customization/agent-skills)
#   Agents           : ~/.agents/skills/  only — generic standard (agentskills.io)
#   VS Code (stable) : $APPDATA\Code\User\prompts\         — .prompt.md slash commands
#   VS Code Insiders : $APPDATA\Code - Insiders\User\prompts\ — .prompt.md slash commands

param(
    [switch]$Force,                  # Overwrite existing files without prompting
    [switch]$DryRun,                 # Show what would be done without doing it
    [switch]$All,                    # Install all harnesses without prompting
    [string[]]$Harnesses = @(),      # Pre-select harnesses: claude, codex, copilot, agents
    [switch]$SkipCliCheck            # Skip CLI detection and auto-install
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
$ralphDir = Join-Path $HOME ".ralph"

# ---- Harness definitions -------------------------------------------------------
# HasCommands = $true  → also installs claude\commands\ralph to <harness>/commands/ralph
# HasCommands = $false → harness uses a different mechanism (e.g. .prompt.md); skip
$allHarnesses = @(
    [PSCustomObject]@{
        Id          = 'claude'
        Name        = 'Claude Code'
        SkillDest   = Join-Path $HOME ".claude\skills\ralph"
        CmdDest     = Join-Path $HOME ".claude\commands\ralph"
        HasCommands = $true
    }
    [PSCustomObject]@{
        Id          = 'codex'
        Name        = 'Codex CLI'
        SkillDest   = Join-Path $HOME ".codex\skills\ralph"
        CmdDest     = Join-Path $HOME ".codex\commands\ralph"
        HasCommands = $true
    }
    [PSCustomObject]@{
        Id          = 'copilot'
        Name        = 'GH Copilot (VS Code / VS Code Insiders)'
        SkillDest   = Join-Path $HOME ".copilot\skills\ralph"
        CmdDest     = $null
        HasCommands = $false
        # Note: .prompt.md files are installed separately into VS Code user prompts dirs
    }
    [PSCustomObject]@{
        Id          = 'agents'
        Name        = 'Agents (generic / agentskills.io)'
        SkillDest   = Join-Path $HOME ".agents\skills\ralph"
        CmdDest     = $null
        HasCommands = $false
    }
)

# ---- CLI provider definitions (for detection + optional auto-install) -----------
# These map to the providers used by loop.ps1 — independent of skill-file harnesses.
$cliToolDefs = @(
    [PSCustomObject]@{
        Id         = 'claude'
        Name       = 'Claude Code'
        Command    = 'claude'
        NpmPackage = '@anthropic-ai/claude-code'
        Auth       = @(
            'Run: claude auth  (opens browser OAuth flow)'
            'Or:  set $env:ANTHROPIC_API_KEY in your PowerShell profile'
            'Keys: https://console.anthropic.com/account/keys'
        )
    }
    [PSCustomObject]@{
        Id         = 'codex'
        Name       = 'OpenAI Codex CLI'
        Command    = 'codex'
        NpmPackage = '@openai/codex'
        Auth       = @(
            'Run: codex auth  (opens browser OAuth flow)'
            'Or:  set $env:OPENAI_API_KEY in your PowerShell profile'
            'Keys: https://platform.openai.com/api-keys'
        )
    }
    [PSCustomObject]@{
        Id         = 'gemini'
        Name       = 'Google Gemini CLI'
        Command    = 'gemini'
        NpmPackage = '@google/gemini-cli'
        Auth       = @(
            'Run: gemini auth  (browser OAuth — free tier, no key needed)'
            'Or:  set $env:GEMINI_API_KEY in your PowerShell profile'
            'Keys: https://aistudio.google.com/app/apikey'
        )
    }
    [PSCustomObject]@{
        Id         = 'copilot'
        Name       = 'GitHub Copilot CLI'
        Command    = 'copilot'
        NpmPackage = '@githubnext/github-copilot-cli'
        Auth       = @(
            'Option A — GitHub CLI extension (recommended):'
            '  winget install GitHub.cli  (or: https://cli.github.com)'
            '  gh auth login'
            '  gh extension install github/gh-copilot'
            'Option B — legacy standalone npm package:'
            '  npm install -g @githubnext/github-copilot-cli'
            '  github-copilot-cli auth'
            'Requires a GitHub account with an active Copilot subscription'
        )
    }
)

# ============================================================================
# HELPERS
# ============================================================================

function Test-CommandExists {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Install-CliTool {
    param([PSCustomObject]$Tool)
    if (-not (Test-CommandExists 'npm')) {
        Write-Warning "  npm not found. Install Node.js from https://nodejs.org then rerun."
        return $false
    }
    if ($DryRun) {
        Write-Host "  [DRY RUN] npm install -g $($Tool.NpmPackage)" -ForegroundColor DarkGray
        return $true
    }
    Write-Host "  Running: npm install -g $($Tool.NpmPackage)" -ForegroundColor Gray
    npm install -g $Tool.NpmPackage
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "  npm install failed (exit $LASTEXITCODE) for $($Tool.NpmPackage)"
        return $false
    }
    return $true
}

function Copy-TreeItem {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$Label
    )

    if (-not (Test-Path $Source)) {
        Write-Warning "Source not found, skipping: $Source"
        return
    }

    $isDir = (Get-Item $Source).PSIsContainer

    if ($isDir) {
        # Copy directory contents recursively
        $items = Get-ChildItem -Path $Source -Recurse -File
        foreach ($item in $items) {
            $relativePath = $item.FullName.Substring($Source.Length).TrimStart('\', '/')
            $destPath = Join-Path $Destination $relativePath
            $destDir = Split-Path $destPath -Parent

            if (-not (Test-Path $destDir)) {
                if ($DryRun) {
                    Write-Host "  [DRY RUN] mkdir $destDir" -ForegroundColor DarkGray
                } else {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
            }

            $exists = Test-Path $destPath
            if ($exists -and -not $Force) {
                Write-Host "  SKIP (exists): $destPath" -ForegroundColor Yellow
                continue
            }

            if ($DryRun) {
                $action = if ($exists) { "OVERWRITE" } else { "COPY" }
                Write-Host "  [DRY RUN] $action $($item.FullName) -> $destPath" -ForegroundColor DarkGray
            } else {
                Copy-Item -Path $item.FullName -Destination $destPath -Force
                $action = if ($exists) { "Updated" } else { "Created" }
                Write-Host "  $action`: $destPath" -ForegroundColor Green
            }
        }
    } else {
        # Copy single file
        $destDir = Split-Path $Destination -Parent
        if (-not (Test-Path $destDir)) {
            if ($DryRun) {
                Write-Host "  [DRY RUN] mkdir $destDir" -ForegroundColor DarkGray
            } else {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
        }

        $exists = Test-Path $Destination
        if ($exists -and -not $Force) {
            Write-Host "  SKIP (exists): $Destination" -ForegroundColor Yellow
            return
        }

        if ($DryRun) {
            $action = if ($exists) { "OVERWRITE" } else { "COPY" }
            Write-Host "  [DRY RUN] $action $Source -> $Destination" -ForegroundColor DarkGray
        } else {
            Copy-Item -Path $Source -Destination $Destination -Force
            $action = if ($exists) { "Updated" } else { "Created" }
            Write-Host "  $action`: $Destination" -ForegroundColor Green
        }
    }
}

# ============================================================================
# INTERACTIVE UI
# ============================================================================

function Show-CheckboxMenu {
    <#
    .SYNOPSIS  Interactive keyboard-driven checkbox menu.
    .OUTPUTS   bool[] — one entry per item (true = selected), or $null if cancelled (Esc).
    #>
    param(
        [Parameter(Mandatory)][string]  $Prompt,
        [Parameter(Mandatory)][string[]]$Items,
        [string[]]$SubTexts    = @(),    # optional secondary text per item (right side)
        [bool[]  ]$InitialState = @()    # pre-checked items
    )

    $count = $Items.Count
    if ($count -eq 0) { return ,[bool[]]@() }

    $checked = [bool[]]::new($count)
    for ($i = 0; $i -lt [Math]::Min($InitialState.Count, $count); $i++) {
        $checked[$i] = $InitialState[$i]
    }
    $cursor = 0

    Write-Host $Prompt -ForegroundColor White
    Write-Host ""
    $menuTop = [Console]::CursorTop

    # Render is a scriptblock so it can read $cursor/$checked/$menuTop from the
    # enclosing function scope via PowerShell dynamic scoping (& invocation).
    $render = {
        [Console]::SetCursorPosition(0, $menuTop)
        $w = try { [Math]::Max([Console]::WindowWidth - 1, 40) } catch { 79 }

        for ($i = 0; $i -lt $count; $i++) {
            $box  = if ($checked[$i]) { '[x]' } else { '[ ]' }
            $mark = if ($i -eq $cursor) { '>' } else { ' ' }
            $sub  = if (($SubTexts.Count -gt $i) -and $SubTexts[$i]) { "  — $($SubTexts[$i])" } else { '' }
            $line = "  $mark $box  $($Items[$i])$sub"
            $line = $line.PadRight($w)
            if ($line.Length -gt $w) { $line = $line.Substring(0, $w) }

            if ($i -eq $cursor) {
                [Console]::BackgroundColor = [ConsoleColor]::DarkBlue
                [Console]::ForegroundColor = [ConsoleColor]::White
            } elseif ($checked[$i]) {
                [Console]::ForegroundColor = [ConsoleColor]::Green
            } else {
                [Console]::ForegroundColor = [ConsoleColor]::Gray
            }
            [Console]::Write($line)
            [Console]::ResetColor()
            [Console]::WriteLine()
        }

        $hint = "  [↑↓] move   [Space] toggle   [A] all/none   [Enter] confirm   [Esc] cancel"
        $hint = $hint.PadRight($w)
        if ($hint.Length -gt $w) { $hint = $hint.Substring(0, $w) }
        [Console]::ForegroundColor = [ConsoleColor]::DarkGray
        [Console]::Write($hint)
        [Console]::ResetColor()
        [Console]::WriteLine()
    }

    [Console]::CursorVisible = $false
    try {
        & $render
        $done      = $false
        $cancelled = $false

        while (-not $done) {
            $key = [Console]::ReadKey($true)

            if     ($key.Key -eq [ConsoleKey]::UpArrow)   { $cursor = if ($cursor -gt 0)            { $cursor - 1 } else { $count - 1 } }
            elseif ($key.Key -eq [ConsoleKey]::DownArrow) { $cursor = if ($cursor -lt ($count - 1)) { $cursor + 1 } else { 0 }          }
            elseif ($key.Key -eq [ConsoleKey]::Spacebar)  { $checked[$cursor] = -not $checked[$cursor] }
            elseif ($key.Key -eq [ConsoleKey]::Enter)     { $done = $true }
            elseif ($key.Key -eq [ConsoleKey]::Escape)    { $cancelled = $true; $done = $true }
            elseif ($key.KeyChar -in 'a','A') {
                $anyUnchecked = $checked -contains $false
                for ($j = 0; $j -lt $count; $j++) { $checked[$j] = $anyUnchecked }
            }

            if (-not $done) { & $render }
        }

        [Console]::SetCursorPosition(0, $menuTop + $count + 1)
        Write-Host ""
        if ($cancelled) { return $null }
        return ,$checked
    } finally {
        [Console]::CursorVisible = $true
    }
}

# ============================================================================
# MAIN
# ============================================================================

Write-Host ""
Write-Host "=== Ralph Skill Installer ===" -ForegroundColor Cyan
Write-Host "Source: $scriptDir" -ForegroundColor Gray
Write-Host "Ralph runtime: $ralphDir" -ForegroundColor Gray
if ($DryRun) { Write-Host "Mode: DRY RUN (no changes will be made)" -ForegroundColor Yellow }
if ($Force)  { Write-Host "Mode: FORCE (overwriting existing files)" -ForegroundColor Yellow }
Write-Host ""

# ---- Cleanup: remove commands/ dirs that were incorrectly installed by older versions
# Only claude and codex support a commands/ directory; remove it from any other harness.
$staleCommandsDirs = @(
    Join-Path $HOME ".copilot\commands\ralph"
    Join-Path $HOME ".agents\commands\ralph"
)
foreach ($stale in $staleCommandsDirs) {
    if (Test-Path $stale) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] REMOVE stale commands dir: $stale" -ForegroundColor DarkGray
        } else {
            Remove-Item -Recurse -Force $stale
            $parent = Split-Path $stale -Parent
            if ((Test-Path $parent) -and -not (Get-ChildItem $parent -ErrorAction SilentlyContinue)) {
                Remove-Item -Force $parent
            }
            Write-Host "  Removed stale commands dir: $stale" -ForegroundColor Yellow
        }
    }
}
Write-Host ""

# ---- CLI provider detection & optional auto-install --------------------------
if (-not $SkipCliCheck) {
    Write-Host "Checking for AI provider CLIs..." -ForegroundColor White
    Write-Host ""

    $missingTools = @()
    foreach ($tool in $cliToolDefs) {
        if (Test-CommandExists $tool.Command) {
            Write-Host "  [OK]      $($tool.Name) ($($tool.Command))" -ForegroundColor Green
        } else {
            Write-Host "  [MISSING] $($tool.Name) ($($tool.Command))" -ForegroundColor Yellow
            $missingTools += $tool
        }
    }
    Write-Host ""

    if ($missingTools.Count -gt 0) {
        if (-not (Test-CommandExists 'npm')) {
            Write-Host "  Note: npm not found — cannot auto-install." -ForegroundColor Yellow
            Write-Host "    Install Node.js to enable: winget install OpenJS.NodeJS.LTS" -ForegroundColor Gray
            Write-Host "    Or download from: https://nodejs.org" -ForegroundColor Gray
            Write-Host ""
        } else {
            if ($All) {
                # -All flag: install all missing tools without prompting
                foreach ($tool in $missingTools) {
                    Write-Host "Auto-installing $($tool.Name)..." -ForegroundColor White
                    Install-CliTool -Tool $tool | Out-Null
                    Write-Host ""
                }
            } else {
                $cliSubTexts = @($missingTools | ForEach-Object { "npm: $($_.NpmPackage)" })
                $cliSelections = Show-CheckboxMenu `
                    -Prompt   'Install missing CLI tools?' `
                    -Items    @($missingTools | ForEach-Object { $_.Name }) `
                    -SubTexts $cliSubTexts

                $toInstall = @()
                if ($null -ne $cliSelections) {
                    for ($i = 0; $i -lt $missingTools.Count; $i++) {
                        if ($cliSelections[$i]) { $toInstall += $missingTools[$i] }
                    }
                }

                foreach ($tool in $toInstall) {
                    Write-Host "Installing $($tool.Name)..." -ForegroundColor White
                    Install-CliTool -Tool $tool | Out-Null
                    Write-Host ""
                }
            }
        }
    }
}

# ---- Harness selection ---------------------------------------------------------
$selectedHarnesses = @()

if ($All) {
    $selectedHarnesses = $allHarnesses
} elseif ($Harnesses.Count -gt 0) {
    foreach ($id in $Harnesses) {
        $h = $allHarnesses | Where-Object { $_.Id -eq $id.ToLower() }
        if ($h) { $selectedHarnesses += $h }
        else    { Write-Warning "Unknown harness '$id', skipping." }
    }
} else {
    # Interactive multi-select with keyboard-driven checkboxes
    $harnessSubTexts = @($allHarnesses | ForEach-Object {
        if ($_.HasCommands) { "skill + commands  →  $($_.SkillDest)" }
        else                { "skill only        →  $($_.SkillDest)" }
    })
    $harnessSelections = Show-CheckboxMenu `
        -Prompt   'Select harnesses to install into:' `
        -Items    @($allHarnesses | ForEach-Object { $_.Name }) `
        -SubTexts $harnessSubTexts

    if ($null -eq $harnessSelections) {
        Write-Host 'Cancelled.' -ForegroundColor Yellow
        exit 0
    }
    for ($i = 0; $i -lt $allHarnesses.Count; $i++) {
        if ($harnessSelections[$i]) { $selectedHarnesses += $allHarnesses[$i] }
    }
}

if ($selectedHarnesses.Count -eq 0) {
    Write-Host "No harnesses selected. Skipping skill/command installation." -ForegroundColor Yellow
} else {
    Write-Host "Installing skill into: $($selectedHarnesses.Name -join ', ')" -ForegroundColor White
    Write-Host ""

    foreach ($h in $selectedHarnesses) {
        Write-Host "[$($h.Name)]" -ForegroundColor Cyan

        # --- Skill ---
        Write-Host "  skill -> $($h.SkillDest)" -ForegroundColor Gray
        Copy-TreeItem `
            -Source (Join-Path $scriptDir "claude\skills\ralph") `
            -Destination $h.SkillDest `
            -Label "skill"

        # --- Commands (only for harnesses that support the commands/ dir) ---
        if ($h.HasCommands) {
            Write-Host "  commands -> $($h.CmdDest)" -ForegroundColor Gray
            Copy-TreeItem `
                -Source (Join-Path $scriptDir "claude\commands\ralph") `
                -Destination $h.CmdDest `
                -Label "commands"
        }
        Write-Host ""
    }
}

# ---- VS Code prompts (.prompt.md) — stable + insiders -----------------------
# VS Code uses a separate user-level prompts folder (not ~/.copilot/)
# that is independent of which harness was selected above.
# Official path: $APPDATA\Code\User\prompts\ and $APPDATA\Code - Insiders\User\prompts\
$vscodePromptDirs = @(
    [PSCustomObject]@{ Name = 'VS Code (stable)';   Path = Join-Path $env:APPDATA "Code\User\prompts" }
    [PSCustomObject]@{ Name = 'VS Code Insiders';   Path = Join-Path $env:APPDATA "Code - Insiders\User\prompts" }
)

$promptSource = Join-Path $scriptDir "copilot\prompts"
if (-not (Test-Path $promptSource)) {
    Write-Warning "Prompt source not found, skipping VS Code prompts: $promptSource"
} else {
    $installedVsCode = $false
    foreach ($vsc in $vscodePromptDirs) {
        # Only install if VS Code is present (its parent User dir exists)
        $parentDir = Split-Path $vsc.Path -Parent
        if (-not (Test-Path $parentDir)) {
            Write-Host "  [$($vsc.Name)] not installed — skipping" -ForegroundColor DarkGray
            continue
        }
        Write-Host "[$($vsc.Name)] prompts -> $($vsc.Path)" -ForegroundColor Cyan
        Copy-TreeItem -Source $promptSource -Destination $vsc.Path -Label "prompts"
        Write-Host ""
        $installedVsCode = $true
    }
    if (-not $installedVsCode) {
        Write-Host "  No VS Code installation found — skipped .prompt.md files." -ForegroundColor DarkGray
        Write-Host ""
    }
}

# --- Ralph runtime: config ---
Write-Host ""
Write-Host "Installing Ralph runtime config..." -ForegroundColor White
Copy-TreeItem `
    -Source (Join-Path $scriptDir "ralph\config.yml") `
    -Destination (Join-Path $ralphDir "config.yml") `
    -Label "config"

# --- Ralph runtime: bin ---
Write-Host ""
Write-Host "Installing Ralph loop scripts..." -ForegroundColor White
Copy-TreeItem `
    -Source (Join-Path $scriptDir "ralph\bin") `
    -Destination (Join-Path $ralphDir "bin") `
    -Label "bin"

# --- Ralph runtime: templates ---
Write-Host ""
Write-Host "Installing Ralph prompt templates..." -ForegroundColor White
Copy-TreeItem `
    -Source (Join-Path $scriptDir "ralph\templates") `
    -Destination (Join-Path $ralphDir "templates") `
    -Label "templates"

# --- Create runtime directories ---
Write-Host ""
Write-Host "Creating runtime directories..." -ForegroundColor White
$runtimeDirs = @(
    (Join-Path $ralphDir "projects"),
    (Join-Path $ralphDir "sessions")
)
foreach ($dir in $runtimeDirs) {
    if (-not (Test-Path $dir)) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] mkdir $dir" -ForegroundColor DarkGray
        } else {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "  Created: $dir" -ForegroundColor Green
        }
    } else {
        Write-Host "  Exists: $dir" -ForegroundColor Gray
    }
}

# --- Make loop scripts executable (Unix only) ---
if ($IsLinux -or $IsMacOS) {
    Write-Host ""
    Write-Host "Setting executable permissions..." -ForegroundColor White
    $loopSh = Join-Path $ralphDir "bin/loop.sh"
    if (Test-Path $loopSh) {
        if ($DryRun) {
            Write-Host "  [DRY RUN] chmod +x $loopSh" -ForegroundColor DarkGray
        } else {
            chmod +x $loopSh
            Write-Host "  chmod +x $loopSh" -ForegroundColor Green
        }
    }
}

# --- Summary ---
Write-Host ""
Write-Host "=== Installation Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Installed components:" -ForegroundColor White
Write-Host "  Skill:     ~/.{claude|codex|copilot|agents}/skills/ralph/SKILL.md"
Write-Host "  Commands:  ~/.{claude|codex}/commands/ralph/  (setup, start, status, stop)"
Write-Host "  Prompts:   %APPDATA%\Code{,-Insiders}\User\prompts\  (ralph-*.prompt.md)"
Write-Host "  Config:    $ralphDir\config.yml"
Write-Host "  Scripts:   $ralphDir\bin\ (loop.ps1, loop.sh)"
Write-Host "  Templates: $ralphDir\templates\ (PROMPT_plan.md, PROMPT_build.md, PROMPT_review.md)"
Write-Host ""
Write-Host "Usage:" -ForegroundColor White
Write-Host "  Claude Code / Codex: /ralph:setup  /ralph:start  /ralph:status  /ralph:stop"
Write-Host "  VS Code Copilot:     /ralph-setup  /ralph-start  /ralph-status  /ralph-stop  (prompt files)"
Write-Host "  GH Copilot skill:    type '/' in chat and select ralph, or let Copilot load it automatically"
Write-Host ""
Write-Host "To reinstall: $scriptDir\install.ps1 -Force" -ForegroundColor Gray
Write-Host ""
Write-Host "=== Authentication ===" -ForegroundColor Cyan
Write-Host ""
foreach ($tool in $cliToolDefs) {
    $ok = Test-CommandExists $tool.Command
    $badge = if ($ok) { "[installed]" } else { "[not found]" }
    $badgeColor = if ($ok) { "Green" } else { "DarkYellow" }
    Write-Host -NoNewline "$badge " -ForegroundColor $badgeColor
    Write-Host $tool.Name -ForegroundColor White
    foreach ($step in $tool.Auth) {
        Write-Host "  $step" -ForegroundColor Gray
    }
    Write-Host ""
}
Write-Host "Tip: persist API keys in your PowerShell profile so they survive reboots:" -ForegroundColor DarkGray
Write-Host "  code `$PROFILE  # then add lines like:  `$env:ANTHROPIC_API_KEY = 'sk-...'" -ForegroundColor DarkGray
