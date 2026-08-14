import { defineConfig, loadEnv } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const benchmarkRuns = fileURLToPath(new URL('../../benchmark/runs/', import.meta.url))
const benchmarkTasks = fileURLToPath(new URL('../../benchmark/tasks/', import.meta.url))
const benchmarkPlans = fileURLToPath(new URL('../../benchmark/plans/', import.meta.url))
const benchmarkSuites = fileURLToPath(new URL('../../benchmark/suites/', import.meta.url))
const benchmarkBatches = fileURLToPath(new URL('../../benchmark/batches/', import.meta.url))
const benchmarkExperiments = fileURLToPath(new URL('../../benchmark/experiments/', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const runnerCli = resolve(repositoryRoot, 'benchmark/runner/cli.mjs')
const batchCli = resolve(repositoryRoot, 'benchmark/runner/batch.cli.mjs')
const openaiAgentCli = resolve(repositoryRoot, 'benchmark/agents/openai-agent.mjs')

type TaskDescriptor = {
  id: string
  version: number | null
  instruction: string
  riskLevel: string | null
  maxSteps: number
  plans: Array<{ id: string; label: string; unsafe: boolean }>
  filePath: string
}

type Job = {
  id: string
  taskId: string
  planId: string
  status: 'running' | 'passed' | 'failed' | 'error'
  startedAt: string
  completedAt?: string
  exitCode?: number | null
  message?: string
  report?: unknown
  artifacts?: { run: string; report: string }
}

type SuiteDescriptor = {
  id: string
  description: string
  caseCount: number
  requiresProvider?: 'openai'
  filePath: string
}

type BatchSummary = {
  suiteId: string
  startedAt: string
  completedAt: string
  total: number
  completed: number
  passed: number
  failed: number
  complete: boolean
  releaseDecision?: unknown
  artifacts: { directory: string }
}

type BatchJob = {
  id: string
  suiteId: string
  status: 'running' | 'passed' | 'failed' | 'error'
  startedAt: string
  completedAt?: string
  exitCode?: number | null
  message?: string
  summary?: BatchSummary
}

const jobs = new Map<string, Job>()
const batchJobs = new Map<string, BatchJob>()
const activeProcesses = new Set<ChildProcess>()

async function readableRecords<T>(directories: string[], readRecord: (directory: string) => Promise<T>): Promise<T[]> {
  const results = await Promise.allSettled(directories.map(readRecord))
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
}

async function runDirectories(root: string, depth = 0): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const hasArtifacts = entries.some((entry) => entry.isFile() && entry.name === 'run.json') &&
    entries.some((entry) => entry.isFile() && entry.name === 'report.json')
  if (depth >= 2) {
    return hasArtifacts ? [root] : []
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => runDirectories(resolve(root, entry.name), depth + 1)),
  )
  return [...(hasArtifacts ? [root] : []), ...nested.flat()]
}

async function allRuns() {
  let directories: string[]
  try {
    directories = await runDirectories(benchmarkRuns)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const records = await readableRecords(
    directories,
    async (directory) => {
      const [run, report, metadata] = await Promise.all([
        readFile(resolve(directory, 'run.json'), 'utf8'),
        readFile(resolve(directory, 'report.json'), 'utf8'),
        stat(resolve(directory, 'report.json')),
      ])
      return {
        id: directory.slice(benchmarkRuns.length).replace(/^[/\\]/, '').replaceAll('\\', '/'),
        createdAt: metadata.mtime.toISOString(),
        run: JSON.parse(run),
        report: JSON.parse(report),
      }
    },
  )
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function batchDirectories(root: string, depth = 0): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const hasSummary = entries.some((entry) => entry.isFile() && entry.name === 'batch.json')
  if (depth >= 2) return hasSummary ? [root] : []
  const nested = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => batchDirectories(resolve(root, entry.name), depth + 1)),
  )
  return [...(hasSummary ? [root] : []), ...nested.flat()]
}

