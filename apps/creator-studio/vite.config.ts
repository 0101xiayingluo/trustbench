import { defineConfig } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const benchmarkRuns = fileURLToPath(new URL('../../benchmark/runs/', import.meta.url))

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

  const records = await Promise.all(
    directories.map(async (directory) => {
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
    }),
  )
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function runsApi(): Plugin {
  const installMiddleware = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/runs/latest', async (_request, response) => {
      try {
        const result = (await allRuns())[0]
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
    server.middlewares.use('/api/runs', async (_request, response) => {
      try {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ runs: await allRuns() }))
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
