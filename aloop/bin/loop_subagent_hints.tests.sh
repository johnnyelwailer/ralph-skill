#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOOP_SH="$SCRIPT_DIR/loop.sh"

extract_func() {
    sed -n "/^${1}() {/,/^}/p" "$LOOP_SH"
}

RESOLVE_HINTS_FUNC="$(extract_func resolve_subagent_hints)"
SUBSTITUTE_FUNC="$(extract_func substitute_prompt_placeholders)"

if [ -z "$RESOLVE_HINTS_FUNC" ] || [ -z "$SUBSTITUTE_FUNC" ]; then
    echo "FAIL: could not extract subagent hint helpers from $LOOP_SH"
    exit 1
fi

eval "$RESOLVE_HINTS_FUNC"
eval "$SUBSTITUTE_FUNC"

failed=0
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

assert_eq() {
    local actual="$1"
    local expected="$2"
    local label="$3"
    if [ "$actual" = "$expected" ]; then
        echo "PASS: $label"
    else
        echo "FAIL: $label"
        echo "  expected: $expected"
        echo "  actual:   $actual"
        failed=1
    fi
}

PROMPTS_DIR="$TMP_ROOT/prompts"
WORK_DIR="$TMP_ROOT/work"
ALOOP_RUNTIME_DIR="$TMP_ROOT/runtime"
SESSION_DIR="$TMP_ROOT/session"
ITERATION=7
ARTIFACTS_DIR="$TMP_ROOT/artifacts"
mkdir -p "$PROMPTS_DIR" "$WORK_DIR" "$ALOOP_RUNTIME_DIR/templates" "$SESSION_DIR" "$ARTIFACTS_DIR"

cat > "$ALOOP_RUNTIME_DIR/templates/subagent-hints-build.md" <<'EOF'
## Build Hints
- use error-analyst
EOF

SUBAGENT_HINTS="$(resolve_subagent_hints opencode build)"
rendered="$(substitute_prompt_placeholders 'mode={{SUBAGENT_HINTS}}')"
assert_eq "$rendered" $'mode=## Build Hints\n- use error-analyst' "opencode build injects runtime hints"

SUBAGENT_HINTS="$(resolve_subagent_hints codex build)"
rendered="$(substitute_prompt_placeholders 'mode={{SUBAGENT_HINTS}}')"
assert_eq "$rendered" "mode=" "non-opencode provider gets empty hints"

SUBAGENT_HINTS="$(resolve_subagent_hints opencode qa)"
rendered="$(substitute_prompt_placeholders 'mode={{SUBAGENT_HINTS}}')"
assert_eq "$rendered" "mode=" "unsupported phase gets empty hints"

rm -f "$ALOOP_RUNTIME_DIR/templates/subagent-hints-build.md"
cat > "$PROMPTS_DIR/subagent-hints-build.md" <<'EOF'
## Prompt Hints
- fallback source
EOF
SUBAGENT_HINTS="$(resolve_subagent_hints opencode build)"
rendered="$(substitute_prompt_placeholders 'mode={{SUBAGENT_HINTS}}')"
assert_eq "$rendered" $'mode=## Prompt Hints\n- fallback source' "prompts dir fallback used when runtime template is missing"

if [ "$failed" -eq 0 ]; then
    echo "All tests passed!"
    exit 0
fi

echo "Some tests failed!"
exit 1
