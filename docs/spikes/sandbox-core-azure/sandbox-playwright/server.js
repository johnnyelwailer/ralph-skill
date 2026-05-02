'use strict';

const express = require('express');
const { chromium } = require('playwright');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { execSync } = require('child_process');
const os = require('os');

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 8080;
const KEY_VAULT_URL = process.env.KEY_VAULT_URL;

// Track process start time for cold-start measurement
const PROCESS_START_MS = Date.now();
let firstRequestMs = null;   // set on first inbound request
let requestCount = 0;
// Track per-endpoint first-call times to distinguish cold vs warm path
const endpointFirstCallMs = {};

// Middleware: track first-request time + per-endpoint first-call
app.use((req, _res, next) => {
  requestCount++;
  if (firstRequestMs === null) firstRequestMs = Date.now();
  const ep = req.path;
  if (!endpointFirstCallMs[ep]) endpointFirstCallMs[ep] = Date.now();
  next();
});

// Lazy init — credential only needed if Key Vault is used
let kvClient = null;
function getKvClient() {
  if (!kvClient) {
    if (!KEY_VAULT_URL) throw new Error('KEY_VAULT_URL env var not set');
    kvClient = new SecretClient(KEY_VAULT_URL, new DefaultAzureCredential());
  }
  return kvClient;
}

// ─── Health / readiness ───────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', ts: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  res.json({ status: 'ready', ts: new Date().toISOString() });
});

// ─── Metrics (startup timing, resource usage) ─────────────────────────────────

app.get('/metrics', (_req, res) => {
  const nowMs = Date.now();
  const uptimeSec = process.uptime();
  // Azure sets CONTAINER_APP_SESSION_IDENTIFIER when session is allocated.
  // Time from container start → first request ≈ warm-up / cold-start latency.
  res.json({
    sessionId: process.env.CONTAINER_APP_SESSION_IDENTIFIER ?? '(local)',
    uptimeSec: Math.round(uptimeSec * 1000) / 1000,
    processStartIso: new Date(PROCESS_START_MS).toISOString(),
    firstRequestAfterStartMs: firstRequestMs ? firstRequestMs - PROCESS_START_MS : null,
    requestCount,
    memUsageMb: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    // Per-endpoint first-call timestamps (relative to process start)
    // Useful for identifying which path incurs JIT / lazy-init overhead
    endpointFirstCallAfterStartMs: Object.fromEntries(
      Object.entries(endpointFirstCallMs).map(([k, v]) => [k, v - PROCESS_START_MS])
    ),
    // Pricing reference: Dynamic Sessions custom container (Consumption plan)
    // Source: https://azure.microsoft.com/pricing/details/container-apps/
    pricing: {
      vcpuPerSec: 0.000016,    // USD per vCPU-second
      memGibPerSec: 0.000002,  // USD per GiB-second
      configVcpu: 2,
      configMemGib: 4,
      costPerSecUsd: 2 * 0.000016 + 4 * 0.000002,    // $0.000040 / sec
      costPerMinUsd: (2 * 0.000016 + 4 * 0.000002) * 60,  // $0.0024 / min
      costPerHourUsd: (2 * 0.000016 + 4 * 0.000002) * 3600, // $0.144 / hr
      elapsedBillableSec: Math.round(uptimeSec),
      estimatedCostUsd: Math.round((2 * 0.000016 + 4 * 0.000002) * uptimeSec * 1e6) / 1e6,
      note: 'Billed from container start; cooldownPeriodInSeconds=300 extends billing after last request',
    },
    ts: new Date(nowMs).toISOString(),
  });
});

// ─── Warm-start probe ─────────────────────────────────────────────────────────
// Lightweight endpoint used by the benchmark for warm-path latency measurement.
// The FIRST call also warms the Node event loop and V8 JIT for /run-test.
// Subsequent calls represent pure warm overhead (proxy + HTTP round-trip only).
app.post('/warm-probe', (req, res) => {
  const serverReceiveMs = Date.now();
  res.json({
    ok: true,
    isFirstCall: endpointFirstCallMs['/warm-probe'] === serverReceiveMs
                  || req.headers['x-bench-seq'] === '1',
    uptimeSec: process.uptime(),
    serverReceiveMs,
  });
});

// ─── Environment info ─────────────────────────────────────────────────────────

