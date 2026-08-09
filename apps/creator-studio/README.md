# TrustBench Creator Studio

This Vite application serves two local TrustBench surfaces:

- `/` - task catalog, Runner jobs, run overview, trace replay, and real-run comparison
- `/sandbox/` - the isolated creator workspace used by browser benchmark tasks

The development and preview servers expose task, job, and run APIs. The console starts validated Runner jobs directly and refreshes `benchmark/runs` history automatically. It falls back to an embedded example when no local run exists.

## Development

```powershell
npm.cmd run dev
```

## Verification

```powershell
npm.cmd run build
npm.cmd run lint
```
