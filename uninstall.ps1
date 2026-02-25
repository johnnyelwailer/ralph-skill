#!/usr/bin/env pwsh
# Aloop Skill Uninstaller
# Removes skill/command/prompt files installed by install.ps1, and optionally
# the Aloop runtime (~/.aloop/).
#
# Usage: ./uninstall.ps1 [-Force] [-DryRun] [-All]
#
#   -Force   Skip the "Proceed? [y/N]" confirmation prompt
#   -DryRun  Show what would be removed without actually removing anything
#   -All     Remove everything without the interactive selection screen

param(
    [switch]$Force,
    [switch]$DryRun,
    [switch]$All
)

$ErrorActionPreference = 'Stop'

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
        [string[]]$SubTexts    = @(),
        [bool[]  ]$InitialState = @()
    )

    $count = $Items.Count
    if ($count -eq 0) { return ,[bool[]]@() }

    $checked = [bool[]]::new($count)
    for ($i = 0; $i -lt [Math]::Min($InitialState.Count, $count); $i++) {
        $checked[$i] = $InitialState[$i]
    }
    $cursor     = 0
    $esc        = [char]27
    $menuHeight = $count + 1  # item rows + hint row

    Write-Host $Prompt -ForegroundColor White
    Write-Host ""

    [Console]::CursorVisible = $false
    try {
        $firstDraw = $true
        $done      = $false
        $cancelled = $false

        while ($true) {
            # On re-draws move cursor back up to overwrite the previous menu.
            # ESC[nA moves up n lines — relative, so it works regardless of scroll position.
            if (-not $firstDraw) {
                [Console]::Write("${esc}[$($menuHeight)A")
            }
            $firstDraw = $false

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

            if ($done) { break }

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
        }

        Write-Host ""
        if ($cancelled) { return $null }
        return ,$checked
    } finally {
        [Console]::CursorVisible = $true
    }
}

# ============================================================================
# UNINSTALL TARGET DEFINITIONS
# ============================================================================

$skillName = ('ra' + 'lph')
$uninstallTargets = [System.Collections.Generic.List[PSCustomObject]]::new()

# --- AI harness targets ---
@(
    [PSCustomObject]@{
        Name  = 'Claude Code  (skill + commands)'
        Dirs  = @(
            Join-Path $HOME ".claude\skills\$skillName"
            Join-Path $HOME ".claude\commands\$skillName"
        )
        Files = @()
    }
    [PSCustomObject]@{
        Name  = 'Codex CLI  (skill + commands)'
        Dirs  = @(
            Join-Path $HOME ".codex\skills\$skillName"
            Join-Path $HOME ".codex\commands\$skillName"
        )
        Files = @()
    }
    [PSCustomObject]@{
        Name  = 'GH Copilot  (skill)'
        Dirs  = @(Join-Path $HOME ".copilot\skills\$skillName")
        Files = @()
    }
    [PSCustomObject]@{
        Name  = 'Agents  (skill)'
        Dirs  = @(Join-Path $HOME ".agents\skills\$skillName")
        Files = @()
    }
) | ForEach-Object { $uninstallTargets.Add($_) }

# --- VS Code prompt files (only include variants that are installed) ---
foreach ($vsc in @(
    [PSCustomObject]@{ Name = 'VS Code stable — prompt files';   PromptsDir = Join-Path $env:APPDATA 'Code\User\prompts' }
    [PSCustomObject]@{ Name = 'VS Code Insiders — prompt files'; PromptsDir = Join-Path $env:APPDATA 'Code - Insiders\User\prompts' }
)) {
    # Only add if VS Code itself is present (its User/ directory exists)
    if (Test-Path (Split-Path $vsc.PromptsDir -Parent)) {
        $uninstallTargets.Add([PSCustomObject]@{
            Name  = $vsc.Name
            Dirs  = @()
            Files = @(Join-Path $vsc.PromptsDir 'aloop-*.prompt.md')
        })
    }
}

# --- Aloop runtime (added last so it appears at the bottom) ---
$uninstallTargets.Add([PSCustomObject]@{
    Name      = 'Aloop runtime (~/.aloop/ — config, scripts, templates, sessions)'
    Dirs      = @(Join-Path $HOME '.aloop')
    Files     = @()
    IsRuntime = $true
})

