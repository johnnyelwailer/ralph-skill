import { expect, test } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
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
const specPath = path.join(workdir, 'SPEC.md');
const researchPath = path.join(workdir, 'RESEARCH.md');
const reviewLogPath = path.join(workdir, 'REVIEW_LOG.md');
const extraDocPath = path.join(workdir, 'EXTRA.md');
const steeringPath = path.join(workdir, 'STEERING.md');
const activePath = path.join(runtimeDir, 'active.json');
const historyPath = path.join(runtimeDir, 'history.json');

async function resetFixtures() {
  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });

  const now = new Date().toISOString();

  await writeFile(
    statusPath,
    JSON.stringify({ state: 'running', iteration: 1, mode: 'build', provider: 'copilot', model: 'gpt-5.3-codex', started_at: now }),
    'utf8',
  );
  await writeFile(logPath, `{"level":"info","message":"fixture log line", "event": "session_start", "timestamp": "${now}"}\n`, 'utf8');
  await writeFile(todoPath, '# Fixture TODO Heading\n\n- [ ] Example task\n', 'utf8');
  await writeFile(specPath, '# Fixture SPEC Heading\n', 'utf8');
  await writeFile(researchPath, '# Fixture RESEARCH Heading\n', 'utf8');
  await writeFile(reviewLogPath, '# Fixture REVIEW LOG Heading\n', 'utf8');
  await writeFile(extraDocPath, '# Fixture EXTRA Heading\n', 'utf8');
  await writeFile(
    activePath,
    JSON.stringify([
      {
        id: 'session-active',
        project_name: 'Fixture Active Project',
        session_name: 'active-session',
        status: 'running',
        elapsed: '00:01:23',
        iteration: 7,
        started_at: now,
      },
    ]),
    'utf8',
  );
  await writeFile(
    historyPath,
    JSON.stringify([
      {
        id: 'session-recent',
        project_name: 'Fixture Recent Project',
        session_name: 'recent-session',
        status: 'complete',
        elapsed: '00:09:59',
        iteration: 12,
        ended_at: now,
      },
    ]),
    'utf8',
  );

  await rm(steeringPath, { force: true });
  await rm(metaPath, { force: true });
}

test.beforeEach(async () => {
  await resetFixtures();
});

test('renders dashboard shell and shows sessions', async ({ page }) => {
  await page.goto('/');

  // Check hidden H1 for accessibility/test consistency
  await expect(page.getByRole('heading', { name: 'Aloop Dashboard', includeHidden: true })).toBeVisible();
  
  // Sidebar sessions
  await expect(page.locator('aside').getByText('active-session')).toBeVisible();
  await expect(page.locator('aside').getByText('recent-session')).toBeVisible();
});

test('shows fixture-backed progress status in header', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('session-header-grid')).toBeVisible();
  await expect(page.getByTestId('header-provider-model')).toContainText('copilot');
  await expect(page.getByTestId('header-status')).toHaveText('running');
});

test('layout at 1920x1080 shows all three columns', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const sidebar = page.locator('aside').first();
  const docsHeading = page.getByRole('heading', { name: 'Documents' });
  const activityHeading = page.getByRole('heading', { name: 'Activity' });

  await expect(sidebar).toBeVisible();
  await expect(docsHeading).toBeVisible();
  await expect(activityHeading).toBeVisible();

  const sidebarBox = await sidebar.boundingBox();
  const docsBox = await docsHeading.boundingBox();
  const activityBox = await activityHeading.boundingBox();

  expect(sidebarBox).not.toBeNull();
  expect(docsBox).not.toBeNull();
  expect(activityBox).not.toBeNull();

  if (sidebarBox && docsBox && activityBox) {
    // Explicit desktop visibility checks for all three major layout regions.
    expect(sidebarBox.width).toBeGreaterThan(0);
    expect(sidebarBox.x + sidebarBox.width).toBeGreaterThan(0);
    expect(docsBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width);
    expect(docsBox.x).toBeLessThan(activityBox.x);
    expect(activityBox.x).toBeLessThan(1920);
  }
});

test('layout at 375x667 (mobile) shows only one panel and mobile menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  // Sidebar should be hidden
  await expect(page.locator('aside')).not.toBeVisible();
  
  // Documents should be visible by default
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  
  // Activity should be hidden on mobile by default (it has hidden lg:flex)
  await expect(page.getByRole('heading', { name: 'Activity' })).not.toBeVisible();
  
  // Toggle to Activity via mobile menu button
  await page.getByRole('button', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documents' })).not.toBeVisible();
});

test('mobile viewport keeps critical touch targets at least 44x44', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const assertMinTarget = async (name: string, locator: ReturnType<typeof page.locator>) => {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box, `${name} should have a measurable bounding box`).not.toBeNull();
    expect(box!.width, `${name} width should be >= 44px`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${name} height should be >= 44px`).toBeGreaterThanOrEqual(44);
  };

  await assertMinTarget('hamburger button', page.getByRole('button', { name: 'Toggle sidebar' }));
  await assertMinTarget('documents tab trigger', page.getByRole('button', { name: 'Documents' }));
  await assertMinTarget('activity tab trigger', page.getByRole('button', { name: 'Activity' }));
  await assertMinTarget('steer textarea', page.getByPlaceholder('Steer...'));

  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  const mobileSidebar = page.locator('aside').filter({ hasText: 'Sessions' });
  await assertMinTarget('session card', mobileSidebar.getByRole('button', { name: /active-session/ }).first());
  await page.keyboard.press('Escape');

  await page.locator('footer button').last().click();
  await assertMinTarget('stop-after-iteration dropdown item', page.getByRole('menuitem', { name: /Stop after iteration/i }));
  await page.keyboard.press('Escape');
});

test('writes steering instruction', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('Steer...').fill('Keep it up!');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('Steering instruction queued.')).toBeVisible();
});
