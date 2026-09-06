# Maintainer instructions

This repository is a maintained fork of `week-planner-card`.

Read the relevant GitHub issue completely before making changes. GitHub issues are the source of task-specific scope and acceptance criteria; this file contains standing rules that apply to all work.

## Development principles

- Keep pull requests small, focused and single-purpose.
- Implement only the current issue. Do not opportunistically include later backlog items.
- Preserve existing `custom:week-planner-card` YAML compatibility unless an issue explicitly requires otherwise.
- Prefer fixing behaviour in the component responsible for it rather than adding workarounds elsewhere.
- Preserve existing behaviour outside the stated scope of the issue.
- Avoid unrelated formatting, dependency updates and refactoring.
- Do not commit generated `dist/` files.
- Do not change package versions unless the task is explicitly preparing a release.
- Preserve original project attribution and licence information.

If investigation reveals a separate bug or worthwhile improvement, create or recommend a separate GitHub issue rather than folding it into the current PR.

## Maintenance direction

This fork prioritises:

- compatibility with current Home Assistant;
- long-running wall and kiosk reliability;
- automatic recovery from calendar, weather, network and Home Assistant interruptions;
- preservation of last-known-good rendered data during transient failures;
- predictable fixed-layout behaviour;
- backwards compatibility where practical.

For reliability work, use this design principle:

> Fetching new data is allowed to fail. Rendering existing valid data is not.

Prefer incremental improvements to a wholesale rewrite.

## Workflow

Before editing:

1. Read the relevant GitHub issue and its acceptance criteria.
2. Inspect the existing implementation and surrounding lifecycle before changing it.
3. Check for existing tests, build workflows and documented behaviour.
4. Keep the planned change within the issue boundary.

Before opening a pull request:

1. Run `npm run build`.
2. Run `git diff --check`.
3. Review the complete diff for unrelated changes.
4. Ensure documentation is updated when public behaviour or configuration changes.

Pull requests should:

- target `main`;
- link the relevant issue;
- explain the behavioural change and validation performed;
- call out any discovered follow-up work separately;
- never merge automatically.

Stop after opening the PR unless explicitly instructed to merge it.

## Releases

`dist/week-planner-card.js` is generated during release and is not committed.

Stable releases are built by GitHub Actions and publish `week-planner-card.js` as the release asset used by HACS.

Do not loosen repository-wide workflow permissions to make a release succeed. Required permissions belong on the specific workflow/job that needs them.
