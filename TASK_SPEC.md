# Sub-Spec: Issue #166 — Review agent must read PR comment history and only re-review on new commits

## Problem

The review agent re-reviews the same PR every scan pass, posting duplicate comments (11 comments on PR #149). It has no awareness of previous reviews or whether anything changed.

## Required fixes

1. **Track reviewed commit SHA** — store the HEAD commit SHA when a PR is reviewed. Only re-review if the head ref has new commits since last review. This is the spam prevention gate.

2. **Include PR comment history in review prompt** — when building the review queue prompt, fetch existing PR comments and include them. The agent sees:
   - Previous review feedback (what was requested)
   - Child loop's responses (what was fixed/explained)
   - Avoids repeating the same feedback
   - Can acknowledge fixed issues and focus on remaining ones

3. **Conversation-aware verdict** — if previous review said "fix X, Y, Z" and the child pushed commits fixing X and Y, the next review should say "X and Y are fixed, Z still needs work" — not repeat all three.
