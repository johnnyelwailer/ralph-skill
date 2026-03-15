#!/bin/bash
# Integration test for provenance trailers in loop.sh plus static checks in loop.ps1

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
LOOP_SH=$(realpath "$SCRIPT_DIR/loop.sh")
LOOP_PS1="$SCRIPT_DIR/loop.ps1"

TEST_ROOT=$(mktemp -d)
WORK_DIR="$TEST_ROOT/work"
SESS_DIR="$TEST_ROOT/session"
PROMPT_DIR="$TEST_ROOT/prompts"
mkdir -p "$WORK_DIR" "$SESS_DIR" "$PROMPT_DIR"

# Mock prompts
echo "# Plan" > "$PROMPT_DIR/PROMPT_plan.md"
echo "# Build" > "$PROMPT_DIR/PROMPT_build.md"

# Mock provider (claude) that makes a commit
mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/claude" << 'EOF'
#!/bin/bash
# Simulate an agent making a change and committing it
echo "agent change" >> agent_file.txt
git add agent_file.txt
git commit -m "feat: agent commit" -q
echo "Done"
EOF
chmod +x "$TEST_ROOT/bin/claude"

export PATH="$TEST_ROOT/bin:$PATH"

cd "$WORK_DIR"
# Seed git repo so the provider can commit inside the test worktree.
git init -q
git config user.name "Aloop Test"
git config user.email "aloop-test@example.com"
echo "seed" > seed.txt
git add seed.txt
git commit -m "chore: seed repo" -q

# Need TODO.md with a task
echo "- [ ] A task" > TODO.md

echo "Running loop.sh..."
LOOP_OUTPUT="$TEST_ROOT/loop-output.log"
bash "$LOOP_SH" \
    --prompts-dir "$PROMPT_DIR" \
    --session-dir "$SESS_DIR" \
    --work-dir "$WORK_DIR" \
    --mode build \
    --provider claude \
    --max-iterations 1 \
    --dangerously-skip-container >"$LOOP_OUTPUT" 2>&1
cat "$LOOP_OUTPUT"

# Check agent commit
echo "Checking agent commit..."
AGENT_COMMIT_MSG=$(git log -1 --format=%B)
echo "Agent commit message:"
echo "---"
echo "$AGENT_COMMIT_MSG"
echo "---"

failed=0

# Verify agent commit has trailers
if ! echo "$AGENT_COMMIT_MSG" | grep -q "Aloop-Agent:"; then
    echo "FAIL: Agent commit missing Aloop-Agent"
    failed=1
fi
if ! echo "$AGENT_COMMIT_MSG" | grep -q "Aloop-Iteration: 1"; then
    echo "FAIL: Agent commit missing Aloop-Iteration: 1"
    failed=1
fi
if ! echo "$AGENT_COMMIT_MSG" | grep -q "Aloop-Session:"; then
    echo "FAIL: Agent commit missing Aloop-Session"
    failed=1
fi

if grep -q "log.jsonl.raw: No such file or directory" "$LOOP_OUTPUT"; then
    echo "FAIL: loop.sh emitted missing log.jsonl.raw warning"
    failed=1
fi
if grep -q "syntax error in expression" "$LOOP_OUTPUT"; then
    echo "FAIL: loop.sh emitted arithmetic parse warning"
    failed=1
fi
if grep -q "local: can only be used in a function" "$LOOP_OUTPUT"; then
    echo "FAIL: loop.sh emitted top-level local warning"
    failed=1
fi

# Verify harness provenance trailers are present in both runtime scripts'
# initialization commit path.
if ! grep -q "Aloop-Agent: harness" "$LOOP_SH"; then
    echo "FAIL: loop.sh missing harness provenance trailer in initial commit path"
    failed=1
fi
if ! grep -q "Aloop-Iteration: 0" "$LOOP_SH"; then
    echo "FAIL: loop.sh missing harness iteration trailer in initial commit path"
    failed=1
fi
if ! grep -q "Aloop-Session: \$trailer_session" "$LOOP_SH"; then
    echo "FAIL: loop.sh missing harness session trailer in initial commit path"
    failed=1
fi
if ! grep -q "Aloop-Agent: harness" "$LOOP_PS1"; then
    echo "FAIL: loop.ps1 missing harness provenance trailer in initial commit path"
    failed=1
fi
if ! grep -q "Aloop-Iteration: 0" "$LOOP_PS1"; then
    echo "FAIL: loop.ps1 missing harness iteration trailer in initial commit path"
    failed=1
fi
if ! grep -q "Aloop-Session: \$trailerSession" "$LOOP_PS1"; then
    echo "FAIL: loop.ps1 missing harness session trailer in initial commit path"
    failed=1
fi

if [ $failed -eq 0 ]; then
    echo "PASS: Provenance trailers verified in loop.sh"
else
    echo "FAIL: Provenance trailers verification failed"
fi

# Clean up
rm -rf "$TEST_ROOT"

exit $failed
