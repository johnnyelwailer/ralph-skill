# MiroFish Incubation Recipe Spike

> Status: proposal spike. Checked 2026-05-02.
> Source: https://github.com/666ghj/MiroFish

## Question

Should aloop support a MiroFish-style multi-agent prediction sandbox as an optional incubation recipe?

## Recommendation

Yes, but only as an opt-in incubation recipe or external runtime extension. It should not become a core daemon subsystem, default install, tracker workflow, or business-operations feature.

The useful product boundary is:

```text
incubation item
  -> source synthesis / monitor tick gathers evidence
  -> optional scenario simulation recipe explores concrete hypotheses
  -> simulation report and limitations are stored as artifacts
  -> synthesis proposal recommends setup, spec change, epic, monitor, decision record, or discard
```

This keeps the feature inside incubation's existing mandate: mature vague or early ideas into evidence-backed proposals before implementation work starts.

## Why It Fits

MiroFish describes itself as a swarm-intelligence prediction engine that extracts seed information from real-world materials, builds a parallel simulated world, runs multi-agent interaction, and produces a prediction report plus an interactive environment.

That maps most closely to late incubation, after an idea is concrete enough to name:

- the decision or hypothesis being tested
- the seed materials and source policy
- the scenario variables
- a budget and stopping point
- the expected promotion choices

It is less useful for raw capture, generic browsing, or implementation execution.

## Non-Goals

This recipe must not turn aloop into:

- a generic market-research SaaS
- a CRM or outreach automation system
- a business operator with ambient authority
- a source of authoritative forecasts
- another implementation runner

Simulation output is scenario evidence, not truth. The final synthesis must preserve uncertainty, source provenance, and limitations.

## Recipe Shape

```ts
type ScenarioSimulationRecipe = {
  _v: 1;
  id: "mirofish_scenario_simulation";
  incubation_item_id: string;
  question: string;
  seed_material_refs: string[];
  scenario_variables: Array<{
    name: string;
    description: string;
    allowed_values?: string[];
  }>;
  source_plan: ResearchSourcePlan;
  runtime: {
    kind: "external_extension";
    manifest_ref: string;
    isolation: "docker" | "sandbox" | "managed_job";
  };
  budget: {
    max_cost_usd?: number;
    max_duration_seconds?: number;
    max_rounds?: number;
  };
  output_policy: {
    require_limitations: true;
    require_source_records: true;
    promotion_targets: Array<
      "setup_candidate" | "spec_change" | "epic" | "decision_record" | "discard"
    >;
  };
};
```

The concrete TypeScript shape can be deferred until incubation recipe manifests exist. The important boundary is that the daemon owns the item, run, artifacts, source records, budget, and proposal state.

## Runtime Boundary

The recipe should run through the same supervised runtime extension model used by source connectors and deterministic exec steps:

- checked-in manifest declares command, runtime, environment allow-list, timeout, network/auth capabilities, and output schema
- daemon creates the run and enforces scheduler permits and budgets
- extension receives only normalized source artifacts and explicit scenario inputs
- extension returns structured report metadata plus artifact files
- daemon records events, source records, limitations, cost, and output artifacts

The extension must not import daemon internals or receive broad shell authority.

## Outputs

Minimum useful outputs:

- scenario report artifact
- structured assumptions list
- structured limitations list
- source records for seed materials and external inputs
- simulation configuration snapshot
- cost and duration
- proposal candidates

Optional outputs:

- generated graph/world artifact
- agent/persona summaries
- per-round event trace
- comparison table across scenario variables
- monitor suggestion for continued tracking

## Policy

Default policy:

- opt-in only
- disabled in default install
- no repo, tracker, spec, or session mutation
- no outbound contact or public posting
- no scraping beyond configured source connectors
- no blending private project context with public sources without explicit provenance
- no forecast presented without limitations
- license warning shown before enabling third-party code

MiroFish is listed as AGPL-3.0 on GitHub. Aloop should avoid vendoring or shipping it by default unless the distribution implications are deliberately accepted.

## Promotion Flow

```text
captured idea
  -> clarifying
  -> source_synthesis
  -> synthesized hypothesis
  -> optional mirofish_scenario_simulation
  -> simulation artifact + limitations
  -> proposal
  -> human or policy-authorized apply
```

Good promotion outcomes:

- create setup run for a product candidate
- create spec-change proposal for an existing project
- create epic for validated implementation work
- create monitor when evidence is promising but immature
- create decision record documenting why not to proceed

Bad promotion outcomes:

- automatically start implementation because a simulation looked positive
- create outreach campaigns
- mutate business systems
- treat simulated public opinion or market response as measured demand

## Open Questions

- Should incubation recipes be represented as first-class daemon objects or as a constrained subtype of `ResearchRun`?
- Should scenario simulation be a new `ResearchRunMode` or remain an extension-specific recipe under `source_synthesis`?
- What is the smallest artifact schema that lets the dashboard compare simulation outputs across recipes?
- Is a local Docker-only recipe enough for v1, or should hosted managed-job execution be required before this is useful?
- What license and security review is required before documenting a third-party recipe as officially supported?

## Decision

Keep this out of core for now. Revisit after incubation research runs, source records, artifacts, proposals, and runtime extension manifests are implemented.

The likely first implementation should be a documentation-backed optional recipe that proves the boundary, not a dependency or shipped integration.
