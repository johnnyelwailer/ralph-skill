#!/usr/bin/env bash
# e2e-dynamic-session-test.sh — Full E2E test for Azure Container Apps Dynamic Sessions
# Prereqs: session pool created + container image pushed
set -euo pipefail

SUB="${AZURE_SUBSCRIPTION_ID:-<your-subscription-id>}"
RG="${AZURE_RESOURCE_GROUP:-sandbox-spike-dev}"
POOL_NAME="${SESSION_POOL_NAME:-sandbox-playwright-pool}"
SESSION_ID="e2e-test-$(date +%s)"

echo "=== 1. Get session pool management endpoint ==="
MGMT_EP=$(az rest \
  --method GET \
  --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/sessionPools/$POOL_NAME?api-version=2025-07-01" \
  --query 'properties.poolManagementEndpoint' -o tsv)
echo "Pool management endpoint: $MGMT_EP"

echo ""
echo "=== 2. Get bearer token ==="
TOKEN=$(az account get-access-token \
  --resource "https://dynamicsessions.io" \
  --query accessToken -o tsv)
echo "Token obtained (${#TOKEN} chars)"

echo ""
echo "=== 3. Allocate session: $SESSION_ID ==="
ALLOC=$(curl -sf -X POST \
  "${MGMT_EP}api/sessions?api-version=2025-02-02-preview&identifier=$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')
echo "Allocation response: $ALLOC"

echo ""
echo "=== 4. Wait for session ready (up to 2 min) ==="
for i in $(seq 1 24); do
  STATUS=$(curl -sf \
    "${MGMT_EP}api/sessions?api-version=2025-02-02-preview&identifier=$SESSION_ID" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('properties',{}).get('status','unknown'))" 2>/dev/null || echo "pending")
  echo "  [$i] status: $STATUS"
  [ "$STATUS" = "Running" ] && break
  sleep 5
done

echo ""
echo "=== 5. GET /env-info ==="
curl -sf \
  "${MGMT_EP}api/sessions?api-version=2025-02-02-preview&identifier=$SESSION_ID/env-info" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "=== 6. POST /run-test (Playwright screenshot) ==="
RESULT=$(curl -sf -X POST \
  "${MGMT_EP}api/sessions?api-version=2025-02-02-preview&identifier=$SESSION_ID/run-test" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","secretName":"TEST-API-KEY","fullPage":true}')

echo "$RESULT" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
print('pageTitle:      ', d.get('pageTitle'))
print('dotnetVersion:  ', d.get('dotnetVersion'))
print('secretProbe:    ', json.dumps(d.get('secretProbe')))
print('screenshotBytes:', d.get('screenshotBytes'))
print('timing:         ', json.dumps(d.get('timing')))
print('logs:')
for l in d.get('logs',[]):
    print('  ', l)

scr = d.get('screenshot')
if scr:
    path = '/tmp/spike-screenshot.png'
    with open(path, 'wb') as f:
        f.write(base64.b64decode(scr))
    print(f'Screenshot saved to: {path}')
"

open /tmp/spike-screenshot.png 2>/dev/null || echo "(macOS preview unavailable in CI)"

echo ""
echo "=== 7. Cost query (MTD) ==="
az rest \
  --method POST \
  --url "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.CostManagement/query?api-version=2023-11-01" \
  --body '{
    "type": "ActualCost",
    "timeframe": "MonthToDate",
    "dataset": {
      "granularity": "None",
      "aggregation": {
        "totalCost": {"name": "Cost", "function": "Sum"}
      },
      "grouping": [{"type": "Dimension", "name": "ResourceType"}]
    }
  }' | python3 -c "
import sys,json
d=json.load(sys.stdin)
rows = d.get('properties',{}).get('rows',[])
print(f'{'Cost (CHF)':<14} {'Resource Type'}')
print('-'*70)
for r in sorted(rows, key=lambda x: -x[0]):
    print(f'{r[0]:<14.4f} {r[2]}')
"

echo ""
echo "✅ E2E test complete"
