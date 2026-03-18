# Project TODO

## Current Phase: Gap remediation and project hygiene

### In Progress

### Up Next
- [ ] Track `docs/` directory — commit DESIGN_BRIEF.md so dashboard spec is version-controlled (P1 — foundational, untracked spec is at risk of loss)
- [ ] Decide on `aloop/` — either add dashboard source to repo or remove dist artifacts from working tree; compiled-only output without source is not maintainable (P1 — architectural decision needed from user)
- [ ] Add Copilot `/ralph-steer` prompt — Claude has `/ralph:steer` but Copilot prompts only have setup/start/status/stop, missing steer (P2 — feature parity)
- [ ] Add per-phase reasoning effort to loop scripts — implement `OPENCODE_VARIANT` / per-phase env vars in `loop.sh` and `loop.ps1` per memory spec (P2 — enhances build efficiency)
- [ ] GitHub Enterprise URL support — audit `gh` CLI calls and any hardcoded `github.com` references; ensure custom hostnames work throughout (P2 — enterprise requirement)
- [ ] Create Codex-specific command files — installer copies Claude commands for Codex harness but Codex may need provider-specific adjustments (P3 — provider parity)
- [ ] Gemini skill/command files — Gemini is listed as a supported provider but has no skill or command files; only supported via loop script stdin piping (P3 — provider parity)
- [ ] Domain skill discovery — integrate tessl/skills.sh into setup (auto-detect stack, install into `.agents/skills/` + `.claude/skills/`) and create `PROMPT_orch_skill_scout.md` for orchestrator per-task autonomous skill discovery (P2 — spec complete, needs implementation)
- [ ] Orchestrator implementation — multi-issue task decomposition with pluggable adapters (GitHub first, local file-based planned), resumability after kill/restart, per-task sandbox policy (P3 — large feature, requires design first)
- [ ] Setup dual-mode support — `/ralph:setup` should detect task scope and recommend loop vs orchestrator mode (P3 — depends on orchestrator existing)
- [ ] Review default models in config.yml — opus, gpt-5.3-codex, gemini-3.1-pro-preview last set 2026-02-21; verify these are still current (P3 — maintenance)

### Completed
