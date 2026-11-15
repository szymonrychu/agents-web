Task 3 DONE. Schedules, ScheduleRuns, Tasks on ResponsiveTable. Clipped row cause: flex-shrink of overflow-x TableContainer (min-height 0) in column flex page root; not reproducible in jsdom, fixed by Task 2 flexShrink 0. Full suite, lint, tsc green.

## Fix round 1

- Important 1: Schedules Timezone column is now role 'meta' (zone visible in each card). Test at 375px.
- Minor 1: new phone test covers Run now and Edit via the actions menu.
- Minor 2: cron monospace now applied in the render (works in cards and table); duplicated key nowrap column sx removed.
- Minor 3: Tasks assignee, labels (empty) and project render '-' when empty; test at 375px.
- Minor 4: PageHeader only takes onBack (no link target) and src/layout is off limits, so Tasks Back stays navigate('/').
- Verification: schedules + tasks tests 109/109; lint clean. Full suite fails only in src/specs/PlanTab and StepEditor tests, and tsc -b reports only src/specs/SpecsPage.tsx unused TOKENS: all in another implementer's concurrent WIP, not touched here.
