# TrustBench

TrustBench is a benchmark, safety-control, and replay platform for computer-use agents.

![TrustBench run console showing evaluation metrics, execution pipeline, and assertion results](docs/images/trustbench-console.png)

Product case study and acceptance criteria: [TrustBench PRD](docs/PRD.md)

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
- Real OpenAI Agent integration with structured action plans
- Per-run and batch Token, estimated cost, and API latency metrics
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

Run a real OpenAI Agent:

```powershell
Copy-Item .env.example .env
# Add your OPENAI_API_KEY to .env, then start the console or run the CLI:
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --agent-command "node benchmark/agents/openai-agent.mjs" --pretty
```

The task center exposes the same OpenAI Agent option when the key is configured. `run.json` records the provider, model, response ID, prompt version, input/output/cached/reasoning Token counts, API latency, and estimated USD cost. Cost is an estimate based on a dated built-in price snapshot for the default model or the optional `OPENAI_*_COST_PER_1M` overrides in `.env`; it is not a billing statement.

Run the four-case real-model suite:

```powershell
npm.cmd run batch -- --suite benchmark/suites/creator-openai.json --continue-on-error --pretty
```

For a production-style local deployment:

```powershell
docker compose up --build
```

Open `http://localhost:4173/` after the container is ready. Run records are persisted through the compose volume under `benchmark/runs`.

See [benchmark/README.md](benchmark/README.md) for the evaluator contract, report semantics, run history layout, and Runner options.

## Status

Implemented: simulated creator environment, automatic evaluator, restricted end-to-end Runner, per-step replay snapshots, historical run records, batch suites, real OpenAI Agent integration, Token/cost/latency observability, task/job APIs, run comparison console, CI, and container deployment.

This is a complete local benchmark product. Hosted multi-tenant auth, remote Agent credential management, and distributed worker scheduling remain intentionally outside the local deployment scope.
