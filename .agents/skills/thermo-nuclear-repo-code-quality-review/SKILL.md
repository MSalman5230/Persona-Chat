---
name: thermo-nuclear-repo-code-quality-review
description: Run an extremely strict whole-repository maintainability review of existing code on main, master, or the current checkout. Use for a thermo-nuclear repo review, thermonuclear repository audit, whole codebase code quality review, existing code audit, deep maintainability review, architecture health review, or harsh repo-wide quality assessment.
---

# Thermo-Nuclear Repo Code Quality Review

Use this skill for an unusually strict review of the repository's existing implementation quality, maintainability, abstraction quality, and long-term codebase health.

This is a whole-repo review, not a branch-diff review. Review the current checkout as the product codebase. If the user specifically asks for `main` or `master`, confirm the current branch and do not switch branches without explicit approval.

Be ambitious about structure. Look for behavior-preserving ways to make the implementation dramatically simpler, smaller, more direct, and easier to reason about. Do not merely identify local cleanup opportunities.

## Review Workflow

1. Read repository instructions first, including `AGENTS.md`, project docs, package scripts, and any design or architecture guidance relevant to the files under review.
2. Map the codebase before judging it:
   - Use `rg --files` or `git ls-files` to understand tracked source areas.
   - Inspect package scripts, test setup, framework configuration, database/schema locations, and major app boundaries.
   - Identify generated, vendored, build, lock, and dependency files and exclude them from quality findings unless they directly expose a repo-health issue.
3. Find hotspots:
   - Large files and components, especially files over 1000 lines.
   - Busy modules with many unrelated responsibilities.
   - Repeated conditionals, mode flags, nullable state, and special-case branches.
   - Cast-heavy TypeScript, `any`, `unknown`, broad optionality, and unclear boundary contracts.
   - Duplicate helpers, bespoke utilities that overlap canonical utilities, and pass-through abstractions.
   - Business logic leaking into UI, API, database, shared helper, or configuration layers.
   - Sequential orchestration or partial updates that make correctness harder to reason about.
   - Test gaps around high-risk flows, persistence, auth, tools, agents, or state transitions.
4. Read enough surrounding code to prove each finding. Do not report a suspicion without a concrete file, line, behavior, and maintainability consequence.
5. Run focused static checks or tests only when they are already available and appropriate. Respect repository instructions about package managers, dev servers, and approvals.

## Review Questions

Ask these questions for each meaningful subsystem and hotspot:

- Is there a code-judo move that would make this dramatically simpler?
- Can the code be reframed so fewer concepts, branches, helpers, or layers are needed?
- Does this module have one clear owner and responsibility?
- Did a cohesive area become coupled, stateful, or hard to scan over time?
- Are repeated conditionals hiding a missing model, helper, dispatcher, state machine, or policy object?
- Is logic living in the canonical layer for the concept?
- Are file and component sizes still healthy?
- Is the implementation direct and legible, or does it rely on incidental control flow?
- Is each abstraction earning its keep, or is it mostly a wrapper?
- Do type boundaries state the real invariant, or do casts and optional fields obscure it?
- Does orchestration preserve consistency, or can state be left half-applied?
- Are tests exercising the risks the architecture creates?

## Standards

Apply these standards aggressively:

1. Be ambitious about structural simplification.
   - Prefer changes that delete categories of complexity rather than rearrange them.
   - Push for the structure that would feel inevitable after the cleanup.
   - Do not settle for "this could be cleaner" when a clear reframing exists.

2. Treat giant files as design pressure.
   - Treat files over 1000 lines as a strong smell by default.
   - Flag files that combine multiple ownership boundaries or workflows.
   - Prefer focused modules, helpers, subcomponents, services, or pure functions.
   - Waive only when the file has a strong structural reason and remains easy to navigate.

3. Do not allow spaghetti growth in existing code.
   - Be suspicious of ad-hoc conditionals, scattered special cases, and one-off branches inserted into unrelated flows.
   - Treat "weird if statements in random places" as a design problem, not a style nit.
   - Prefer dedicated abstractions, helpers, state machines, policy objects, or modules.

4. Prefer direct, boring, maintainable code.
   - Flag brittle, magical, or overly generic behavior.
   - Flag thin wrappers, identity abstractions, and pass-through helpers that add indirection without clarity.
   - Prefer explicit data shapes over implicit assumptions hidden behind generic mechanisms.

5. Push on type and boundary cleanliness.
   - Question unnecessary optionality, `unknown`, `any`, and casts.
   - Prefer explicit typed models or shared contracts.
   - Flag silent fallbacks that paper over unclear invariants.

6. Keep logic in the canonical layer.
   - Call out feature logic leaking into shared paths.
   - Prefer existing canonical utilities and helpers over bespoke near-duplicates.
   - Push code toward the package, service, or module that owns the concept.

7. Treat orchestration and update shape as maintainability concerns.
   - Flag independent work that is serialized without a reason when parallel structure is clearer.
   - Flag related updates that can leave state half-applied.
   - Avoid micro-optimization comments unless they also reduce brittleness or improve clarity.

