source aloop/bin/loop.sh
escaped="$(json_escape "$1")"
printf '%s' "$escaped"
