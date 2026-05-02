#!/usr/bin/env bash
# benchmark-sessions.sh — Cold vs warm start latency + cost for N parallel Dynamic Sessions
#
# Measures:
#   COLD:
#     - Session allocation time (POST allocate → HTTP 200)
#     - Container cold-start (process start → first /health response)
#     - First /run-test round-trip (Chromium launch included)
#   WARM:
#     - Second /run-test on the same container (browser not cached, but no OS boot)
#     - /warm-probe round-trip (pure HTTP overhead, no Playwright) — median of 3
#   COST:
#     - Per-second / per-minute / per-run (cold path)
#     - Warm-run cost (delta = run duration × rate, no extra startup)
#
# Usage: ./benchmark-sessions.sh [N_SESSIONS]
set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-<your-subscription-id>}"
RG="${AZURE_RESOURCE_GROUP:-sandbox-spike-dev}"
POOL_NAME="${SESSION_POOL_NAME:-sandbox-playwright-pool}"
N="${1:-3}"
RUN_ID="bench-$(date +%s)"
RESULT_DIR="/tmp/$RUN_ID"
mkdir -p "$RESULT_DIR"

echo "========================================================"
echo " Dynamic Sessions Benchmark — Cold vs Warm"
echo " Pool:     $POOL_NAME"
echo " Sessions: $N parallel"
echo " Run ID:   $RUN_ID"
echo " Results:  $RESULT_DIR"
echo "========================================================"
echo ""

