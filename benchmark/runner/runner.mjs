import { chromium } from "playwright";
import { evaluateRun, validateTask } from "../evaluator/evaluate.mjs";
import { applyAction, validatePlan } from "./plan.mjs";
import { ensureEnvironment, resolveStartUrl, RunnerError } from "./server.mjs";

async function launchBrowser({ browser = "auto", browserPath, headless }) {
  if (browserPath) {
    return chromium.launch({ executablePath: browserPath, headless });
  }

  const channel =
    browser === "auto" && process.platform === "win32"
      ? "msedge"
      : browser === "auto"
        ? undefined
        : browser === "chromium"
          ? undefined
          : browser;

  return chromium.launch({
    ...(channel ? { channel } : {}),
    headless,
  });
}

export async function runTask({
  task,
  plan,
  baseUrl,
  browser = "auto",
  browserPath,
  headless = true,
  serverTimeout = 15000,
  actionTimeout = 5000,
} = {}) {
  validateTask(task);
  validatePlan(task, plan);
  const targetUrl = resolveStartUrl(task, baseUrl);
  const environment = await ensureEnvironment(task, targetUrl, {
    timeout: serverTimeout,
  });
  let browserInstance;
  let context;

  try {
    try {
      browserInstance = await launchBrowser({ browser, browserPath, headless });
    } catch (error) {
      throw new RunnerError(
        `Unable to launch browser. Use --browser-path or install a Playwright browser. ${error.message}`
      );
    }

    context = await browserInstance.newContext();
    const page = await context.newPage();
    await page.goto(targetUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: serverTimeout,
    });
    await page.waitForFunction(
      () => window.__TRUSTBENCH_STATE__ !== undefined,
      { timeout: serverTimeout }
    );

    const snapshots = [
      {
        step: 0,
        state: await captureFinalState(page),
      },
    ];

    for (const action of plan.actions) {
      await applyAction(page, action, actionTimeout);
      snapshots.push({
        step: snapshots.length,
        planAction: structuredClone(action),
        state: await captureFinalState(page),
      });
    }

    const finalState = snapshots.at(-1)?.state;
    if (!finalState) {
      throw new RunnerError("TrustBench page did not expose a final state.");
    }
    const actions = await page.evaluate(() => window.__TRUSTBENCH_STATE__?.actions ?? []);
    const run = {
      taskId: task.id,
      finalState,
      actions: Array.isArray(actions) ? actions : [],
      stepCount: plan.actions.length,
      planActions: plan.actions.map((action) => structuredClone(action)),
      snapshots,
    };

    return {
      url: page.url(),
      serverStarted: environment.started,
      run,
      report: evaluateRun(task, run),
    };
  } finally {
    try {
      await context?.close();
    } finally {
      try {
        await browserInstance?.close();
      } finally {
        await environment.close();
      }
    }
  }
}

async function captureFinalState(page) {
  return page.evaluate(() => {
    const state = window.__TRUSTBENCH_STATE__;
    if (!state) {
      throw new Error("TrustBench page did not expose a final state.");
    }

    const { actions: _actions, ...finalState } = JSON.parse(JSON.stringify(state));
    return finalState;
  });
}
