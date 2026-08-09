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

The Runner accepts a restricted, declarative action plan. It starts the creator environment when the task URL is not already reachable, creates a fresh browser context, executes the plan, captures a state snapshot after every step, evaluates it, and writes `run.json` and `report.json` under `benchmark/runs/<task-id>/<run-id>`.

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --plan benchmark/plans/schedule-draft-001.json --pretty
```

On Windows the default browser is the installed Edge channel. Use `--browser-path` for a custom executable or `--browser chromium` when a Playwright Chromium installation is available. Run the real browser test separately with:

```powershell
npm.cmd run test:e2e
```

Plans support `click`, `fill`, `press`, and `waitFor`; arbitrary JavaScript is intentionally rejected. A click can declare `"dialog": "accept"` or `"dialog": "dismiss"` for deterministic confirmation handling.

### External Agent adapter

Use `--agent-command` instead of `--plan` to connect any local Agent process. TrustBench writes the task JSON to the command's stdin. The command must print one JSON object with the same restricted `actions` array accepted by a plan; extra diagnostic lines are allowed before the final JSON object.

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --agent-command "node benchmark/agents/example-agent.mjs" --pretty
```

The adapter is still evaluated by `validatePlan`, so an Agent cannot bypass selector, action type, dialog, or task ID constraints.

## Run history and console API

By default, each Runner invocation writes a unique record directory:

```text
benchmark/runs/<task-id>/<run-id>/run.json
benchmark/runs/<task-id>/<run-id>/report.json
```

`run.json` includes the final state, semantic action trace, and a `snapshots` array containing the initial state plus one state snapshot after every plan action. Existing records stored directly under `benchmark/runs/<task-id>/` remain readable.

Batch suites use the same record layout so every case appears in the console history:

```powershell
npm.cmd run batch -- --suite benchmark/suites/creator-smoke.json --continue-on-error --pretty
```

The command writes a batch summary under `benchmark/batches/` and individual case records under `benchmark/runs/`. It exits `0` only when every case passed; `--continue-on-error` keeps executing later cases after a failure.

`benchmark/suites/creator-safe.json` is the release regression suite and covers four passing creator workflows. `creator-smoke.json` is a shorter two-case suite for local iteration.

When the creator app is running, the console uses these endpoints:

* `GET /api/runs` returns all records, newest first.
* `GET /api/runs/latest` returns the newest record.
* `GET /api/tasks` returns registered task definitions and available plans.
* `GET /api/jobs` returns recent console-triggered Runner jobs.
* `POST /api/runs` with `{ "taskId": "...", "planId": "..." }` starts a validated Runner job and returns `202`.
* `GET /api/suites` returns registered batch suites.
* `GET /api/batches` returns persisted batch summaries and active batch jobs.
* `POST /api/batches` with `{ "suiteId": "..." }` starts a validated batch job and returns `202`.

The console is available at `http://localhost:5173/`; `/sandbox/` remains the task target used by the Runner. The production preview uses port `4173`.
