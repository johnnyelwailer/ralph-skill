#!/usr/bin/env pwsh
# Ralph Skill Installer
# Copies files from this dev repo to ~/.claude/ and ~/.ralph/
#
# Usage: ./install.ps1 [-Force] [-DryRun]

param(
    [switch]$Force,     # Overwrite existing files without prompting
    [switch]$DryRun     # Show what would be done without doing it
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

$claudeDir = Join-Path $HOME ".claude"
$ralphDir = Join-Path $HOME ".ralph"

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
Write-Host "Target: $claudeDir (Claude skills/commands)" -ForegroundColor Gray
Write-Host "Target: $ralphDir (Ralph runtime)" -ForegroundColor Gray
if ($DryRun) {
    Write-Host "Mode: DRY RUN (no changes will be made)" -ForegroundColor Yellow
}
if ($Force) {
    Write-Host "Mode: FORCE (overwriting existing files)" -ForegroundColor Yellow
}
Write-Host ""

# --- Claude skill + references ---
Write-Host "Installing Claude skill..." -ForegroundColor White
Copy-TreeItem `
    -Source (Join-Path $scriptDir "claude\skills\ralph") `
    -Destination (Join-Path $claudeDir "skills\ralph") `
    -Label "skill"

# --- Claude commands ---
Write-Host ""
Write-Host "Installing Claude commands..." -ForegroundColor White
Copy-TreeItem `
    -Source (Join-Path $scriptDir "claude\commands\ralph") `
    -Destination (Join-Path $claudeDir "commands\ralph") `
    -Label "commands"

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
Write-Host "  Skill:     $claudeDir\skills\ralph\SKILL.md"
Write-Host "  References: $claudeDir\skills\ralph\references\ (4 files)"
Write-Host "  Commands:  $claudeDir\commands\ralph\ (setup, start, status, stop)"
Write-Host "  Config:    $ralphDir\config.yml"
Write-Host "  Scripts:   $ralphDir\bin\ (loop.ps1, loop.sh)"
Write-Host "  Templates: $ralphDir\templates\ (PROMPT_plan.md, PROMPT_build.md, PROMPT_review.md)"
Write-Host ""
Write-Host "Usage:" -ForegroundColor White
Write-Host "  1. Open Claude Code in any project"
Write-Host "  2. Run /ralph:setup to configure the project"
Write-Host "  3. Run /ralph:start to launch a loop"
Write-Host "  4. Run /ralph:status to check progress"
Write-Host "  5. Run /ralph:stop to stop a loop"
Write-Host ""
Write-Host "To reinstall: $scriptDir\install.ps1 -Force" -ForegroundColor Gray
