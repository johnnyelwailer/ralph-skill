# Operational Learnings

Guidance on using AGENTS.md to capture and evolve Ralph's knowledge.

<what_is_agents_md>
## What is AGENTS.md?

AGENTS.md (or CLAUDE.md, GEMINI.md, etc.) is a file that contains project-specific learnings that Ralph needs to know. It's loaded every loop iteration alongside the prompt.

**Purpose:**
- Capture patterns Ralph should follow
- Document project-specific constraints
- Record discovered learnings from failures
- Provide build/test commands
- Share context that prompts don't include

**Key insight:** AGENTS.md evolves through observation. Start minimal, add only what's needed.
</what_is_agents_md>

<start_minimal>
## Start Minimal

**Initial AGENTS.md:**
```markdown
# Operational Learnings

## Build/Test Commands

[To be filled as needed]

## Known Patterns

[To be filled as needed]

## Constraints

[To be filled as needed]
```

**Don't:**
- Pre-populate with guessed patterns
- Copy from other projects
- Add rules you haven't observed need for

**Do:**
- Start empty or near-empty
- Add entries when Ralph fails repeatedly
- Remove entries when no longer relevant
</start_minimal>

<when_to_add_entries>
## When to Add Entries

Add to AGENTS.md when you observe:

1. **Repeated Mistakes** — Same mistake 2-3 times, then add guidance
2. **Project-Specific Commands** — Tests require specific setup
3. **Discovered Constraints** — Libraries that aren't available
4. **Architectural Decisions** — Where features should live
5. **Gotchas and Edge Cases** — Non-obvious behaviors
</when_to_add_entries>

<when_not_to_add_entries>
## When NOT to Add Entries

1. **One-Off Mistakes** — Wait for pattern before adding
2. **General Best Practices** — Claude already knows "write clean code"
3. **Things in Specs** — Don't duplicate spec content
4. **Temporary Workarounds** — Fix the root cause instead
5. **Overly Specific Instructions** — That's a task, not a learning
</when_not_to_add_entries>

<evolution_over_time>
## Evolution Over Time

### Phase 1 (Days 1-3): Mostly empty, watching for patterns
### Phase 2 (Week 1): First entries — build commands, constraints (20-50 lines)
### Phase 3 (Weeks 2-4): Known patterns documented (50-150 lines)
### Phase 4 (Month 2+): Well-documented, entries added rarely (100-300 lines)
### Phase 5 (Maintenance): Changes infrequently, occasional cleanup
</evolution_over_time>

<antipatterns>
## Anti-Patterns

1. **The Novel** — 1000+ lines of docs. Keep it focused.
2. **The Rule Book** — "Thou shalt not" lists. Keep it practical.
3. **The Tutorial** — Don't teach programming. Focus on project specifics.
4. **The Archive** — Don't keep historical notes. Document current state only.
5. **The Spec Duplicate** — Reference specs, don't duplicate them.
6. **The Wishlist** — Document what exists, not what should be.
</antipatterns>
