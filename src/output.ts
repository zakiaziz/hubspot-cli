import { HubSpotApiError } from "./http.js";
import { redact } from "./values.js";

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printText(value: string): void {
  process.stdout.write(`${value}\n`);
}

export function printResult(value: unknown): void {
  printJson(value);
}

export function printRedacted(value: unknown): void {
  printJson(redact(value));
}

export function printError(error: unknown): void {
  const output =
    error instanceof HubSpotApiError
      ? {
          error: {
            code: error.code,
            message: error.apiMessage,
            status: error.status,
            statusText: error.statusText,
            ...(error.category ? { category: error.category } : {}),
            ...(error.correlationId
              ? { correlationId: error.correlationId }
              : {}),
          },
        }
      : {
          error: {
            code: "CLI_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        };

  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
}
