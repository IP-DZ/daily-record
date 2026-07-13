# AGENTS.md

## Project Uses Anvil

This project uses the Anvil coding workflow plugin.

## Workflow Selection

- Simple, low-risk work uses the lightweight path.
- Complex, unclear, cross-module, or user-requested full workflow work uses `req -> plan -> code -> review -> compound`.
- `/anvil:plan` owns architecture design and executable task decomposition.
- `/anvil:code` consumes the confirmed plan document directly.
- `/anvil:task` is compatibility-only; do not create `.ai/anvil/tasks/*`, JSON state files, parsers, or a second task-state system.

## Anvil Artifacts

- `docs/anvil/brainstorms/`: requirements alignment and raw product/technical context.
- `docs/anvil/plans/`: architecture plans and executable task DAGs.
- `.ai/anvil/reviews/`: review decisions, accepted write sets, findings, and regression lenses.
- `docs/solutions/`: long-term reusable knowledge wiki for future plan/code/review retrieval.

## Harness Contract

### One Source Of Truth

- Current full-flow work is controlled by one Anvil stage artifact at a time.
- During requirements alignment, the active source of truth is the current `docs/anvil/brainstorms/*` document.
- During implementation, the active source of truth is the confirmed or active `docs/anvil/plans/*` document.
- Do not create parallel task JSON, duplicate progress files, unlinked wikis, or a second state system beside the active Anvil artifact.
- Feature, progress, and handoff information are still required: feature knowledge belongs in durable docs, progress belongs in the active Anvil artifact, and handoff notes must be folded back into the active artifact or final resume point.

### Readiness

- Use this project's existing build, test, lint, smoke, or manual verification path when one exists.
- If the readiness path is unknown, `/anvil:plan` must define the minimal validation path before code execution.
- Missing readiness is not a reason to invent broad checks; record the gap and choose the smallest meaningful proof for the current risk.

### Evidence

- Do not mark work complete without concrete verification evidence.
- Valid evidence includes command results, focused manual checks, device evidence, review findings, or an explicit blocker with owner and next step.
- Evidence belongs in the current stage artifact, review report, or `docs/solutions/*` link when the lesson is durable.

### Resume Point

- A paused or completed full-flow task must leave a clear resume point.
- The resume point should state current status, completed work, blockers, validation evidence, and the next action.
- Prefer updating the active Anvil artifact over relying on chat history.

New Anvil stage artifacts should include:

- `Status`: `draft`, `confirmed`, `active`, `executed`, `superseded`, `abandoned`, or `legacy`
- `Workflow Stage`: `req`, `plan`, `code`, `review`, `debug`, or `compound`
- `Source Of Truth Until`: the condition that ends source-of-truth status
- `Compounded Knowledge`: `not yet compounded`, `not applicable`, or links under `docs/solutions/`

Only `confirmed` or `active` plans are executable by `/anvil:code`. Plans without execution metadata require explicit user confirmation before execution.

## Local Project Rules

- Product language and project documentation default to Chinese.
- The first release targets adults using mainland China networks.
- Nutrition results and meal-photo estimates must be presented as editable estimates, not medical advice.
- Never expose cloud or AI secret keys in browser code.
- Every user-owned table and storage object must enforce per-user access control.
- Do not begin implementation until the current requirements artifact is confirmed and an implementation plan is approved.
