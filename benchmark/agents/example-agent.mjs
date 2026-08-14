let input = "";
for await (const chunk of process.stdin) input += String(chunk);

const { task } = JSON.parse(input);
if (task?.id !== "creator.schedule-draft-001") {
  process.stderr.write(`Unsupported task: ${task?.id ?? "unknown"}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({
    taskId: task.id,
    actions: [
      { type: "click", selector: "[data-testid=\"schedule-draft-001\"]" },
    ],
  })}\n`);
}
