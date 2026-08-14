import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const environments = {
  "creator-default": {
    cwd: resolve(projectRoot, "apps/creator-studio"),
  },
};

export class RunnerError extends Error {
  constructor(message) {
    super(message);
    this.name = "RunnerError";
  }
}

const delay = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export function resolveStartUrl(task, baseUrl) {
  if (!task.startUrl) {
    throw new RunnerError("Task startUrl is required to run a browser task.");
  }

  let taskUrl;
  try {
    taskUrl = new URL(task.startUrl);
  } catch (error) {
    throw new RunnerError(`Task startUrl is invalid: ${error.message}`);
  }

  if (!baseUrl) {
    return taskUrl;
  }

  let base;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    throw new RunnerError(`Base URL is invalid: ${error.message}`);
  }

  base.pathname = taskUrl.pathname;
  base.search = taskUrl.search;
  base.hash = taskUrl.hash;
  return base;
}

async function isServerReady(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(800),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url, child, getSpawnError, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const spawnError = getSpawnError();
    if (spawnError) {
      throw new RunnerError(`Unable to start environment server: ${spawnError.message}`);
    }

    if (await isServerReady(url)) {
      return;
    }

    if (child.exitCode !== null) {
      throw new RunnerError(
        `Environment server exited before becoming ready (code ${child.exitCode}).`
      );
    }

    await delay(100);
  }

  throw new RunnerError(`Environment server did not become ready within ${timeout}ms.`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  const exited = new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
  child.kill();
  await Promise.race([exited, delay(1500)]);
}

export async function ensureEnvironment(task, targetUrl, { timeout = 15000 } = {}) {
  if (await isServerReady(targetUrl)) {
    return {
      targetUrl,
      started: false,
      async close() {},
    };
  }

  const environment = environments[task.initialState];
  if (!environment) {
    throw new RunnerError(
      `No local environment is registered for initialState \"${task.initialState}\".`
    );
  }

  if (targetUrl.protocol !== "http:") {
    throw new RunnerError("The local environment server only supports http URLs.");
  }

  const port = targetUrl.port || "80";
  const host = targetUrl.hostname;
  const viteEntry = resolve(environment.cwd, "node_modules/vite/bin/vite.js");
  const output = [];
  let spawnError;
  const child = spawn(
    process.execPath,
    [viteEntry, "--host", host, "--port", port, "--strictPort"],
    {
      cwd: environment.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  const collectOutput = (chunk) => {
    output.push(String(chunk));
    if (output.length > 30) {
      output.shift();
    }
  };
  child.stdout.on("data", collectOutput);
  child.stderr.on("data", collectOutput);
  child.once("error", (error) => {
    spawnError = error;
  });

  try {
    await waitForServer(targetUrl, child, () => spawnError, timeout);
  } catch (error) {
    await stopProcess(child);
    const logs = output.join("").trim();
    throw new RunnerError(
      `${error.message}${logs ? `\n${logs.slice(-2000)}` : ""}`
    );
  }

  return {
    targetUrl,
    started: true,
    async close() {
      await stopProcess(child);
    },
  };
}
