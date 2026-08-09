# TrustBench Creator Studio

This Vite application serves two local TrustBench surfaces:

- `/` - run overview, trace replay, and safe/risky path comparison
- `/sandbox/` - the isolated creator workspace used by browser benchmark tasks

The development and preview servers expose `/api/runs/latest`, which reads the most recently modified run artifacts from `benchmark/runs`. The console falls back to an embedded example when no local run exists.

## Development

```powershell
npm.cmd run dev
```

## Verification

```powershell
npm.cmd run build
npm.cmd run lint
```
