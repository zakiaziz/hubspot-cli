import { asCliError } from "./errors.js";
import { HubSpotApiError } from "./http.js";
import type { GlobalOptions } from "./types.js";
import { redact } from "./values.js";

let presentation: Pick<GlobalOptions, "format" | "color"> = { format: "json", color: "auto" };

export function configureOutput(options: Pick<GlobalOptions, "format" | "color">): void {
  presentation = options;
}

export function printJson(value: unknown): void {
  printResult({ data: value, meta: {} });
}

export function printText(value: string): void {
  process.stdout.write(`${value}\n`);
}

export function printResult(value: unknown): void {
  process.stdout.write(render(value, process.stdout.isTTY === true));
}

export function printRedacted(value: unknown): void {
  printJson(redact(value));
}

export function printDiagnostic(value: unknown): void {
  process.stderr.write(render(value, process.stderr.isTTY === true));
}

export function printError(error: unknown): void {
  const failure = asCliError(error);
  process.stderr.write(render({ error: {
    code: failure.code,
    message: failure instanceof HubSpotApiError ? failure.apiMessage : failure.message,
    retryable: false,
    ...failure.details,
  } }, process.stderr.isTTY === true));
}

function render(value: unknown, tty: boolean): string {
  if (presentation.format === "human") {
    const text = renderHuman(value);
    const color = presentation.color === "always" || (presentation.color === "auto" && tty && !process.env.NO_COLOR);
    return (color ? text.replace(/^([^:\n]+):/gm, "\u001b[38;2;88;166;255m$1\u001b[0m:") : text) + "\n";
  }
  const json = JSON.stringify(
    value,
    (_key, item) => item === undefined ? undefined : item,
    presentation.format === "pretty" ? 2 : undefined,
  );
  if (
    presentation.format === "pretty" &&
    (presentation.color === "always" ||
      (presentation.color === "auto" && tty && !process.env.NO_COLOR))
  ) {
    return `${highlight(json)}\n`;
  }
  return `${json}\n`;
}

function highlight(json: string): string {
  return json.replace(
    /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (token, key, string) =>
      key
        ? `\u001b[38;2;88;166;255m${token}\u001b[0m`
        : string
          ? `\u001b[38;2;63;185;80m${token}\u001b[0m`
          : ["true", "false", "null"].includes(token)
            ? `\u001b[38;2;57;197;207m${token}\u001b[0m`
            : `\u001b[38;2;210;153;34m${token}\u001b[0m`,
  );
}

function renderHuman(value: unknown): string {
  if (value === null) return "No result.";
  if (typeof value === "object" && value && "error" in value) {
    const error = (value as { error: { code?: string; message?: string } }).error;
    return "Error [" + (error.code ?? "UNKNOWN") + "]: " + (error.message ?? "Unknown error");
  }
  if (typeof value === "object" && value && "data" in value) {
    return renderHuman((value as { data: unknown }).data);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "No results.";
    const records = value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
    if (records.length === value.length) {
      const columns = [...new Set(records.flatMap(Object.keys))];
      return [
        columns.join("\t"),
        ...records.map((record) => columns.map((column) => formatCell(record[column])).join("\t")),
      ].join("\n");
    }
    return value.map(String).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => key + ": " + formatCell(item))
      .join("\n");
  }
  return String(value);
}

function formatCell(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
}
