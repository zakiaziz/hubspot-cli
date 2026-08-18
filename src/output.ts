import { redact } from "./values.js";

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printText(value: string): void {
  process.stdout.write(`${value}\n`);
}

export function printResult(value: unknown): void {
  typeof value === "string" ? printText(value) : printJson(value);
}

export function printRedacted(value: unknown): void {
  printJson(redact(value));
}
