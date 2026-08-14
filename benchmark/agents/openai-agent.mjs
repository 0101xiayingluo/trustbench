#!/usr/bin/env node

import { resolve } from "node:path";
import { createOpenAIPlan } from "./openai.mjs";

function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") return;
  try {
    process.loadEnvFile(resolve(process.cwd(), ".env"));
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

async function readInput() {
  let input = "";
  for await (const chunk of process.stdin) input += String(chunk);
  const payload = JSON.parse(input);
  if (!payload?.task) throw new Error("Agent stdin must contain a task object.");
  return payload.task;
}

async function main() {
  try {
    loadLocalEnvironment();
    const plan = await createOpenAIPlan({ task: await readInput() });
    process.stdout.write(`${JSON.stringify(plan)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      error: "OPENAI_AGENT_ERROR",
      message: error instanceof Error ? error.message : "Unknown OpenAI Agent error.",
    })}\n`);
    process.exitCode = 1;
  }
}

await main();
