import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(currentDir, 'fixtures');
const sessionDir = path.join(fixturesRoot, 'session');
const workdir = path.join(fixturesRoot, 'workdir');
const runtimeDir = path.join(fixturesRoot, 'home', '.aloop');
const statusPath = path.join(sessionDir, 'status.json');
const logPath = path.join(sessionDir, 'log.jsonl');
const metaPath = path.join(sessionDir, 'meta.json');
const todoPath = path.join(workdir, 'TODO.md');
const steeringPath = path.join(workdir, 'STEERING.md');
const activePath = path.join(runtimeDir, 'active.json');
const historyPath = path.join(runtimeDir, 'history.json');

async function resetFixtures() {
  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });

  await writeFile(
    statusPath,
    JSON.stringify({ state: 'running', iteration: 1, mode: 'build', provider: 'copilot', model: 'gpt-5.3-codex' }),
    'utf8',
  );
  await writeFile(logPath, '{"level":"info","message":"fixture log line"}\n', 'utf8');
  await writeFile(todoPath, '# Fixture TODO Heading\n\n- [ ] Example task\n', 'utf8');
  await writeFile(
    activePath,
    JSON.stringify([
      {
        id: 'session-active',
        project_name: 'Fixture Active Session',
        status: 'running',
        elapsed: '00:01:23',
        iteration: 7,
      },
    ]),
    'utf8',
  );
  await writeFile(
    historyPath,
    JSON.stringify([
      {
        id: 'session-recent',
        project_name: 'Fixture Recent Session',
        status: 'complete',
        elapsed: '00:09:59',
        iteration: 12,
      },
    ]),
    'utf8',
  );

  await rm(steeringPath, { force: true });
  await rm(metaPath, { force: true });
}

async function readSingleStateIteration(page: Page): Promise<number> {
  return page.evaluate(() => {
    return new Promise<number>((resolve, reject) => {
      const source = new EventSource('/events');
      const timeout = window.setTimeout(() => {
        source.close();
        reject(new Error('Timed out waiting for state event.'));
      }, 5000);

      source.addEventListener('state', (event) => {
        window.clearTimeout(timeout);
        source.close();
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          status?: { iteration?: number };
        };
        resolve(Number(payload.status?.iteration ?? -1));
      });
    });
  });
}

test.beforeEach(async () => {
  await resetFixtures();
});

test('renders three-column shell and default progress view', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Aloop Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Views' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
});

test('shows fixture-backed session list and progress status', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Fixture Active Session')).toBeVisible();
  await expect(page.getByText('running • 00:01:23 • iter 7')).toBeVisible();
  await expect(page.getByText('Fixture Recent Session')).toBeVisible();

  await expect(page.getByText('State: running')).toBeVisible();
  await expect(page.getByText('Iteration: 1')).toBeVisible();
  await expect(page.getByText('Provider: copilot')).toBeVisible();
  await page.getByRole('tab', { name: 'Summary' }).click();
  await expect(page.getByText('Phase: build')).toBeVisible();
});

test('uses a grid header layout that keeps right-side metadata visible on narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto('/');

  const headerGrid = page.getByTestId('session-header-grid');
  await expect(headerGrid).toBeVisible();
  await expect(headerGrid).toHaveCSS('display', 'grid');
  await expect(page.getByTestId('header-provider-model')).toHaveText('copilot/gpt-5.3-codex');
  await expect(page.getByTestId('header-status')).toHaveText('running');
  await expect(page.getByTestId('header-updated-at')).toBeVisible();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  const rightEdge = (element: Element) => element.getBoundingClientRect().right;
  const leftEdge = (element: Element) => element.getBoundingClientRect().left;

  const providerRight = await page.getByTestId('header-provider-model').evaluate(rightEdge);
  const statusRight = await page.getByTestId('header-status').evaluate(rightEdge);
  const timestampRight = await page.getByTestId('header-updated-at').evaluate(rightEdge);
  const timestampLeft = await page.getByTestId('header-updated-at').evaluate(leftEdge);

  expect(providerRight).toBeLessThanOrEqual(viewportWidth + 1);
  expect(statusRight).toBeLessThanOrEqual(viewportWidth + 1);
  expect(timestampRight).toBeLessThanOrEqual(viewportWidth + 1);
  expect(timestampLeft).toBeGreaterThanOrEqual(0);
});

test('renders docs markdown and log view while navigating tabs', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Docs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Docs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture TODO Heading' })).toBeVisible();

  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log' })).toBeVisible();
  await expect(page.getByText('fixture log line')).toBeVisible();

  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
});

test('writes STEERING.md from steer flow', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Steer' }).click();
  await page.getByPlaceholder('Enter steering guidance to write STEERING.md...').fill('Prioritize review findings first.');
  await page.getByRole('button', { name: 'Submit steering instruction' }).click();

  await expect(page.getByText('Steering instruction queued.')).toBeVisible();

  const steeringContent = await readFile(steeringPath, 'utf8');
  expect(steeringContent).toContain('Prioritize review findings first.');
});

test('submits stop request and shows stop status', async ({ page }) => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await writeFile(metaPath, JSON.stringify({ pid: child.pid }), 'utf8');

    await page.goto('/');
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByRole('button', { name: 'Stop session' }).click();

    await expect(page.getByText('Stop requested (SIGTERM).')).toBeVisible();
  } finally {
    if (!child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Process may already be gone.
      }
    }
  }
});

test('supports reconnecting to SSE stream and reading updated state', async ({ page }) => {
  await page.goto('/');

  const firstIteration = await readSingleStateIteration(page);
  expect(firstIteration).toBe(1);

  await writeFile(statusPath, JSON.stringify({ state: 'running', iteration: 2, mode: 'review' }), 'utf8');
  await expect.poll(async () => page.getByText('Iteration: 2').isVisible()).toBe(true);

  const secondIteration = await readSingleStateIteration(page);
  expect(secondIteration).toBe(2);
});
