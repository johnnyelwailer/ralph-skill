# Sync the working branch with the upstream base branch before each iteration.
# Reads auto_merge and base_branch from meta.json; falls back to git config
# init.defaultBranch, then main, then master.
# Returns $true on success (merged or up-to-date), $false on conflict.
function Sync-Branch {
    $metaFile  = Join-Path $SessionDir "meta.json"
    $autoMerge = $true
    $baseBranch = ''

    # Read auto_merge and base_branch from meta.json
    if (Test-Path $metaFile) {
        try {
            $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
            if ($null -ne $meta.auto_merge) {
                $autoMerge = [bool]$meta.auto_merge
            }
            if ($meta.base_branch) {
                $baseBranch = [string]$meta.base_branch
            }
        } catch { }
    }

    if (-not $autoMerge) {
        return $true
    }

    # Resolve base branch: meta.json → git config → main → master
    if ([string]::IsNullOrWhiteSpace($baseBranch)) {
        try {
            $baseBranch = (git -C "$WorkDir" config init.defaultBranch 2>$null | Out-String).Trim()
        } catch { $baseBranch = '' }
    }
    if ([string]::IsNullOrWhiteSpace($baseBranch)) {
        git -C "$WorkDir" rev-parse --verify main 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $baseBranch = 'main'
        } else {
            git -C "$WorkDir" rev-parse --verify master 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $baseBranch = 'master' }
        }
    }
    if ([string]::IsNullOrWhiteSpace($baseBranch)) {
        return $true
    }

    # Fetch origin non-fatally
    git -C "$WorkDir" fetch origin "$baseBranch" 2>$null | Out-Null

    # Count commits ahead before merge attempt
    $beforeCount = 0
    try {
        $countStr = (git -C "$WorkDir" rev-list --count "HEAD..origin/$baseBranch" 2>$null | Out-String).Trim()
        if ($countStr -match '^\d+$') { $beforeCount = [int]$countStr }
    } catch { }

    # Attempt merge
    $mergeOutput = git -C "$WorkDir" merge "origin/$baseBranch" --no-edit 2>&1
    $mergeRc = $LASTEXITCODE

    if ($mergeRc -ne 0) {
        # Check if it's a real conflict (unmerged paths present)
        $conflictFiles = git -C "$WorkDir" diff --name-only --diff-filter=U 2>$null
        if ($conflictFiles) {
            Write-LogEntry -Event "merge_conflict" -Data @{
                base_branch = $baseBranch
                iteration   = $iteration
            }
            # Copy merge conflict prompt into queue
            $queueDir = Join-Path $SessionDir "queue"
            if (-not (Test-Path $queueDir)) { New-Item -ItemType Directory -Path $queueDir -Force | Out-Null }
            $mergeSrc = Join-Path $PromptsDir "PROMPT_merge.md"
            if (Test-Path $mergeSrc) {
                Copy-Item $mergeSrc (Join-Path $queueDir "000-merge-conflict.md") -Force
            }
            return $false
        }
    }

    # Determine result
    $result = if ($beforeCount -gt 0 -and $mergeRc -eq 0) { 'merged' } else { 'up_to_date' }
    Write-LogEntry -Event "branch_sync" -Data @{
        base_branch          = $baseBranch
        result               = $result
        merged_commit_count  = $beforeCount
    }
    return $true
}
