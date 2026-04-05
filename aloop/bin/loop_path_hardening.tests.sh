#!/bin/bash
# Tests for PATH hardening: gh is blocked via shim during provider execution

# Extract the setup_gh_block, cleanup_gh_block, and helper from loop.sh
BLOCK_FUNC=$(sed -n '/^_gh_block_dir=""/,/^}/p' aloop/bin/loop.sh)
eval "$BLOCK_FUNC"
SETUP_FUNC=$(sed -n '/^setup_gh_block() {/,/^}/p' aloop/bin/loop.sh)
eval "$SETUP_FUNC"
CLEANUP_FUNC=$(sed -n '/^cleanup_gh_block() {/,/^}/p' aloop/bin/loop.sh)
eval "$CLEANUP_FUNC"

failed=0
original_path="$PATH"

# --- Test 1: gh shim blocks gh execution ---
block_dir="$(setup_gh_block)"
saved="$PATH"
PATH="$block_dir:$PATH"

gh_output=$("$block_dir/gh" 2>&1) || true
if echo "$gh_output" | grep -q "blocked by aloop"; then
    echo "PASS: gh shim blocks execution with expected message"
else
    echo "FAIL: gh shim did not produce expected blocking message"
    failed=1
fi
PATH="$saved"
cleanup_gh_block

# --- Test 2: provider binary co-located with gh still executes ---
colocated_dir="$(mktemp -d)"
echo '#!/bin/bash' > "$colocated_dir/gh"
chmod +x "$colocated_dir/gh"
cat > "$colocated_dir/claude" << 'SCRIPT'
#!/bin/bash
echo "provider-executed"
SCRIPT
chmod +x "$colocated_dir/claude"

block_dir="$(setup_gh_block)"
PATH="$block_dir:$colocated_dir:$original_path"

provider_out="$(claude 2>/dev/null)"
if [ "$provider_out" = "provider-executed" ]; then
    echo "PASS: provider binary co-located with gh still executes"
else
    echo "FAIL: provider binary co-located with gh was not reachable (got: $provider_out)"
    failed=1
fi

# Verify gh is blocked (shim takes precedence)
gh_exit=0
gh 2>/dev/null || gh_exit=$?
if [ "$gh_exit" -eq 127 ]; then
    echo "PASS: gh is blocked even though real gh exists in co-located dir"
else
    echo "FAIL: gh was not blocked (exit code: $gh_exit)"
    failed=1
fi

PATH="$original_path"
cleanup_gh_block
rm -rf "$colocated_dir"

# --- Test 3: gh.exe shim also blocks ---
block_dir="$(setup_gh_block)"
if [ -x "$block_dir/gh.exe" ]; then
    echo "PASS: gh.exe shim exists in block directory"
else
    echo "FAIL: gh.exe shim was not created"
    failed=1
fi
cleanup_gh_block

# --- Test 4: PATH with no gh directories is unchanged (minus prepended shim) ---
safe_dir="$(mktemp -d)"
another_safe_dir="$(mktemp -d)"
PATH="$safe_dir:$another_safe_dir:$original_path"
block_dir="$(setup_gh_block)"
hardened="$block_dir:$PATH"

if [ "$hardened" = "$block_dir:$safe_dir:$another_safe_dir:$original_path" ]; then
    echo "PASS: PATH structure preserved with shim prepended"
else
    echo "FAIL: PATH structure was not preserved"
    failed=1
fi
cleanup_gh_block
rm -rf "$safe_dir" "$another_safe_dir"
PATH="$original_path"

# --- Test 5: invoke_provider restores PATH after execution ---
INVOKE_FUNC=$(sed -n '/^invoke_provider() {/,/^}/p' aloop/bin/loop.sh)

LOG_FILE="$(mktemp)"
LAST_PROVIDER_ERROR=""
CLAUDE_MODEL="test"
write_log_entry() { :; }

fake_provider_dir="$(mktemp -d)"
cat > "$fake_provider_dir/claude" << 'SCRIPT'
#!/bin/bash
echo "$PATH" > "${ALOOP_TEST_PATH_MARKER}"
exit 0
SCRIPT
chmod +x "$fake_provider_dir/claude"

# Put a real gh alongside the provider to test co-location
echo '#!/bin/bash' > "$fake_provider_dir/gh"
chmod +x "$fake_provider_dir/gh"

PATH="$fake_provider_dir:$original_path"
pre_invoke_path="$PATH"
export ALOOP_TEST_PATH_MARKER="$(mktemp)"

eval "$INVOKE_FUNC"
invoke_provider "claude" "test prompt" >/dev/null 2>/dev/null

if [ "$PATH" = "$pre_invoke_path" ]; then
    echo "PASS: PATH is restored after invoke_provider returns"
else
    echo "FAIL: PATH was not restored after invoke_provider (got: $PATH)"
    failed=1
fi

# Check that gh shim was on PATH during provider execution (blocks gh)
provider_saw_path="$(cat "$ALOOP_TEST_PATH_MARKER")"
first_dir="$(echo "$provider_saw_path" | cut -d: -f1)"
if [ -f "$first_dir/gh" ] && grep -q "blocked by aloop" "$first_dir/gh" 2>/dev/null; then
    echo "PASS: gh shim was prepended during provider execution"
else
    echo "FAIL: gh shim was not found at start of PATH during provider execution"
    failed=1
fi

# Check that the provider directory is prepended to PATH (at second position, after shim)
second_dir="$(echo "$provider_saw_path" | cut -d: -f2)"
if [ "$second_dir" = "$fake_provider_dir" ]; then
    echo "PASS: provider directory prepended to PATH during execution"
else
    echo "FAIL: provider directory was not prepended to PATH (got: $second_dir, expected: $fake_provider_dir)"
    failed=1
fi

if [ -z "$(trap -p RETURN)" ]; then
    echo "PASS: invoke_provider success does not leak a RETURN trap"
else
    echo "FAIL: invoke_provider success leaked a RETURN trap"
    failed=1
    trap - RETURN
fi

# --- Test 6: PATH restoration when provider exits non-zero ---
cat > "$fake_provider_dir/claude" << 'SCRIPT'
#!/bin/bash
exit 1
SCRIPT
chmod +x "$fake_provider_dir/claude"

PATH="$fake_provider_dir:$original_path"
pre_invoke_path="$PATH"

invoke_provider "claude" "test prompt" >/dev/null 2>/dev/null || true

if [ "$PATH" = "$pre_invoke_path" ]; then
    echo "PASS: PATH is restored after provider exits non-zero"
else
    echo "FAIL: PATH was not restored after provider error (got: $PATH)"
    failed=1
fi

if [ -z "$(trap -p RETURN)" ]; then
    echo "PASS: invoke_provider failure does not leak a RETURN trap"
else
    echo "FAIL: invoke_provider failure leaked a RETURN trap"
    failed=1
    trap - RETURN
fi

# Cleanup
rm -rf "$fake_provider_dir"
rm -f "$LOG_FILE" "$LOG_FILE.raw" "$ALOOP_TEST_PATH_MARKER"
PATH="$original_path"

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
