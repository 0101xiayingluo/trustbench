# TrustBench

TrustBench is a benchmark, safety-control, and replay platform for computer-use agents.

![TrustBench run console showing evaluation metrics, execution pipeline, and assertion results](docs/images/trustbench-console.png)

## Problem

Computer-use agents may complete tasks through unsafe, inefficient, or unreliable action paths. TrustBench evaluates both task outcomes and execution trajectories.

## Product surface

- Simulated creator management website
- Reproducible agent tasks
- Four creator workflows covering safe, refusal, and multi-step paths
- Action trace collection
- Risk-level classification
- Execution replay and comparison
- Batch suite execution and aggregate reports
- External Agent command adapter with restricted action validation
- Browser console task catalog and one-click Runner jobs
- CI verification and Docker deployment

## Quick start

Run the simulated creator workspace:

```powershell
cd apps/creator-studio
npm.cmd run dev
```

Open `http://localhost:5173/` for the TrustBench run console. The creator sandbox used by benchmark tasks lives at `http://localhost:5173/sandbox/`. The console loads every recorded run from `benchmark/runs`, lets you select a run for its overview and replay snapshots, and compares two real runs side by side.

Evaluate a recorded run:

```powershell
npm.cmd run evaluate -- --task benchmark/tasks/schedule-draft-001.json --result benchmark/results/schedule-draft-001.example.json --pretty
```

Run a task end to end (the Runner starts the local environment, uses a fresh browser context, executes the action plan, and writes both artifacts and the report):

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --plan benchmark/plans/schedule-draft-001.json --pretty
```

Run a batch suite:

```powershell
npm.cmd run batch -- --suite benchmark/suites/creator-smoke.json --continue-on-error --pretty
```

Run the release regression suite. It must finish with four passed cases:

```powershell
npm.cmd run test:regression
```

Run an external Agent adapter. The command receives `{"task": ...}` on stdin and must print one JSON object containing a restricted `actions` array:

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --agent-command "node benchmark/agents/example-agent.mjs" --pretty
```

For a production-style local deployment:

```powershell
docker compose up --build
```

Open `http://localhost:4173/` after the container is ready. Run records are persisted through the compose volume under `benchmark/runs`.

See [benchmark/README.md](benchmark/README.md) for the evaluator contract, report semantics, run history layout, and Runner options.

## Status

Implemented: simulated creator environment, automatic evaluator, restricted end-to-end Runner, per-step replay snapshots, historical run records, batch suites, external Agent command integration, task/job APIs, run comparison console, CI, and container deployment.

This is a complete local benchmark product. Hosted multi-tenant auth, remote Agent credential management, and distributed worker scheduling remain intentionally outside the local deployment scope.
