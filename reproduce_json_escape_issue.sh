#!/bin/bash

json_escape_fixed() {
    # 1. Escape backslashes and quotes
    # 2. Escape carriage returns and tabs
    # 3. Escape newlines (embedded)
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r/\\r/g; s/\t/\\t/g' | sed ':a;N;$!ba;s/\n/\\n/g'
}

test_string=$'Line 1\nLine 2\tTabbed\rCarriage'
escaped=$(json_escape_fixed "$test_string")

echo "Original string:"
echo -n "$test_string" | cat -v
echo ""
echo "---"
echo "Escaped string (fixed):"
echo -n "$escaped" | cat -v
echo ""
echo "---"

# Attempt to parse with node
json="{\"test\": \"$escaped\"}"
node -e "try { JSON.parse(process.argv[1]); console.log('SUCCESS: Valid JSON'); } catch (e) { console.log('FAILURE: Invalid JSON'); console.log(e.message); process.exit(1); }" "$json"
if [ $? -eq 0 ]; then
    echo "Confirmed SUCCESS"
else
    echo "Confirmed FAILURE"
    echo "JSON was: $json" | cat -v
fi
