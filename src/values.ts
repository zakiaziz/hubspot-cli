import { readFileSync } from "node:fs";
import type { QueryEntry, UnknownFlag } from "./types.js";

export function parseValue(input: string | boolean): unknown {
  if (typeof input === "boolean") {
    return input;
  }

  const value = input.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    return JSON.parse(value);
  }

  return input;
}

export function readJsonBody(
  source: string | undefined,
): Record<string, unknown> | unknown[] | undefined {
  if (!source) {
    return undefined;
  }

  const raw = source.startsWith("@")
    ? readFileSync(source.slice(1), "utf8")
    : source;
  const parsed = JSON.parse(raw) as unknown;
  if (!isObject(parsed) && !Array.isArray(parsed)) {
    throw new Error("Body must be a JSON object or array");
  }
  return parsed;
}

export function applyAssignments(
  target: Record<string, unknown>,
  assignments: readonly string[],
): void {
  for (const assignment of assignments) {
    const [key, value] = splitAssignment(assignment, "assignment");
    setPath(target, key, parseValue(value));
  }
}

export function propertyAssignmentsToBody(
  assignments: readonly string[],
): Record<string, unknown> {
  const properties: Record<string, string> = {};
  for (const assignment of assignments) {
    const [key, value] = splitAssignment(assignment, "property");
    properties[key] = value;
  }
  return assignments.length === 0 ? {} : { properties };
}

export function unknownFlagsToBody(
  flags: readonly UnknownFlag[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const flag of flags) {
    setPath(body, kebabToCamel(flag.name), parseValue(flag.value));
  }
  return body;
}

export function unknownFlagsToQueryEntries(
  flags: readonly UnknownFlag[],
): QueryEntry[] {
  return flags.map((flag) => [
    kebabToCamel(flag.name),
    String(parseValue(flag.value)),
  ]);
}

export function assignmentsToQueryEntries(
  assignments: readonly string[],
): QueryEntry[] {
  return assignments.map((assignment) => {
    const [key, value] = splitAssignment(assignment, "query");
    return [key, String(parseValue(value))];
  });
}

export function mergeBody(
  base: Record<string, unknown> | unknown[] | undefined,
  extra: Record<string, unknown>,
): unknown {
  if (Array.isArray(base)) {
    if (Object.keys(extra).length > 0) {
      throw new Error("Cannot merge generated fields into an array body");
    }
    return base;
  }

  return deepMerge(base ?? {}, extra);
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!isObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = /token|secret|password|authorization/i.test(key)
      ? "[redacted]"
      : redact(child);
  }
  return result;
}

export function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Assignment path cannot be empty");
  }

  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const current = cursor[part];
    if (!isObject(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1) as string] = value;
}

function splitAssignment(
  assignment: string,
  kind: string,
): readonly [string, string] {
  const separator = assignment.indexOf("=");
  if (separator <= 0) {
    throw new Error(`Invalid ${kind} "${assignment}". Use key=value.`);
  }
  return [assignment.slice(0, separator), assignment.slice(separator + 1)];
}

function kebabToCamel(input: string): string {
  return input.replace(/-([a-z0-9])/g, (_, character: string) =>
    character.toUpperCase(),
  );
}

function deepMerge(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    result[key] =
      isObject(result[key]) && isObject(value)
        ? deepMerge(result[key] as Record<string, unknown>, value)
        : value;
  }
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
