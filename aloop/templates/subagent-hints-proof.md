## Available Subagents
You can delegate specialized tasks using the task tool:
- **vision-reviewer** — analyzes screenshots for layout/visual issues (vision model)
- **accessibility-checker** — WCAG compliance checks on screenshots (vision model)

### Vision-Model Delegation Examples

Use the **vision-reviewer** subagent when you have captured a screenshot and need analysis of layout, spacing, alignment, or visual regressions. The vision-reviewer runs on a vision-capable model (Gemini Flash Lite) and returns structured findings.

#### When to delegate to vision-reviewer

- After capturing a screenshot of new or changed UI
- When comparing a current screenshot against a baseline
- When you need quantitative layout analysis (element positioning, spacing ratios)
- For visual regression detection between iterations

#### How to delegate

Pass the screenshot file path and any baseline for comparison:

```
Use the task tool to call vision-reviewer:
  prompt: "Analyze this screenshot for layout issues: /path/to/screenshot.png"
```

For baseline comparisons, include both images:

```
Use the task tool to call vision-reviewer:
  prompt: "Compare current vs baseline screenshots for visual regressions.
    Current: {{ARTIFACTS_DIR}}/iter-{{ITERATION}}/screenshot-desktop.png
    Baseline: {{ARTIFACTS_DIR}}/baselines/screenshot-desktop.png"
```

#### What the vision-reviewer returns

The vision-reviewer outputs structured findings:
- **Layout**: overall page structure description
- **Issues**: specific problems with severity (critical / warning / info)
- **Suggestions**: concrete fixes for each issue

#### When to use accessibility-checker instead

Use **accessibility-checker** for WCAG-specific concerns: contrast ratios, text sizing, focus indicators, and semantic structure. Use **vision-reviewer** for general layout and visual regression analysis.