echo "=== Getting pool endpoint + token ==="
MGMT_EP=$(az rest \
  --method GET \
  --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/sessionPools/$POOL_NAME?api-version=2025-07-01" \
  --query 'properties.poolManagementEndpoint' -o tsv)
echo "Endpoint: $MGMT_EP"

TOKEN=$(az account get-access-token \
  --resource "https://dynamicsessions.io" \
  --query accessToken -o tsv)
echo "Token obtained"
echo ""

ms_now() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

session_url() {
  local session_id=$1
  local endpoint=$2
  printf '%s%s?identifier=%s' "$MGMT_EP" "$endpoint" "$session_id"
}

run_session() {
  local i=$1
  local SESSION_ID="$RUN_ID-s$i"

  # ── COLD: first request auto-allocates the session ─────────────────────
  local T0
  T0=$(ms_now)

  local T_ALLOC_DONE=""
  local HEALTH_MS="null"
  local HTTP
  for attempt in $(seq 1 36); do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 20 \
      "$(session_url "$SESSION_ID" "/health")" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")
    if [ "$HTTP" = "200" ]; then
      T_ALLOC_DONE=$(ms_now)
      ALLOC_MS=$(( T_ALLOC_DONE - T0 ))
      HEALTH_MS=0
      break
    fi
    sleep 5
  done

  if [ -z "$T_ALLOC_DONE" ]; then
    echo "  [s$i] failed to become healthy (last HTTP=${HTTP:-000})"
    return
  fi

  local ALLOC_MS
  ALLOC_MS=$(( T_ALLOC_DONE - T0 ))

  # ── COLD run-test ───────────────────────────────────────────────────────
  local T_COLD_RUN
  T_COLD_RUN=$(ms_now)
  local COLD_RESULT
  COLD_RESULT=$(curl -sf -X POST \
    --max-time 120 \
    "$(session_url "$SESSION_ID" "/run-test")" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-bench-seq: 1" \
    -d '{"url":"https://example.com","secretName":"TEST-API-KEY"}' 2>/dev/null || echo '{}')
  local COLD_RUN_MS=$(( $(ms_now) - T_COLD_RUN ))

  echo "$COLD_RESULT" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
s=d.get('screenshot','')
if s: open('$RESULT_DIR/cold-s$i.png','wb').write(base64.b64decode(s))
" 2>/dev/null || true

  # ── WARM probe: 3 round-trips, take median ──────────────────────────────
  local P1 P2 P3
  P1=$(ms_now); curl -sf -X POST --max-time 20 "$(session_url "$SESSION_ID" "/warm-probe")" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1 || true; P1=$(( $(ms_now) - P1 ))
  P2=$(ms_now); curl -sf -X POST --max-time 20 "$(session_url "$SESSION_ID" "/warm-probe")" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1 || true; P2=$(( $(ms_now) - P2 ))
  P3=$(ms_now); curl -sf -X POST --max-time 20 "$(session_url "$SESSION_ID" "/warm-probe")" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1 || true; P3=$(( $(ms_now) - P3 ))
  local WARM_PROBE_MEDIAN
  WARM_PROBE_MEDIAN=$(printf '%s\n' "$P1" "$P2" "$P3" | sort -n | awk 'NR==2')

  # ── WARM run-test ───────────────────────────────────────────────────────
  local T_WARM_RUN
  T_WARM_RUN=$(ms_now)
  local WARM_RESULT
  WARM_RESULT=$(curl -sf -X POST \
    --max-time 120 \
    "$(session_url "$SESSION_ID" "/run-test")" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-bench-seq: 2" \
    -d '{"url":"https://example.com"}' 2>/dev/null || echo '{}')
  local WARM_RUN_MS=$(( $(ms_now) - T_WARM_RUN ))

  echo "$WARM_RESULT" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
s=d.get('screenshot','')
if s: open('$RESULT_DIR/warm-s$i.png','wb').write(base64.b64decode(s))
" 2>/dev/null || true

  # ── /metrics for authoritative cold-start figure ────────────────────────
  local METRICS
  METRICS=$(curl -sf \
    --max-time 20 \
    "$(session_url "$SESSION_ID" "/metrics")" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo '{}')

  local COLD_START_MS UPTIME_SEC PAGE_TITLE SECRET_OK DOTNET SCR_BYTES
  COLD_START_MS=$(echo "$METRICS"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('firstRequestAfterStartMs') or 'null')" 2>/dev/null || echo "null")
  UPTIME_SEC=$(echo "$METRICS"     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('uptimeSec','?'))" 2>/dev/null || echo "?")
  PAGE_TITLE=$(echo "$COLD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pageTitle','?'))" 2>/dev/null || echo "?")
  SECRET_OK=$(echo "$COLD_RESULT"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('secretProbe',{}).get('ok','?'))" 2>/dev/null || echo "?")
  DOTNET=$(echo "$COLD_RESULT"     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dotnetVersion','?'))" 2>/dev/null || echo "?")
  SCR_BYTES=$(echo "$COLD_RESULT"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('screenshotBytes',0))" 2>/dev/null || echo "0")

  python3 - <<PY > "$RESULT_DIR/s$i.json"
import json

def parse_value(value):
    if value in ("null", "None", ""):
        return None
    if value in ("True", "true"):
        return True
    if value in ("False", "false"):
        return False
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value

payload = {
    "session": "$SESSION_ID",
    "allocMs": parse_value("$ALLOC_MS"),
    "healthReadyMs": parse_value("$HEALTH_MS"),
    "coldStartMs": parse_value("$COLD_START_MS"),
    "coldRunMs": parse_value("$COLD_RUN_MS"),
    "warmProbeMs": parse_value("$WARM_PROBE_MEDIAN"),
    "warmRunMs": parse_value("$WARM_RUN_MS"),
    "uptimeSec": parse_value("$UPTIME_SEC"),
    "pageTitle": "$PAGE_TITLE",
    "secretOk": parse_value("$SECRET_OK"),
    "dotnetVersion": "$DOTNET",
    "screenshotBytes": parse_value("$SCR_BYTES"),
}

json.dump(payload, open("$RESULT_DIR/s$i.json", "w"))
PY

  echo "  [s$i] alloc=${ALLOC_MS}ms ready=${HEALTH_MS}ms | COLD run=${COLD_RUN_MS}ms | WARM probe=${WARM_PROBE_MEDIAN}ms run=${WARM_RUN_MS}ms | dotnet=$DOTNET secret=$SECRET_OK"
}

# ── Fire N sessions in parallel ───────────────────────────────────────────────
echo "=== Running $N parallel sessions (cold + warm each) ==="
PIDS=()
for i in $(seq 1 $N); do
  run_session "$i" &
  PIDS+=($!)
done
for pid in "${PIDS[@]}"; do wait "$pid" || true; done

echo ""
echo "========================================================"
echo " Results"
echo "========================================================"

RESULT_DIR="$RESULT_DIR" python3 << PYEOF
import os, json, glob

result_dir = os.environ['RESULT_DIR']
files = sorted(glob.glob(f"{result_dir}/s*.json"))
if not files:
    print("No result files found.")
    raise SystemExit(1)

rows = [json.load(open(f)) for f in files]

def stats(vals):
    vals = [float(v) for v in vals if v is not None and str(v) != 'null']
    if not vals: return "N/A"
    s = sorted(vals)
    p50 = s[len(s)//2]
    p95 = s[min(int(len(s)*0.95), len(s)-1)]
    return f"avg={int(sum(vals)/len(vals))}ms  p50={int(p50)}ms  p95={int(p95)}ms  min={int(min(vals))}ms  max={int(max(vals))}ms"

def fmt(v):
    return "N/A" if v is None or str(v) == 'null' else f"{v}ms"

# Per-session table
print(f"\n{'Session':<22} {'AllocMs':>8} {'HealthMs':>9} {'ColdStart':>10} {'ColdRun':>9} {'WarmProbe':>10} {'WarmRun':>9}")
print("-" * 83)
for r in rows:
    print(
        f"{r['session']:<22}"
        f" {fmt(r['allocMs']):>8}"
        f" {fmt(r['healthReadyMs']):>9}"
        f" {fmt(r['coldStartMs']):>10}"
        f" {fmt(r['coldRunMs']):>9}"
        f" {fmt(r['warmProbeMs']):>10}"
        f" {fmt(r['warmRunMs']):>9}"
    )

print("\n── Latency distribution ──────────────────────────────────────────────")
print(f"  Session allocation:    {stats([r['allocMs'] for r in rows])}")
print(f"  Container health-ready:{stats([r['healthReadyMs'] for r in rows])}")
print()
print(f"  COLD  cold-start*:     {stats([r['coldStartMs'] for r in rows])}")
print(f"  COLD  /run-test:       {stats([r['coldRunMs'] for r in rows])}")
print()
print(f"  WARM  /warm-probe:     {stats([r['warmProbeMs'] for r in rows])}")
print(f"  WARM  /run-test:       {stats([r['warmRunMs'] for r in rows])}")

cold_runs = [float(r['coldRunMs']) for r in rows if str(r['coldRunMs']) != 'null']
warm_runs = [float(r['warmRunMs']) for r in rows if str(r['warmRunMs']) != 'null']
if cold_runs and warm_runs:
    delta = sum(cold_runs)/len(cold_runs) - sum(warm_runs)/len(warm_runs)
    pct   = delta / (sum(cold_runs)/len(cold_runs)) * 100
    print()
    print(f"  Warm speedup vs cold:  {int(delta)}ms faster  ({pct:.0f}% reduction in /run-test)")
    print(f"  * cold-start = container process start → first request (reported by /metrics)")

# Cost
cpu = 2; mem = 4
cps = cpu * 0.000016 + mem * 0.000002   # cost per second USD
cpm = cps * 60
cooldown = 300
avg_cold_s = sum(cold_runs)/len(cold_runs)/1000 if cold_runs else 0
avg_warm_s = sum(warm_runs)/len(warm_runs)/1000 if warm_runs else 0
cost_cold  = (avg_cold_s + cooldown) * cps
cost_warm  = avg_warm_s * cps

print(f"\n── Cost estimate (2 vCPU / 4 GiB, Consumption plan USD) ──────────────")
print(f"  Per second:                \${cps:.6f}")
print(f"  Per minute:                \${cpm:.5f}   (~\${cpm*0.9173:.5f} CHF)")
print()
print(f"  COLD  avg /run-test:       {avg_cold_s:.1f}s")
print(f"  COLD  billed (run+cooldown):{avg_cold_s+cooldown:.0f}s")
print(f"  COLD  cost per run:        \${cost_cold:.5f}  (~\${cost_cold*0.9173:.5f} CHF)")
print()
print(f"  WARM  avg /run-test:       {avg_warm_s:.1f}s")
print(f"  WARM  cost per run:        \${cost_warm:.5f}  (~\${cost_warm*0.9173:.5f} CHF)")
print(f"  WARM  saving vs cold:      \${cost_cold-cost_warm:.5f}  ({(cost_cold-cost_warm)/cost_cold*100:.0f}%)")
print()
print(f"  1000 cold runs/day:        \${cost_cold*1000:.3f}/day   (\${cost_cold*1000*30:.2f}/month)")
print(f"  1000 warm runs/day:        \${cost_warm*1000:.3f}/day   (\${cost_warm*1000*30:.2f}/month)")
print()
baseline = cpm * 60 * 24
print(f"  Pre-warm baseline (readySessionInstances=1):")
print(f"    \${baseline:.3f}/day  \${baseline*30:.2f}/month  (one always-on instance)")
print(f"  Set readySessionInstances=0 to remove baseline at cost of first-request cold start.")
PYEOF

echo ""
echo "Screenshots: $RESULT_DIR/"
ls "$RESULT_DIR/"*.png 2>/dev/null | while read f; do
  echo "  $f"; open "$f" 2>/dev/null || true
done

echo ""
echo "=== Azure actual cost (MTD) ==="
az rest \
  --method POST \
  --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.CostManagement/query?api-version=2023-11-01" \
  --body '{"type":"ActualCost","timeframe":"MonthToDate","dataset":{"granularity":"None","aggregation":{"totalCost":{"name":"Cost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ResourceType"}]}}' \
  2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('properties', {}).get('rows', [])
if not rows:
    print('  (no cost data yet — may take 24h to appear)')
else:
    print(f\"  {'Cost (USD)':<14} Resource Type\")
    print('  ' + '-'*60)
    for r in sorted(rows, key=lambda x: -x[0]):
        if r[0] > 0: print(f\"  {r[0]:<14.5f} {r[2]}\")
" || echo "  (cost query unavailable)"

echo ""
echo "✅ Benchmark complete"
