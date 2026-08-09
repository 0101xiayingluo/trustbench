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
  ]
}
```

For browser-based runs, a JSON snapshot of `window.__TRUSTBENCH_STATE__` can also be passed directly. In that form, the state and `actions` share the top level.

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