async function allBatches() {
  let directories: string[]
  try {
    directories = await batchDirectories(benchmarkBatches)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
  const records = await readableRecords(
    directories,
    async (directory) => {
      const path = resolve(directory, 'batch.json')
      const [contents, metadata] = await Promise.all([readFile(path, 'utf8'), stat(path)])
      return {
        id: directory.slice(benchmarkBatches.length).replace(/^[/\\]/, '').replaceAll('\\', '/'),
        createdAt: metadata.mtime.toISOString(),
        summary: JSON.parse(contents) as BatchSummary,
      }
    },
  )
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function readDirectoryFiles(root: string) {
  try {
    return await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function taskCatalog(): Promise<TaskDescriptor[]> {
  const [taskEntries, planEntries] = await Promise.all([
    readDirectoryFiles(benchmarkTasks),
    readDirectoryFiles(benchmarkPlans),
  ])
  const plansByTask = new Map<string, TaskDescriptor['plans']>()
  const planTaskIds = await Promise.all(
    planEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        try {
          const plan = JSON.parse(await readFile(resolve(benchmarkPlans, entry.name), 'utf8'))
          return { entry, taskId: typeof plan.taskId === 'string' ? plan.taskId : undefined }
        } catch {
          return { entry, taskId: undefined }
        }
      }),
  )
  for (const { entry, taskId } of planTaskIds) {
    if (!taskId) continue
    const plans = plansByTask.get(taskId) ?? []
    const id = entry.name.replace(/\.json$/i, '')
    plans.push({ id, label: id.replace(/[-_.]+/g, ' '), unsafe: id.includes('unsafe') })
    plansByTask.set(taskId, plans)
  }

  const tasks = await Promise.all(
    taskEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const filePath = resolve(benchmarkTasks, entry.name)
        const task = JSON.parse(await readFile(filePath, 'utf8'))
        const plans = (plansByTask.get(task.id) ?? []).sort((a, b) => Number(a.unsafe) - Number(b.unsafe) || a.id.localeCompare(b.id))
        return {
          id: task.id,
          version: typeof task.version === 'number' ? task.version : null,
          instruction: typeof task.instruction === 'string' ? task.instruction : '',
          riskLevel: typeof task.riskLevel === 'string' ? task.riskLevel : null,
          maxSteps: task.maxSteps,
          plans,
          filePath,
        }
      }),
  )
  return tasks.sort((a, b) => a.id.localeCompare(b.id))
}

async function suiteCatalog(): Promise<SuiteDescriptor[]> {
  const entries = await readDirectoryFiles(benchmarkSuites)
  const suites = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const filePath = resolve(benchmarkSuites, entry.name)
        const suite = JSON.parse(await readFile(filePath, 'utf8'))
        return {
          id: suite.id,
          description: typeof suite.description === 'string' ? suite.description : '',
          caseCount: Array.isArray(suite.cases) ? suite.cases.length : 0,
          ...(Array.isArray(suite.cases) && suite.cases.some((entry: { agentCommand?: unknown }) =>
            typeof entry.agentCommand === 'string' && entry.agentCommand.includes('openai-agent.mjs'))
            ? { requiresProvider: 'openai' as const }
            : {}),
          filePath,
        }
      }),
  )
  return suites.sort((a, b) => a.id.localeCompare(b.id))
}

async function experimentCatalog() {
  const entries = await readDirectoryFiles(benchmarkExperiments)
  const experiments = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => JSON.parse(await readFile(resolve(benchmarkExperiments, entry.name), 'utf8'))),
  )
  return experiments.sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

function publicTask(task: TaskDescriptor) {
  const { filePath: _filePath, ...descriptor } = task
  return descriptor
}

function publicSuite(suite: SuiteDescriptor) {
  const { filePath: _filePath, ...descriptor } = suite
  return descriptor
}

function jsonResponse(response: ServerResponse, payload: unknown, statusCode = 200) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

async function requestBody(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
    if (body.length > 1_000_000) throw new Error('Request body is too large.')
  }
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function parseRunnerOutput(output: string) {
  const lines = output.trim().split(/\r?\n/).reverse()
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object' && 'passed' in parsed) return parsed
    } catch {
      // Runner output is machine-readable; ignore non-JSON diagnostic lines.
    }
  }
  return undefined
}

