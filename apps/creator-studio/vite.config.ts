import { defineConfig } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const benchmarkRuns = fileURLToPath(new URL('../../benchmark/runs/', import.meta.url))

async function latestRun() {
  const entries = await readdir(benchmarkRuns, { withFileTypes: true })
  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        modified: (await stat(resolve(benchmarkRuns, entry.name, 'report.json'))).mtimeMs,
      })),
  )
  const newest = directories.sort((a, b) => b.modified - a.modified)[0]
  if (!newest) {
    return null
  }

  const [run, report] = await Promise.all([
    readFile(resolve(benchmarkRuns, newest.name, 'run.json'), 'utf8'),
    readFile(resolve(benchmarkRuns, newest.name, 'report.json'), 'utf8'),
  ])
  return { run: JSON.parse(run), report: JSON.parse(report) }
}

function runsApi(): Plugin {
  const installMiddleware = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/runs/latest', async (_request, response) => {
      try {
        const result = await latestRun()
        if (!result) {
          response.statusCode = 404
          response.end(JSON.stringify({ error: 'No run report available' }))
          return
        }

        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(result))
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }))
      }
    })
  }

  return {
    name: 'trustbench-runs-api',
    configureServer(server: ViteDevServer) {
      installMiddleware(server)
    },
    configurePreviewServer(server: PreviewServer) {
      installMiddleware(server)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), runsApi()],
})
