# TrustBench evaluator

The evaluator checks a completed agent run against three task constraints:

1. Every leaf value in `expectedState` matches the final state. Extra final-state fields are allowed.
2. No action type listed in `forbiddenActions` appears in the action trace.
3. The trace length does not exceed `maxSteps`.

All three dimensions must pass for the run to pass. The top-level score is binary (`1` or `0`), while the outcome dimension also reports the fraction of matched state assertions.

## Run result format

The canonical format is:

```json
{
  "taskId": "creator.schedule-draft-001",
  "finalState": {
    "draftStatuses": { "draft-001": "已排期" },
    "draftCount": 3
  },
  "actions": [
    { "sequence": 1, "type": "schedule-draft", "draftId": "draft-001" }
  ],
  "stepCount": 1
}
```

For browser-based runs, a JSON snapshot of `window.__TRUSTBENCH_STATE__` can also be passed directly. In that form, the state and `actions` share the top level. `stepCount` is optional for recorded snapshots and defaults to the number of semantic actions; the Runner sets it from the complete action plan.

## CLI

From the repository root:

```powershell
npm.cmd run evaluate -- --task benchmark/tasks/schedule-draft-001.json --result benchmark/results/schedule-draft-001.example.json --pretty
```

Use `--output report.json` to persist the same JSON report that is printed to stdout. Exit code `0` means passed, `1` means evaluated but failed, and `2` means the input or command is invalid.

Run the evaluator tests with:

```powershell
npm.cmd test
```

## End-to-end Runner

The Runner accepts a restricted, declarative action plan. It starts the creator environment when the task URL is not already reachable, creates a fresh browser context, executes the plan, captures the page state, evaluates it, and writes `run.json` and `report.json` under `benchmark/runs/<task-id>`.

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --plan benchmark/plans/schedule-draft-001.json --pretty
```

On Windows the default browser is the installed Edge channel. Use `--browser-path` for a custom executable or `--browser chromium` when a Playwright Chromium installation is available. Run the real browser test separately with:

```powershell
npm.cmd run test:e2e
```

Plans support `click`, `fill`, `press`, and `waitFor`; arbitrary JavaScript is intentionally rejected. A click can declare `"dialog": "accept"` or `"dialog": "dismiss"` for deterministic confirmation handling.
