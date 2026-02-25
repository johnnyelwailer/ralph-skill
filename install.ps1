#!/usr/bin/env pwsh
# Ralph Skill Installer
# Copies skill/command files to the correct directories for each AI harness,
# and installs the Ralph runtime (~/.ralph/).
#
# Usage: ./install.ps1 [-Force] [-DryRun] [-All] [-Harnesses claude,codex,...]
#
# Harness skill/command directories (official sources):
#   Claude Code  : ~/.claude/skills/  + ~/.claude/commands/  (https://docs.anthropic.com/claude-code)
#   Codex CLI    : ~/.codex/skills/   + ~/.codex/commands/   (https://github.com/openai/codex)
#   GH Copilot   : ~/.copilot/skills/ only — no commands dir (https://code.visualstudio.com/docs/copilot/customization/agent-skills)
#   Agents       : ~/.agents/skills/  only — generic standard (agentskills.io)

param(
    [switch]$Force,                  # Overwrite existing files without prompting
    [switch]$DryRun,                 # Show what would be done without doing it
    [switch]$All,                    # Install all harnesses without prompting
    [string[]]$Harnesses = @()       # Pre-select harnesses: claude, codex, copilot, agents
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
        Name        = 'GH Copilot (VS Code)'
        SkillDest   = Join-Path $HOME ".copilot\skills\ralph"
        CmdDest     = $null
        HasCommands = $false
    }
    [PSCustomObject]@{
        Id          = 'agents'
        Name        = 'Agents (generic / agentskills.io)'
        SkillDest   = Join-Path $HOME ".agents\skills\ralph"
        CmdDest     = $null
        HasCommands = $false
    }
)

# ============================================================================
# HELPERS
# ============================================================================

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
    # Interactive multi-select
    Write-Host "Select harnesses to install into (comma-separated numbers, or 'all'):" -ForegroundColor White
    Write-Host ""
    for ($i = 0; $i -lt $allHarnesses.Count; $i++) {
        $h = $allHarnesses[$i]
        $cmds = if ($h.HasCommands) { "skill + commands" } else { "skill only (no commands dir)" }
        Write-Host "  [$($i+1)] $($h.Name)" -ForegroundColor Cyan -NoNewline
        Write-Host "  ($cmds)" -ForegroundColor DarkGray
        Write-Host "       skill:    $($h.SkillDest)" -ForegroundColor DarkGray
        if ($h.HasCommands) {
            Write-Host "       commands: $($h.CmdDest)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    $input = Read-Host "Choice [1-$($allHarnesses.Count) / all]"
    if ($input.Trim().ToLower() -eq 'all') {
        $selectedHarnesses = $allHarnesses
    } else {
        foreach ($part in ($input -split ',')) {
            $n = $part.Trim()
            if ($n -match '^\d+$') {
                $idx = [int]$n - 1
                if ($idx -ge 0 -and $idx -lt $allHarnesses.Count) {
                    $selectedHarnesses += $allHarnesses[$idx]
                } else {
                    Write-Warning "Invalid number '$n', skipping."
                }
            } elseif ($n -ne '') {
                Write-Warning "Invalid input '$n', skipping."
            }
        }
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
Write-Host "  Skill:     ~/.{claude|codex|copilot|agents}\skills\ralph\SKILL.md"
Write-Host "  References: ~/.{claude|codex|copilot|agents}\skills\ralph\references\ (4 files)"
Write-Host "  Commands:  ~/.{claude|codex|copilot|agents}\commands\ralph\ (setup, start, status, stop)"
Write-Host "  Config:    $ralphDir\config.yml"
Write-Host "  Scripts:   $ralphDir\bin\ (loop.ps1, loop.sh)"
Write-Host "  Templates: $ralphDir\templates\ (PROMPT_plan.md, PROMPT_build.md, PROMPT_review.md)"
Write-Host ""
Write-Host "Usage:" -ForegroundColor White
Write-Host "  1. Open Claude Code, Codex, or Copilot in any project"
Write-Host "  2. Run /ralph:setup to configure the project"
Write-Host "  3. Run /ralph:start to launch a loop"
Write-Host "  4. Run /ralph:status to check progress"
Write-Host "  5. Run /ralph:stop to stop a loop"
Write-Host ""
Write-Host "To reinstall: $scriptDir\install.ps1 -Force" -ForegroundColor Gray
