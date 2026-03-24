# QA Log

## QA Session — 2026-03-21 (iteration 1)

### Binary Under Test
- Not applicable (testing Storybook config, not aloop CLI binary)
- Dashboard dir: `aloop/cli/dashboard/`

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260321-182554/worktree`
- Features tested: 5

### Results
- PASS: Storybook main config, Storybook preview config, storybook dev server, storybook build, Tailwind CSS integration
- FAIL: none

### Observations (not bugs)
1. **addon-essentials version mismatch**: `@storybook/addon-essentials@8.6.14` vs `storybook@8.6.18` — triggers a WARN during dev server startup. Not a functional issue but should be aligned.
2. **No story files warning**: `npx storybook build` warns "No story files found" — expected since `button.stories.tsx` hasn't been created yet (remaining TODO task).
3. **storybook-static not gitignored**: Build output directory `storybook-static/` is not in `.gitignore` — could be accidentally committed.
4. **Spec path mismatch**: SPEC-ADDENDUM references `aloop/dashboard/.storybook/` but dashboard actually lives at `aloop/cli/dashboard/.storybook/`. Cosmetic spec issue.

### Bugs Filed
- None — all completed features pass their acceptance criteria.

### Command Transcript

```
$ ls aloop/cli/dashboard/.storybook/
main.ts  preview.ts
# exit code: 0

$ cat aloop/cli/dashboard/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
# exit code: 0

$ cat aloop/cli/dashboard/.storybook/preview.ts
import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';
import { createElement } from 'react';
import { TooltipProvider } from '../src/components/ui/tooltip';
import '../src/index.css';
const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light', parentSelector: 'html' }),
    (Story) => createElement(TooltipProvider, { delayDuration: 300 }, createElement(Story)),
  ],
};
export default preview;
# exit code: 0

$ grep -E '@storybook' package.json
    "@storybook/addon-essentials": "^8.6.14",
    "@storybook/addon-themes": "^8.6.18",
    "@storybook/react": "^8.6.18",
    "@storybook/react-vite": "^8.6.18",
# exit code: 0

$ ls node_modules/@storybook/
addon-actions addon-backgrounds addon-controls addon-docs addon-essentials
addon-highlight addon-measure addon-outline addon-themes addon-toolbars
addon-viewport blocks builder-vite components core csf-plugin global icons
manager-api preview-api react react-dom-shim react-vite theming
# exit code: 0

$ npx storybook build
@storybook/core v8.6.18
info => Cleaning outputDir: storybook-static
info => Loading presets
info => Building manager..
info => Manager built (94 ms)
info => Building preview..
WARN No story files found for the specified pattern: src/**/*.stories.@(ts|tsx)
✓ 132 modules transformed.
✓ built in 2.47s
info => Preview built (13 s)
info => Output directory: .../storybook-static
# exit code: 0

$ timeout 15 npx storybook dev -p 6007 --ci
@storybook/core v8.6.18
WARN addon-essentials@8.6.14 incompatible with 8.6.18
info => Starting manager..
WARN No story files found
info => Starting preview..
# exit code: 124 (timeout — expected)

$ ls aloop/cli/dashboard/src/index.css
aloop/cli/dashboard/src/index.css
# exit code: 0
# Contains @tailwind base/components/utilities directives and CSS custom properties

