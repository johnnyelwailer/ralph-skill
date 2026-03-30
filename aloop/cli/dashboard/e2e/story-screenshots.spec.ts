import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(currentDir, '..', '..', '..', '..', 'proof-artifacts');

interface StoryDef {
  id: string;
  file: string;
}

const stories: StoryDef[] = [
  // Sidebar stories (6)
  { id: 'layout-sidebar--default', file: 'sidebar-default.png' },
  { id: 'layout-sidebar--with-selected-session', file: 'sidebar-withselectedsession.png' },
  { id: 'layout-sidebar--with-older-sessions', file: 'sidebar-witholdersessions.png' },
  { id: 'layout-sidebar--collapsed', file: 'sidebar-collapsed.png' },
  { id: 'layout-sidebar--desktop', file: 'sidebar-desktop.png' },
  { id: 'layout-sidebar--empty', file: 'sidebar-empty.png' },

  // SessionDetail stories (5)
  { id: 'session-sessiondetail--default', file: 'sessiondetail-default.png' },
  { id: 'session-sessiondetail--with-provider-health', file: 'sessiondetail-withproviderhealth.png' },
  { id: 'session-sessiondetail--activity-panel-active', file: 'sessiondetail-activitypanelactive.png' },
  { id: 'session-sessiondetail--activity-collapsed', file: 'sessiondetail-activitycollapsed.png' },
  { id: 'session-sessiondetail--with-repo-link', file: 'sessiondetail-withrepolink.png' },

  // DocsPanel stories (6)
  { id: 'layout-docspanel--default', file: 'docspanel-default.png' },
  { id: 'layout-docspanel--with-repo-url', file: 'docspanel-withrepourl.png' },
  { id: 'layout-docspanel--with-provider-health', file: 'docspanel-withproviderhealth.png' },
  { id: 'layout-docspanel--activity-collapsed', file: 'docspanel-activitycollapsed.png' },
  { id: 'layout-docspanel--empty-docs', file: 'docspanel-emptydocs.png' },
  { id: 'layout-docspanel--many-documents', file: 'docspanel-manydocuments.png' },

  // MainPanel stories (6 — excluding WithLogs per task spec)
  { id: 'layout-mainpanel--default', file: 'mainpanel-default.png' },
  { id: 'layout-mainpanel--activity-panel-active', file: 'mainpanel-activitypanelactive.png' },
  { id: 'layout-mainpanel--activity-collapsed', file: 'mainpanel-activitycollapsed.png' },
  { id: 'layout-mainpanel--not-running', file: 'mainpanel-notrunning.png' },
  { id: 'layout-mainpanel--multiple-iterations', file: 'mainpanel-multipleiterations.png' },
  { id: 'layout-mainpanel--empty-session', file: 'mainpanel-emptysession.png' },

  // Header stories (7)
  { id: 'layout-header--default', file: 'header-default.png' },
  { id: 'layout-header--loading', file: 'header-loading.png' },
  { id: 'layout-header--disconnected', file: 'header-disconnected.png' },
  { id: 'layout-header--stopped', file: 'header-stopped.png' },
  { id: 'layout-header--no-provider', file: 'header-noprovider.png' },
  { id: 'layout-header--high-budget-usage', file: 'header-highbudgetusage.png' },
  { id: 'layout-header--qa-badge-default', file: 'header-qabadgedefault.png' },
];

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

for (const story of stories) {
  test(`screenshot: ${story.file}`, async ({ page }) => {
    const url = `/iframe.html?id=${story.id}&viewMode=story`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for Storybook to render the story
    const storyRoot = page.locator('#storybook-root');
    await expect(storyRoot).not.toBeEmpty({ timeout: 15_000 });

    // Small delay for any animations/transitions
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(artifactDir, story.file),
      fullPage: true,
    });
  });
}
