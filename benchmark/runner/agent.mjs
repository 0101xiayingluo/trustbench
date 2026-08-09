import { spawn } from "node:child_process";

export class AgentCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentCommandError";
  }
}

export function parseAgentPlanOutput(output) {
  const trimmed = output.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall back to the final JSON line when the Agent prints diagnostics.
  }
  const lines = trimmed.split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Agents may emit diagnostic lines before their final JSON response.
    }
  }
  throw new AgentCommandError("Agent command did not return a JSON plan.");
}

export async function generatePlan({ task, command, cwd = process.cwd(), timeout = 30000 } = {}) {
  if (!task || typeof task !== "object") {
    throw new AgentCommandError("Agent task payload is required.");
  }
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new AgentCommandError("Agent command must be a non-empty string.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TRUSTBENCH_TASK_ID: task.id },
    });
    let output = "";
    let diagnostics = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new AgentCommandError(`Agent command timed out after ${timeout}ms.`));
    }, timeout);

    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { diagnostics += String(chunk); });
    child.once("error", (error) => {
      finish(reject, new AgentCommandError(`Unable to start agent command: ${error.message}`));
    });
    child.once("close", (code) => {
      if (code !== 0) {
        finish(reject, new AgentCommandError(
          `Agent command exited with code ${code}.${diagnostics.trim() ? ` ${diagnostics.trim().slice(-1000)}` : ""}`,
        ));
        return;
      }
      try {
        finish(resolve, parseAgentPlanOutput(output));
      } catch (error) {
        finish(reject, error);
      }
    });
    child.stdin.end(`${JSON.stringify({ task })}\n`);
  });
}