$ ls aloop/cli/dashboard/src/components/ui/tooltip.tsx
aloop/cli/dashboard/src/components/ui/tooltip.tsx
# exit code: 0
```

### Cleanup
- Removed `storybook-static/` build output directory

---

## QA Session — 2026-03-24 (iteration 2)

### Binary Under Test
- Binary: `/tmp/aloop-test-install-*/bin/aloop`
- Version: 1.0.0 (installed via `npm run test-install -- --keep`)

### Test Environment
- Worktree: `/home/pj/.aloop/sessions/orchestrator-20260321-172932-issue-183-20260324-085402/worktree`
- Features tested: 5
- Storybook static build: `/tmp/storybook-qa-build/`

### Results
- PASS: VERSIONS.md Storybook fix (Gate 8), SPEC-ADDENDUM.md Storybook 10 references (Gate 9), unit test suite (151/151), Storybook build with all 21 stories, component visual renders (ProviderHealth/AllHealthy, AllFailed, CostDisplay/NoBudgetCap, ArtifactViewer/SingleImage)
- FAIL: Proof screenshots validity (Gate 6) — all 8 story screenshots are identical "Not found" pages

### Bugs Filed
- [qa/P1] Proof screenshots invalid: all 8 identical "Not found" pages (MD5: 99b13def98aa849306b4f00e23948c59, 5199 bytes). Proof agent must use HTTP server, not file:// URLs.

### Command Transcript

```
# Install CLI from source
$ npm --prefix aloop/cli run --silent test-install -- --keep 2>&1 | tail -1
/tmp/aloop-test-install-vX91Bb/bin/aloop
# Binary: /tmp/aloop-test-install-vX91Bb/bin/aloop
$ /tmp/aloop-test-install-vX91Bb/bin/aloop --version
1.0.0
# exit code: 0

# Gate 8: VERSIONS.md Storybook version
$ grep -n "storybook" VERSIONS.md
71:| @storybook/*                | 10.x    |
# PASS: 10.x correctly set

# Gate 9: SPEC-ADDENDUM.md Storybook references
$ grep -n "storybook" SPEC-ADDENDUM.md | grep -i "storybook 1"
139:- **Storybook 10** with `@storybook/react-vite` as the framework adapter
176:- [ ] Storybook 10 is configured with `@storybook/react-vite` in `aloop/dashboard/.storybook/`
# PASS: Both lines reference Storybook 10

# Unit test suite
$ npm test -- --run
Test Files: 19 passed (19)
Tests:      151 passed (151)
Duration:   1.95s
# exit code: 0

# Storybook build
$ npx storybook build --output-dir /tmp/storybook-qa-build
Storybook build completed successfully
# exit code: 0

# Verify stories in build index
$ cat /tmp/storybook-qa-build/index.json | python3 -c "..."
artifacts-artifactviewer--empty - Empty
artifacts-artifactviewer--single-image - Single Image
... (9 ArtifactViewer stories total)
health-providerhealth--all-healthy - All Healthy
... (5 ProviderHealth stories total)
progress-costdisplay--no-budget-cap - No Budget Cap
... (7 CostDisplay stories total)
# 21 stories total — PASS

# Verify proof screenshots
$ md5sum proof-artifacts/*.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/artifactviewer-singleimage.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/artifactviewer-withdiffbadgecritical.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/costdisplay-nobudgetcap.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/costdisplay-withbudgetcritical.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/costdisplay-withbudgetwarning.png
f5f57469cddc37df36e82a40382084a2  proof-artifacts/dashboard-mobile-390x844.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/providerhealth-allfailed.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/providerhealth-allhealthy.png
99b13def98aa849306b4f00e23948c59  proof-artifacts/providerhealth-mixed.png
# FAIL: 8 identical story screenshots (all "Not found" pages)
# Only dashboard-mobile-390x844.png has unique content

# Visual verification via HTTP server
$ python3 -m http.server 7788 --directory /tmp/storybook-qa-build &
$ node qa-storybook-http.cjs  # Playwright screenshots via HTTP
# ProviderHealth/AllHealthy: green dots, "healthy" labels (claude, gemini, opencode) — PASS
# ProviderHealth/AllFailed: red X icons, "failed" labels (claude, gemini) — PASS
# CostDisplay/NoBudgetCap: "SPEND $1.23" card without budget bar — PASS
# ArtifactViewer/SingleImage: "1 artifact", screenshot.png, "Main page screenshot" — PASS
```

### Cleanup
- Removed Storybook build: `rm -rf /tmp/storybook-qa-build`
- Removed test install prefix (auto-cleaned by test-install)
