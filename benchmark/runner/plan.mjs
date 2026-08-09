import { EvaluationInputError } from "../evaluator/evaluate.mjs";

const supportedActionTypes = new Set(["click", "fill", "press", "waitFor"]);

function requireCondition(condition, message) {
  if (!condition) {
    throw new EvaluationInputError(message);
  }
}

function requireString(value, label) {
  requireCondition(
    typeof value === "string" && value.length > 0,
    `${label} must be a non-empty string.`
  );
}

export function validatePlan(task, plan) {
  requireCondition(
    plan !== null && typeof plan === "object" && !Array.isArray(plan),
    "Action plan must be a JSON object."
  );

  if (plan.taskId !== undefined) {
    requireString(plan.taskId, "Plan taskId");
    requireCondition(
      plan.taskId === task.id,
      `Plan taskId \"${plan.taskId}\" does not match task \"${task.id}\".`
    );
  }

  requireCondition(
    Array.isArray(plan.actions),
    "Action plan actions must be an array."
  );

  plan.actions.forEach((action, index) => {
    requireCondition(
      action !== null && typeof action === "object" && !Array.isArray(action),
      `Plan action at index ${index} must be a JSON object.`
    );
    requireString(action.type, `Plan action at index ${index} type`);
    requireCondition(
      supportedActionTypes.has(action.type),
      `Unsupported plan action type \"${action.type}\" at index ${index}.`
    );
    requireString(action.selector, `Plan action at index ${index} selector`);

    if (action.type === "fill") {
      requireCondition(
        typeof action.value === "string",
        `Plan fill action at index ${index} value must be a string.`
      );
    }

    if (action.type === "press") {
      requireString(action.key, `Plan press action at index ${index} key`);
    }

    if (action.dialog !== undefined) {
      requireCondition(
        action.type === "click" && ["accept", "dismiss"].includes(action.dialog),
        `Plan action at index ${index} dialog must be accept or dismiss on a click action.`
      );
    }

    if (action.timeout !== undefined) {
      requireCondition(
        Number.isInteger(action.timeout) && action.timeout > 0,
        `Plan action at index ${index} timeout must be a positive integer.`
      );
    }
  });

  return plan;
}

export async function applyAction(page, action, defaultTimeout = 5000) {
  const timeout = action.timeout ?? defaultTimeout;
  const locator = page.locator(action.selector);

  switch (action.type) {
    case "click": {
      const dialogHandled = action.dialog
        ? new Promise((resolvePromise, rejectPromise) => {
            page.once("dialog", async (dialog) => {
              try {
                if (action.dialog === "accept") {
                  await dialog.accept();
                } else {
                  await dialog.dismiss();
                }
                resolvePromise();
              } catch (error) {
                rejectPromise(error);
              }
            });
          })
        : null;
      await locator.click({ timeout });
      if (dialogHandled) {
        let timeoutId;
        try {
          await Promise.race([
            dialogHandled,
            new Promise((_, rejectPromise) => {
              timeoutId = setTimeout(
                () => rejectPromise(new Error(`Expected dialog did not appear within ${timeout}ms.`)),
                timeout
              );
            }),
          ]);
        } finally {
          clearTimeout(timeoutId);
        }
      }
      break;
    }
    case "fill":
      await locator.fill(action.value, { timeout });
      break;
    case "press":
      await locator.press(action.key, { timeout });
      break;
    case "waitFor":
      await locator.waitFor({ state: "visible", timeout });
      break;
    default:
      throw new EvaluationInputError(
        `Unsupported plan action type \"${action.type}\".`
      );
  }

  // Let React commit state changes before the next action or final snapshot.
  await page.waitForTimeout(0);
}

export const supportedActionTypesList = [...supportedActionTypes];