# ============================================================================
# HELPERS
# ============================================================================

function Test-TargetInstalled {
    param([PSCustomObject]$Target)
    foreach ($d in $Target.Dirs) {
        if (Test-Path $d) { return $true }
    }
    foreach ($f in $Target.Files) {
        $dir = Split-Path $f -Parent
        $pat = Split-Path $f -Leaf
        if ((Test-Path $dir) -and (Get-ChildItem $dir -Filter $pat -ErrorAction SilentlyContinue)) {
            return $true
        }
    }
    return $false
}

function Remove-Target {
    param([PSCustomObject]$Target)

    foreach ($d in $Target.Dirs) {
        if (Test-Path $d) {
            if ($DryRun) {
                Write-Host "  [DRY RUN] Remove-Item -Recurse $d" -ForegroundColor DarkGray
            } else {
                Remove-Item $d -Recurse -Force
                Write-Host "  Removed: $d" -ForegroundColor Red
            }
        } else {
            Write-Host "  Not found (skip): $d" -ForegroundColor DarkGray
        }
    }

    foreach ($f in $Target.Files) {
        $dir = Split-Path $f -Parent
        $pat = Split-Path $f -Leaf
        if (Test-Path $dir) {
            $matchedFiles = Get-ChildItem $dir -Filter $pat -ErrorAction SilentlyContinue
            if ($matchedFiles) {
                foreach ($file in $matchedFiles) {
                    if ($DryRun) {
                        Write-Host "  [DRY RUN] Remove-Item $($file.FullName)" -ForegroundColor DarkGray
                    } else {
                        Remove-Item $file.FullName -Force
                        Write-Host "  Removed: $($file.FullName)" -ForegroundColor Red
                    }
                }
            } else {
                Write-Host "  No matching files (skip): $f" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "  Directory not found (skip): $dir" -ForegroundColor DarkGray
        }
    }
}

# ============================================================================
# MAIN
# ============================================================================

Write-Host ""
Write-Host "=== Aloop Skill Uninstaller ===" -ForegroundColor Cyan
if ($DryRun) { Write-Host "Mode: DRY RUN (no changes will be made)" -ForegroundColor Yellow }
Write-Host ""

# Build subtexts: show whether each target is currently installed
$subtexts = @($uninstallTargets | ForEach-Object {
    $status = if (Test-TargetInstalled $_) { 'installed' } else { 'not found' }
    if ($_.IsRuntime) { "$status  [!] includes session data" } else { $status }
})

# --- Selection ---
$selectedTargets = @()

if ($All) {
    $selectedTargets = @($uninstallTargets)
} else {
    $selections = Show-CheckboxMenu `
        -Prompt   'Select components to uninstall:' `
        -Items    @($uninstallTargets | ForEach-Object { $_.Name }) `
        -SubTexts $subtexts

    if ($null -eq $selections) {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }

    for ($i = 0; $i -lt $uninstallTargets.Count; $i++) {
        if ($selections[$i]) { $selectedTargets += $uninstallTargets[$i] }
    }
}

if ($selectedTargets.Count -eq 0) {
    Write-Host "Nothing selected." -ForegroundColor Yellow
    exit 0
}

# --- Confirmation ---
if (-not $Force -and -not $DryRun) {
    Write-Host "The following will be permanently removed:" -ForegroundColor White
    foreach ($t in $selectedTargets) {
        $warn  = if ($t.IsRuntime) { '  [!] WARNING: includes session data' } else { '' }
        $color = if ($t.IsRuntime) { 'Yellow' } else { 'Red' }
        Write-Host "  - $($t.Name)$warn" -ForegroundColor $color
    }
    Write-Host ""
    $confirm = Read-Host "Proceed with removal? [y/N]"
    if ($confirm -notmatch '^[yY]$') {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""
}

# --- Execute ---
foreach ($t in $selectedTargets) {
    Write-Host "[$($t.Name)]" -ForegroundColor Cyan
    Remove-Target -Target $t
    Write-Host ""
}

Write-Host "=== Uninstall Complete ===" -ForegroundColor Cyan
Write-Host ""
if (-not $DryRun) {
    Write-Host "To reinstall: $PSScriptRoot\install.ps1" -ForegroundColor Gray
    Write-Host ""
}
