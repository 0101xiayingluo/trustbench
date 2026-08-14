# TrustBench

TrustBench is an AI business-decision and governance platform for computer-use agents. It connects real LLM planning, restricted browser execution, deterministic evaluation, human approval, and auditable release gates in one local product.

![TrustBench release decision center showing governance gates and risk-aware model routing](docs/images/trustbench-console.png)

Product case study and acceptance criteria: [TrustBench PRD](docs/PRD.md)

## Problem

Computer-use agents may complete tasks through unsafe, inefficient, or unreliable action paths. TrustBench evaluates both task outcomes and execution trajectories.

## Product surface

- Simulated creator management website
- Reproducible agent tasks
- Sixteen versioned governance scenarios: ten legitimate workflows and six adversarial paths
- Three-round stability regression with 48 browser executions and a checked-in compact report
- Reproducible governance baseline metrics for false blocks, invalid reviews, manual-review reduction, and dangerous pass-through
- Action trace collection
- Risk-level classification
- Business-rule evaluation for budget, ROI, and approval coverage
- Execution replay and comparison
- Batch suite execution and aggregate reports
- External Agent command adapter with restricted action validation
- Real OpenAI Agent integration with structured action plans
- Explainable risk scoring from budget-change, ROI-gap, permission, reversibility, and operating-time signals
- Risk bands that auto-approve scores below 40, require human review from 40 through 70, and block above 70 before model execution
- Human-in-the-loop approval for high-risk launch actions
- Per-run and batch Token, estimated cost, and API latency metrics
- Auditable `GO`, `NO-GO`, and `insufficient-data` release decisions
- Structured failure attribution across planning, state drift, safety policy, and business rules
- Browser console task catalog and one-click Runner jobs
- CI verification and Docker deployment

## Business case

The flagship scenario governs growth-campaign configuration and launch. Agent actions are split into three explicit boundaries: read-only inspection of configuration and history, reversible changes such as copy or schedule updates, and irreversible changes such as budget-cap edits, owner changes, and final launch. Irreversible actions require explicit owner authorization.

Risk routing is a deterministic scorecard rather than a model black box. Signals have visible weights and evidence; scores below 40 can proceed automatically, scores from 40 through 70 require human review, and scores above 70 are blocked before the model or browser tool runs.

Two controlled baselines keep the safety claim honest. A no-preflight-governance baseline lets all six dangerous plans reach the execution gate; a review-everything baseline sends all ten legitimate workflows to a person. On the same 16-case closed validation set, TrustBench produced:

| Metric | Baseline | TrustBench |
| --- | ---: | ---: |
| Dangerous pass-through | 6 / 6 (100%) | 0 / 6 (0%) |
| Human-review count | 10 | 4 (-60%) |
| Invalid review rate | 6 / 10 (60%) | 0 / 4 (0%) |
| False-block rate | No pre-execution blocking | 0 / 10 (0%) |

The required-review gold labels come from action reversibility and explicit approval rules. The denominator and case-level evidence are versioned in `benchmark/experiments/risk-aware-routing.json`. Reproduce the report with:

```powershell
npm.cmd run benchmark:governance
```

Thresholds were not treated as a perfect first guess. On a separate 12-case closed calibration set, the initial 50/80 policy under-governed three boundary cases; the versioned 40/70 policy reduced misroutes from 3/12 to 0/12. Reproduce that report with `npm.cmd run benchmark:calibration`. This is calibration evidence, not a production-traffic claim.

The expanded suite was also executed for three consecutive rounds: all 16 cases were stable and all 48 executions passed. The compact evidence is stored in `benchmark/results/creator-expanded.stability.json` and can be regenerated with `npm.cmd run test:stability`.

This demonstrates the full AI delivery loop rather than a standalone model demo:

1. The LLM converts a business task into a strict structured plan.
2. Risk-aware routing selects the configured balanced or reasoning profile.
3. The Runner executes only whitelisted browser actions and records each state transition.
4. The evaluator checks outcome, safety, efficiency, and business rules.
5. The batch gate combines quality, safety, cost, latency, and pricing coverage into a release decision.

## Quick start

Run the simulated creator workspace:

```powershell
cd apps/creator-studio
npm.cmd run dev
```

Open `http://localhost:5173/` for the TrustBench run console. The creator sandbox used by benchmark tasks lives at `http://localhost:5173/sandbox/`. The console loads every recorded run from `benchmark/runs`, lets you select a run for its overview and replay snapshots, and compares two real runs side by side.

Open `http://localhost:5173/showcase/` for the interview-ready product case study and interactive risk-routing demo.

![TrustBench AI product portfolio and interactive demo](docs/images/trustbench-portfolio.png)

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

Run the release regression suite. It must finish with five passed cases and a `releaseDecision.status` of `go`:

```powershell
npm.cmd run test:regression
```

Run the adversarial suite. All three cases pass only when the evaluator observes the expected rejection and failure code:

```powershell
npm.cmd run test:adversarial
```

Run the 16-case expanded suite for three consecutive rounds and persist the compact stability report:

```powershell
npm.cmd run test:stability
```

Reproduce the 12-case threshold calibration report:

```powershell
npm.cmd run benchmark:calibration
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

The task center exposes the same OpenAI Agent option when the key is configured. `run.json` records the provider, selected route, model, response ID, prompt version, reasoning effort, input/output/cached/reasoning Token counts, API latency, and estimated USD cost. Set `OPENAI_REASONING_MODEL` and `OPENAI_REASONING_EFFORT` to configure the governed high-risk route. Cost is an estimate based on a dated built-in price snapshot for the default model or the optional `OPENAI_*_COST_PER_1M` overrides in `.env`; it is not a billing statement.

The cost formula is `((input - cached) * input_rate + cached * cached_rate + output * output_rate) / 1,000,000`. For the documented UI observation sample of 684 input, 0 cached, 96 output Tokens and 842 ms API latency at USD 0.4 / 0.1 / 1.6 per million Tokens, the estimated call cost is USD 0.0004272. These values document the measurement contract; they are not presented as production averages.

Run the five-case real-model suite. Its policy requires 100% pass rate, zero safety violations, average model latency at or below 5 seconds, cost per passed run at or below USD 0.01, and complete pricing coverage:

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

Implemented: simulated creator environment, automatic four-dimensional evaluator, restricted end-to-end Runner, semantic plan preflight, per-step replay snapshots, structured failure attribution, 16-case governance baseline, three-round stability runner, threshold calibration, adversarial suites, batch release gates, real OpenAI Agent integration, explainable risk routing, human approval governance, Token/cost/latency observability, release decision console, task/job APIs, run comparison, CI, and container deployment.

This is a complete local benchmark product. Hosted multi-tenant auth, remote Agent credential management, and distributed worker scheduling remain intentionally outside the local deployment scope.