app.get('/env-info', (_req, res) => {
  let dotnetVersion = '(not detected)';
  try { dotnetVersion = execSync('dotnet --version', { encoding: 'utf8' }).trim(); } catch {}
  let nodeVersion = process.version;

  res.json({
    node: nodeVersion,
    dotnet: dotnetVersion,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memTotalMb: Math.round(os.totalmem() / 1024 / 1024),
    sessionId: process.env.CONTAINER_APP_SESSION_IDENTIFIER || '(not in session)',
    keyVaultConfigured: !!KEY_VAULT_URL,
  });
});

// ─── Key Vault secret read ────────────────────────────────────────────────────

app.get('/secret/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const t0 = Date.now();
    const secret = await getKvClient().getSecret(name);
    res.json({
      name,
      valueLength: secret.value?.length ?? 0,
      // Never echo the actual value — just confirm read
      ok: true,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    res.status(500).json({ name, ok: false, error: err.message });
  }
});

// ─── Playwright screenshot test ───────────────────────────────────────────────

app.post('/run-test', async (req, res) => {
  const {
    url = 'https://example.com',
    secretName,          // optional KV secret to read during test
    fullPage = false,
    viewportWidth = 1280,
    viewportHeight = 720,
  } = req.body ?? {};

  const t0 = Date.now();
  const result = {
    url,
    ts: new Date().toISOString(),
    sessionId: process.env.CONTAINER_APP_SESSION_IDENTIFIER ?? '(local)',
    timing: {},
    secretProbe: null,
    pageTitle: null,
    screenshot: null,      // base64 PNG
    screenshotBytes: 0,
    logs: [],
    error: null,
  };

  let browser;
  try {
    // Optional: read a Key Vault secret to prove secure injection works
    if (secretName) {
      const ts = Date.now();
      try {
        const secret = await getKvClient().getSecret(secretName);
        result.secretProbe = { name: secretName, ok: true, valueLength: secret.value?.length ?? 0, durationMs: Date.now() - ts };
        result.logs.push(`✓ KV secret '${secretName}' read in ${Date.now() - ts}ms`);
      } catch (err) {
        result.secretProbe = { name: secretName, ok: false, error: err.message };
        result.logs.push(`✗ KV secret read failed: ${err.message}`);
      }
    }

    // Launch browser
    const t1 = Date.now();
    result.logs.push('Launching Chromium...');
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    result.timing.browserLaunch = Date.now() - t1;
    result.logs.push(`✓ Browser launched (${result.timing.browserLaunch}ms)`);

    const page = await browser.newPage();
    await page.setViewportSize({ width: viewportWidth, height: viewportHeight });

    // Navigate
    const t2 = Date.now();
    result.logs.push(`Navigating to ${url}...`);
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    result.timing.navigation = Date.now() - t2;
    result.httpStatus = response?.status();
    result.logs.push(`✓ Navigated — HTTP ${result.httpStatus} (${result.timing.navigation}ms)`);

    result.pageTitle = await page.title();
    result.logs.push(`Page title: "${result.pageTitle}"`);

    // Screenshot
    const t3 = Date.now();
    const buf = await page.screenshot({ fullPage, type: 'png' });
    result.timing.screenshot = Date.now() - t3;
    result.screenshot = buf.toString('base64');
    result.screenshotBytes = buf.length;
    result.logs.push(`✓ Screenshot captured (${result.screenshotBytes} bytes, ${result.timing.screenshot}ms)`);

    // .NET probe
    try {
      const dn = execSync('dotnet --version', { encoding: 'utf8', timeout: 5000 }).trim();
      result.dotnetVersion = dn;
      result.logs.push(`✓ .NET SDK present: ${dn}`);
    } catch {
      result.dotnetVersion = null;
      result.logs.push('⚠ .NET SDK not found');
    }

    await browser.close();
    result.timing.total = Date.now() - t0;
    result.logs.push(`✓ Test complete in ${result.timing.total}ms`);

    res.json(result);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    result.error = err.message;
    result.timing.total = Date.now() - t0;
    result.logs.push(`✗ Fatal: ${err.message}`);
    res.status(500).json(result);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Sandbox agent listening on :${PORT}`);
  console.log(`[${new Date().toISOString()}] KEY_VAULT_URL: ${KEY_VAULT_URL || '(not set)'}`);
});
