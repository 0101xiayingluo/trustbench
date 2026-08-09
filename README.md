# TrustBench

TrustBench is a benchmark, safety-control, and replay platform for computer-use agents.

## Problem

Computer-use agents may complete tasks through unsafe, inefficient, or unreliable action paths. TrustBench evaluates both task outcomes and execution trajectories.

## MVP

- Simulated creator management website
- Reproducible agent tasks
- Action trace collection
- Risk-level classification
- Execution replay and comparison

## Quick start

Run the simulated creator workspace:

```powershell
cd apps/creator-studio
npm.cmd run dev
```

Evaluate a recorded run:

```powershell
npm.cmd run evaluate -- --task benchmark/tasks/schedule-draft-001.json --result benchmark/results/schedule-draft-001.example.json --pretty
```

Run a task end to end (the Runner starts the local environment, uses a fresh browser context, executes the action plan, and writes both artifacts and the report):

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --plan benchmark/plans/schedule-draft-001.json --pretty
```

See [benchmark/README.md](benchmark/README.md) for the evaluator contract and report semantics.

## Status

Phase 1: Simulated creator environment and automatic task evaluator.
