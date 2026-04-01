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
const steeringPath = path.join(workdir, 'STEERING.md');
const activePath = path.join(runtimeDir, 'active.json');
const historyPath = path.join(runtimeDir, 'history.json');

const artifactDir = path.resolve(currentDir, '..', '..', '..', '..', 'proof-artifacts');

async function resetFixtures() {
  await mkdir(sessionDir, { recursive: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await mkdir(artifactDir, { recursive: true });

  const now = new Date().toISOString();

  await writeFile(
    statusPath,
    JSON.stringify({ state: 'running', iteration: 1, mode: 'build', provider: 'copilot', model: 'gpt-5.3-codex', started_at: now }),
    'utf8',
  );
  await writeFile(logPath, `{"level":"info","message":"fixture log line", "event": "session_start", "timestamp": "${now}"}\n`, 'utf8');
  await writeFile(todoPath, '# Fixture TODO Heading\n\n- [ ] Example task\n', 'utf8');
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

test('proof: mobile 390x844 — hamburger visible, sidebar closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // Hamburger menu should be visible on mobile
  const hamburger = page.getByRole('button', { name: 'Toggle sidebar' });
  await expect(hamburger).toBeVisible();

  // Sidebar should be hidden by default on mobile
  await expect(page.locator('aside')).not.toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-hamburger.png'), fullPage: true });
});

test('proof: mobile 390x844 — sidebar drawer open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // Open sidebar via hamburger
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();

  // Sidebar drawer and overlay should be visible
  await expect(page.locator('.fixed.inset-0.z-40')).toBeVisible();
  await expect(page.locator('.fixed.inset-0.z-40 aside')).toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-sidebar-open.png'), fullPage: true });
});

test('proof: mobile 390x844 — swipe gesture opens sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // Sidebar should be closed initially
  await expect(page.locator('aside')).not.toBeVisible();

  // Dispatch touch events to simulate swipe from left edge
  await page.evaluate(() => {
    const root = document.querySelector('.h-screen') as HTMLElement;
    if (!root) return;

    const touchStart = new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [new Touch({ identifier: 0, target: root, clientX: 5, clientY: 400 })],
    });
    root.dispatchEvent(touchStart);

    const touchEnd = new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      changedTouches: [new Touch({ identifier: 0, target: root, clientX: 80, clientY: 400 })],
    });
    root.dispatchEvent(touchEnd);
  });

  // Sidebar should be open after swipe
  await expect(page.locator('.fixed.inset-0.z-40')).toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, 'mobile-390x844-swipe-open.png'), fullPage: true });
});

test('proof: tablet 768x1024 — sidebar hidden by default, hamburger visible', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');

  // Hamburger should be visible at tablet (lg:hidden means visible below 1024px)
  await expect(page.getByRole('button', { name: 'Toggle sidebar' })).toBeVisible();

  // Desktop sidebar div should be hidden at tablet (hidden lg:flex)
  await expect(page.locator('aside').first()).not.toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, 'tablet-768x1024-layout.png'), fullPage: true });
});

test('proof: desktop 1280x800 — layout unchanged, no collapse button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // Sidebar should be visible at desktop
  await expect(page.locator('aside')).toBeVisible();

  // Hamburger should NOT be visible at desktop
  await expect(page.getByRole('button', { name: 'Toggle sidebar' })).not.toBeVisible();

  // Collapse sidebar button should NOT be visible at desktop (isDesktop=true → !isDesktop hides it)
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).not.toBeVisible();

  // All three columns visible at desktop
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();

  await page.screenshot({ path: path.join(artifactDir, 'desktop-1280x800-layout.png'), fullPage: true });
});
