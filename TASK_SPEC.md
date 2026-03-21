# Sub-Spec: Issue #164 — Orchestrator fills /tmp disk with V8 code cache — need NODE_COMPILE_CACHE cleanup

## Problem

Running the orchestrator with multiple child loops fills /tmp with V8 code cache files (.da*.so). Each Node.js process creates ~4.4MB of cache. With 7+ children + orchestrator + monitors, 2760 files accumulated = 12GB, filling the tmpfs and crashing everything.

## Fix

1. Set NODE_COMPILE_CACHE to a bounded location or disable it for child processes
2. Clean V8 cache files periodically (process-requests could do this)
3. Or set ulimits / tmpfs quotas for child processes
4. The orchestrator should monitor disk space and pause dispatch when low