## What To Flag Aggressively

Escalate findings when you see:

- A complicated implementation where a cleaner reframing could delete whole categories of complexity.
- Refactors or existing structures that move complexity around without reducing concepts.
- Files over 1000 lines that could be decomposed.
- Conditionals bolted onto unrelated code paths.
- One-off booleans, nullable modes, or flags that complicate control flow.
- Feature-specific logic leaking into general-purpose modules.
- Generic or magical handling that hides a simple structure.
- Thin wrappers or identity abstractions that do not simplify anything.
- Unnecessary casts, `any`, `unknown`, or optional params that muddy the real contract.
- Copy-pasted logic instead of shared helpers.
- Narrow edge-case handling in the middle of an already busy function.
- Bespoke helpers where a canonical utility already exists.
- Logic in the wrong layer, package, route, component, service, or schema module.
- Sequential async flow where obviously independent work could stay simpler in parallel.
- Partial-update logic that leaves persistence or runtime state less atomic than necessary.
- Test coverage that misses the risky behavior implied by the current structure.

## Preferred Remedies

When identifying a problem, prefer remedies like:

- Delete a whole layer of indirection rather than polish it.
- Reframe the state model so conditionals disappear.
- Move ownership so the feature becomes a natural extension of an existing abstraction.
- Turn special-case logic into a simpler default flow with fewer exceptions.
- Extract a helper, pure function, focused module, or component.
- Split a large file into smaller modules with clear ownership.
- Move feature-specific logic behind a dedicated abstraction.
- Replace condition chains with a typed model, dispatcher, or explicit state machine.
- Separate orchestration from business logic.
- Collapse duplicate branches into one clearer flow.
- Delete wrappers that do not clarify the API.
- Reuse the canonical helper instead of introducing a near-duplicate.
- Make type boundaries explicit so control flow gets simpler.
- Move logic to the package, module, or layer that already owns the concept.
- Parallelize independent work when it clarifies orchestration.
- Restructure related updates into a more atomic flow.
- Add focused tests around the risky boundary or workflow.

## Output Expectations

Use a code-review posture. Lead with findings, ordered by severity, and cite concrete files and lines. Keep summaries brief and secondary.

Prioritize findings in this order:

1. Structural code-quality regressions or existing architecture risks.
2. Missed opportunities for dramatic simplification.
3. Spaghetti and branching complexity.
4. Boundary, abstraction, and type-contract problems.
5. File-size and decomposition concerns.
6. Modularity and canonical-layer issues.
7. Test gaps tied to maintainability or correctness risk.
8. Legibility concerns.

Do not flood the review with low-value nits when larger structural issues exist. Prefer a smaller number of high-conviction findings over a long list of cosmetic comments.

For each finding include:

- Severity, file, and line reference.
- Why this harms maintainability, correctness reasoning, or future change.
- The cleaner structural direction or concrete remedy.
- Any validation or tests that would reduce risk.

If no major issues are found, say that clearly and mention residual risks or areas not fully inspected.

## Tone

Be direct, serious, and demanding about quality. Do not be rude, but do not soften major maintainability issues into mild suggestions.

Useful phrasing:

- `This file is past the point where local cleanup helps; can we decompose the ownership first?`
- `This adds another special-case branch into an already busy flow. Can we move this behind its own abstraction?`
- `This works, but it makes the surrounding code more tangled. Let's keep the behavior and simplify the structure.`
- `This feels like feature logic leaking into a shared path. Can we isolate it?`
- `This abstraction seems unnecessary. Can we keep the direct flow?`
- `Why does this need a cast or optional here? Can we make the boundary explicit instead?`
- `This looks like a bespoke helper for something the repo already owns elsewhere. Can we reuse the canonical path?`
- `There is a code-judo move here: reframe the model so these branches disappear.`
- `This moves complexity around, but it does not delete any of it. Can the model itself become simpler?`

## Approval Bar

Do not approve a repository health review merely because the code works.

The bar for a healthy repo is:

- No clear structural regression or entrenched architecture risk.
- No obvious missed opportunity to make a subsystem dramatically simpler.
- No unjustified giant files.
- No obvious spaghetti growth from special-case branching.
- No hacky or magical abstractions that make the code harder to reason about.
- No unnecessary wrapper, cast, optionality, or loosely typed contract obscuring the design.
- No clear architecture-boundary leak or avoidable canonical-helper duplication.
- No untested high-risk flows in areas where tests are feasible.

Treat these as presumptive blockers in a repo-health report:

- The repo preserves a lot of incidental complexity when there is a plausible simplification that would delete it.
- A file is over 1000 lines without a strong ownership reason.
- A core flow is tangled by ad-hoc branching.
- Feature checks are scattered across shared code.
- An unnecessary abstraction, wrapper, or cast-heavy contract makes the design more indirect.
- Existing helpers or ownership layers are duplicated instead of reused.
- Risky auth, persistence, tool, agent, or state-transition behavior lacks focused tests.
