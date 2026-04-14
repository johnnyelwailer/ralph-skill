# Sync the working branch with the upstream base branch before each iteration.
# Reads auto_merge and base_branch from meta.json; falls back to git config
# init.defaultBranch, then main, then master.
# Returns 0 on success (merged or up-to-date), non-zero on conflict.
sync_branch() {
    local meta_file="$SESSION_DIR/meta.json"
    local auto_merge="true"
    local base_branch=""

    # Read auto_merge and base_branch from meta.json
    if [ -f "$meta_file" ] && command -v python3 >/dev/null 2>&1; then
        local _sb_meta
        _sb_meta=$(python3 -c "
import json, sys
try:
    with open('$meta_file') as f:
        m = json.load(f)
    print(str(m.get('auto_merge', True)).lower())
    print(m.get('base_branch', '') or '')
except Exception:
    print('true')
    print('')
" 2>/dev/null) || true
        auto_merge=$(echo "$_sb_meta" | sed -n '1p')
        base_branch=$(echo "$_sb_meta" | sed -n '2p')
    fi

    if [ "$auto_merge" = "false" ] || [ "${NO_SYNC:-false}" = "true" ]; then
        return 0
    fi

    # Resolve base branch: meta.json → git config → main → master
    if [ -z "$base_branch" ]; then
        base_branch=$(git -C "$WORK_DIR" config init.defaultBranch 2>/dev/null || true)
    fi
    if [ -z "$base_branch" ]; then
        if git -C "$WORK_DIR" rev-parse --verify main >/dev/null 2>&1; then
            base_branch="main"
        elif git -C "$WORK_DIR" rev-parse --verify master >/dev/null 2>&1; then
            base_branch="master"
        fi
    fi
    if [ -z "$base_branch" ]; then
        return 0
    fi

    # Fetch origin non-fatally
    local fetch_rc=0
    git -C "$WORK_DIR" fetch origin "$base_branch" 2>/dev/null || fetch_rc=$?
    if [ "$fetch_rc" -ne 0 ]; then
        write_log_entry "fetch_failed" \
            "base_branch" "$base_branch"
    fi

    # Count commits ahead before merge attempt
    local before_count
    before_count=$(git -C "$WORK_DIR" rev-list --count HEAD..origin/"$base_branch" 2>/dev/null || echo "0")

    # Attempt merge
    local merge_rc=0
    git -C "$WORK_DIR" merge origin/"$base_branch" --no-edit 2>/dev/null || merge_rc=$?

    if [ "$merge_rc" -ne 0 ]; then
        # Check if it's a real conflict (unmerged paths present)
        if git -C "$WORK_DIR" diff --name-only --diff-filter=U 2>/dev/null | grep -q .; then
            write_log_entry "merge_conflict" \
                "base_branch" "$base_branch" \
                "iteration" "$ITERATION"
            # Copy merge conflict prompt into queue
            local queue_dir="$SESSION_DIR/queue"
            mkdir -p "$queue_dir"
            local merge_prompt_src="$PROMPTS_DIR/PROMPT_merge.md"
            if [ -f "$merge_prompt_src" ]; then
                cp "$merge_prompt_src" "$queue_dir/000-merge-conflict.md"
            fi
            return 1
        fi
    fi

    # Determine result
    local result
    if [ "$before_count" -gt 0 ] && [ "$merge_rc" -eq 0 ]; then
        result="merged"
    else
        result="up_to_date"
    fi

    write_log_entry_mixed "branch_sync" \
        "\"base_branch\":\"$base_branch\",\"result\":\"$result\",\"merged_commit_count\":$before_count"
    return 0
}
