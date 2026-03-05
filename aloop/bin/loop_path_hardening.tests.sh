#!/bin/bash
# Tests for PATH hardening: gh is stripped from PATH during provider execution

# Extract the strip_gh_from_path function from loop.sh
STRIP_FUNC=$(sed -n '/^strip_gh_from_path() {/,/^}/p' aloop/bin/loop.sh)
eval "$STRIP_FUNC"

failed=0

# --- Test 1: gh directory is removed from PATH ---
fake_gh_dir="$(mktemp -d)"
echo '#!/bin/bash' > "$fake_gh_dir/gh"
chmod +x "$fake_gh_dir/gh"

original_path="$PATH"
PATH="$fake_gh_dir:$PATH"
sanitized="$(strip_gh_from_path)"

if echo "$sanitized" | tr ':' '\n' | grep -Fxq "$fake_gh_dir"; then
    echo "FAIL: directory containing gh was not removed from PATH"
    failed=1
else
    echo "PASS: directory containing gh is removed from PATH"
fi

# --- Test 2: directories without gh are preserved ---
safe_dir="$(mktemp -d)"
PATH="$safe_dir:$fake_gh_dir:$original_path"
sanitized="$(strip_gh_from_path)"

if echo "$sanitized" | tr ':' '\n' | grep -Fxq "$safe_dir"; then
    echo "PASS: directories without gh are preserved"
else
    echo "FAIL: safe directory was incorrectly removed from PATH"
    failed=1
fi

# --- Test 3: gh.exe directory is also removed ---
fake_ghexe_dir="$(mktemp -d)"
echo '#!/bin/bash' > "$fake_ghexe_dir/gh.exe"
chmod +x "$fake_ghexe_dir/gh.exe"

PATH="$safe_dir:$fake_ghexe_dir:$original_path"
sanitized="$(strip_gh_from_path)"

if echo "$sanitized" | tr ':' '\n' | grep -Fxq "$fake_ghexe_dir"; then
    echo "FAIL: directory containing gh.exe was not removed from PATH"
    failed=1
else
    echo "PASS: directory containing gh.exe is removed from PATH"
fi

# --- Test 4: PATH with no gh directories is unchanged ---
another_safe_dir="$(mktemp -d)"
PATH="$safe_dir:$another_safe_dir"
sanitized="$(strip_gh_from_path)"

if [ "$sanitized" = "$safe_dir:$another_safe_dir" ]; then
    echo "PASS: PATH without gh directories is unchanged"
else
    echo "FAIL: PATH without gh directories was modified"
    failed=1
fi
# Restore PATH for remaining tests
PATH="$original_path"
rm -rf "$another_safe_dir"

# --- Test 5: invoke_provider restores PATH after execution ---
# Extract invoke_provider and its dependency
INVOKE_FUNC=$(sed -n '/^invoke_provider() {/,/^}/p' aloop/bin/loop.sh)

# We need supporting globals/functions for invoke_provider
LOG_FILE="$(mktemp)"
LAST_PROVIDER_ERROR=""
CLAUDE_MODEL="test"
write_log_entry() { :; }

# Create a fake provider that records PATH
fake_provider_dir="$(mktemp -d)"
cat > "$fake_provider_dir/claude" << 'SCRIPT'
#!/bin/bash
# Write current PATH to a marker file so the test can inspect it
echo "$PATH" > "${ALOOP_TEST_PATH_MARKER}"
exit 0
SCRIPT
chmod +x "$fake_provider_dir/claude"

# Set up PATH with both fake gh and fake provider
PATH="$fake_provider_dir:$fake_gh_dir:$original_path"
pre_invoke_path="$PATH"
export ALOOP_TEST_PATH_MARKER="$(mktemp)"

eval "$INVOKE_FUNC"
invoke_provider "claude" "test prompt" >/dev/null 2>/dev/null

# Check that PATH was restored after invoke_provider returned
if [ "$PATH" = "$pre_invoke_path" ]; then
    echo "PASS: PATH is restored after invoke_provider returns"
else
    echo "FAIL: PATH was not restored after invoke_provider (got: $PATH)"
    failed=1
fi

# Check that gh was NOT on PATH during provider execution
provider_saw_path="$(cat "$ALOOP_TEST_PATH_MARKER")"
if echo "$provider_saw_path" | tr ':' '\n' | grep -Fxq "$fake_gh_dir"; then
    echo "FAIL: provider could see gh on PATH during execution"
    failed=1
else
    echo "PASS: gh was stripped from PATH during provider execution"
fi

# Cleanup
rm -rf "$fake_gh_dir" "$fake_ghexe_dir" "$safe_dir" "$fake_provider_dir"
rm -f "$LOG_FILE" "$LOG_FILE.raw" "$ALOOP_TEST_PATH_MARKER"
PATH="$original_path"

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