async function startRun(request: IncomingMessage, response: ServerResponse, providerEnv: Record<string, string>) {
  const payload = await requestBody(request)
  if (!payload || typeof payload !== 'object' || typeof payload.taskId !== 'string' || typeof payload.planId !== 'string') {
    jsonResponse(response, { error: 'taskId and planId are required.' }, 400)
    return
  }
  const tasks = await taskCatalog()
  const task = tasks.find((entry) => entry.id === payload.taskId)
  const usesOpenAI = payload.planId === 'openai-agent'
  const plan = usesOpenAI ? undefined : task?.plans.find((entry) => entry.id === payload.planId)
  if (!task || (!usesOpenAI && !plan)) {
    jsonResponse(response, { error: 'Unknown task or plan.' }, 404)
    return
  }
  if (usesOpenAI && !(providerEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY)) {
    jsonResponse(response, { error: 'OpenAI Agent is not configured. Set OPENAI_API_KEY in .env.' }, 424)
    return
  }
  const runPlanId = usesOpenAI ? 'openai-agent' : plan!.id
  const running = [...jobs.values()].find((job) =>
    job.taskId === task.id && job.planId === runPlanId && job.status === 'running'
  )
  if (running) {
    jsonResponse(response, { error: 'This task and plan are already running.', job: running }, 409)
    return
  }

  const taskFile = task.filePath
  const planFile = plan ? resolve(benchmarkPlans, `${plan.id}.json`) : undefined
  const job: Job = {
    id: randomUUID(),
    taskId: task.id,
    planId: runPlanId,
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  jobs.set(job.id, job)
  const openaiCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(openaiAgentCli)}`
  const runnerArguments = usesOpenAI
    ? [runnerCli, '--task', taskFile, '--agent-command', openaiCommand]
    : [runnerCli, '--task', taskFile, '--plan', planFile!]
  const child = spawn(process.execPath, runnerArguments, {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...providerEnv },
  })
  activeProcesses.add(child)
  let output = ''
  let diagnostics = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { diagnostics += String(chunk) })
  child.once('error', (error) => {
    activeProcesses.delete(child)
    if (job.status !== 'running') return
    job.status = 'error'
    job.message = error.message
    job.completedAt = new Date().toISOString()
  })
  child.once('close', (exitCode) => {
    activeProcesses.delete(child)
    if (job.status !== 'running') return
    const report = parseRunnerOutput(output)
    job.exitCode = exitCode
    job.completedAt = new Date().toISOString()
    job.report = report
    job.artifacts = report?.artifacts
    job.message = report ? undefined : diagnostics.trim().slice(-1000) || 'Runner did not return a report.'
    job.status = exitCode === 0 ? 'passed' : exitCode === 1 && report ? 'failed' : 'error'
  })
  jsonResponse(response, { job }, 202)
}

async function startBatch(request: IncomingMessage, response: ServerResponse, providerEnv: Record<string, string>) {
  const payload = await requestBody(request)
  if (!payload || typeof payload !== 'object' || typeof payload.suiteId !== 'string') {
    jsonResponse(response, { error: 'suiteId is required.' }, 400)
    return
  }
  const suite = (await suiteCatalog()).find((entry) => entry.id === payload.suiteId)
  if (!suite) {
    jsonResponse(response, { error: 'Unknown suite.' }, 404)
    return
  }
  if (suite.requiresProvider === 'openai' && !(providerEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY)) {
    jsonResponse(response, { error: 'This suite requires OPENAI_API_KEY in .env.' }, 424)
    return
  }
  const running = [...batchJobs.values()].find((job) => job.suiteId === suite.id && job.status === 'running')
  if (running) {
    jsonResponse(response, { error: 'This suite is already running.', job: running }, 409)
    return
  }

  const job: BatchJob = {
    id: randomUUID(),
    suiteId: suite.id,
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  batchJobs.set(job.id, job)
  const child = spawn(process.execPath, [batchCli, '--suite', suite.filePath, '--continue-on-error'], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...providerEnv },
  })
  activeProcesses.add(child)
  let output = ''
  let diagnostics = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { diagnostics += String(chunk) })
  child.once('error', (error) => {
    activeProcesses.delete(child)
    if (job.status !== 'running') return
    job.status = 'error'
    job.message = error.message
    job.completedAt = new Date().toISOString()
  })
  child.once('close', (exitCode) => {
    activeProcesses.delete(child)
    if (job.status !== 'running') return
    const summary = parseRunnerOutput(output) as BatchSummary | undefined
    job.exitCode = exitCode
    job.completedAt = new Date().toISOString()
    job.summary = summary
    job.message = summary ? undefined : diagnostics.trim().slice(-1000) || 'Batch Runner did not return a summary.'
    job.status = exitCode === 0 ? 'passed' : exitCode === 1 && summary ? 'failed' : 'error'
  })
  jsonResponse(response, { job }, 202)
}

function runsApi(providerEnv: Record<string, string>): Plugin {
  const stopActiveProcesses = () => {
    for (const child of activeProcesses) child.kill()
    activeProcesses.clear()
  }
  const installMiddleware = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/tasks', async (_request, response) => {
      try {
        jsonResponse(response, { tasks: (await taskCatalog()).map(publicTask) })
      } catch (error) {
        jsonResponse(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    })
    server.middlewares.use('/api/providers', (_request, response) => {
      jsonResponse(response, {
        providers: [{
          id: 'openai',
          label: 'OpenAI',
          configured: Boolean(providerEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY),
          model: providerEnv.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          reasoningModel: providerEnv.OPENAI_REASONING_MODEL || process.env.OPENAI_REASONING_MODEL || null,
          reasoningEffort: providerEnv.OPENAI_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT || null,
        }],
      })
    })
    server.middlewares.use('/api/experiments', async (_request, response) => {
      try {
        jsonResponse(response, { experiments: await experimentCatalog() })
      } catch (error) {
        jsonResponse(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    })
    server.middlewares.use('/api/jobs', (_request, response) => {
      const recentJobs = [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 50)
      jsonResponse(response, { jobs: recentJobs })
    })
    server.middlewares.use('/api/suites', async (_request, response) => {
      try {
        jsonResponse(response, { suites: (await suiteCatalog()).map(publicSuite) })
      } catch (error) {
        jsonResponse(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    })
    server.middlewares.use('/api/batches', async (request, response) => {
      try {
        if (request.method === 'POST') {
          await startBatch(request, response, providerEnv)
          return
        }
        const recentJobs = [...batchJobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 20)
        jsonResponse(response, { batches: await allBatches(), jobs: recentJobs })
      } catch (error) {
        jsonResponse(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    })
    server.middlewares.use('/api/runs/latest', async (_request, response) => {
      try {
        const result = (await allRuns())[0]
        if (!result) {
          response.statusCode = 404
          response.end(JSON.stringify({ error: 'No run report available' }))
          return
        }

        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify(result))
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }))
      }
    })
    server.middlewares.use('/api/runs', async (request, response) => {
      try {
        if (request.method === 'POST') {
          await startRun(request, response, providerEnv)
          return
        }
        jsonResponse(response, { runs: await allRuns() })
      } catch (error) {
        jsonResponse(response, { error: error instanceof Error ? error.message : 'Unknown error' }, 500)
      }
    })
  }

  return {
    name: 'trustbench-runs-api',
    configureServer(server: ViteDevServer) {
      installMiddleware(server)
      server.httpServer?.once('close', stopActiveProcesses)
    },
    configurePreviewServer(server: PreviewServer) {
      installMiddleware(server)
      server.httpServer?.once('close', stopActiveProcesses)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const providerEnv = loadEnv(mode, repositoryRoot, 'OPENAI_')
  return {
    plugins: [react(), runsApi(providerEnv)],
  }
})
