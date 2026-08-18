import type { GlobalOptions, ParsedArgs, UnknownFlag } from "./types.js";

const valueFlags = new Set([
  "profile",
  "access-token",
  "base-url",
  "api-version",
  "body",
  "data",
  "set",
  "query",
  "property",
]);

const booleanFlags = new Set([
  "yes",
  "force",
  "dry-run",
  "all",
  "json",
  "help",
  "version",
  "from-env",
]);

const repeatableFlags = new Set(["set", "query", "property"]);

const aliases: Record<string, string> = {
  h: "help",
  v: "version",
  y: "yes",
};

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  const unknownFlags: UnknownFlag[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "--") {
      command.push(...argv.slice(index + 1));
      break;
    }

    if (!arg.startsWith("-") || arg === "-") {
      command.push(arg);
      continue;
    }

    const parsed = parseFlagToken(arg);
    const name = aliases[parsed.name] ?? parsed.name;

    if (booleanFlags.has(name)) {
      setFlag(flags, name, parsed.value ?? true);
      continue;
    }

    if (valueFlags.has(name)) {
      const value = parsed.value ?? argv[index + 1];
      if (value === undefined || (parsed.value === undefined && value.startsWith("-"))) {
        throw new Error(`Missing value for --${name}`);
      }
      if (parsed.value === undefined) {
        index += 1;
      }
      setFlag(flags, name, value);
      continue;
    }

    const value = parsed.value ?? nextFlagValue(argv[index + 1]);
    if (parsed.value === undefined && value !== true) {
      index += 1;
    }
    unknownFlags.push({ name, value });
  }

  return { command, flags, unknownFlags };
}

export function getGlobalOptions(parsed: ParsedArgs): GlobalOptions {
  return {
    profile: getString(parsed.flags, "profile"),
    accessToken: getString(parsed.flags, "access-token"),
    baseUrl: getString(parsed.flags, "base-url"),
    apiVersion: getString(parsed.flags, "api-version"),
    body: getString(parsed.flags, "body") ?? getString(parsed.flags, "data"),
    set: getStringArray(parsed.flags, "set"),
    query: getStringArray(parsed.flags, "query"),
    properties: getStringArray(parsed.flags, "property"),
    yes: getBoolean(parsed.flags, "yes") || getBoolean(parsed.flags, "force"),
    dryRun: getBoolean(parsed.flags, "dry-run"),
    all: getBoolean(parsed.flags, "all"),
    json: getBoolean(parsed.flags, "json"),
    help: getBoolean(parsed.flags, "help"),
    version: getBoolean(parsed.flags, "version"),
  };
}

export function getString(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): string | undefined {
  const value = flags[name];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.at(-1);
  }
  return undefined;
}

export function getBoolean(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): boolean {
  const value = flags[name];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value !== "false" && value !== "0";
  }
  return false;
}

function getStringArray(
  flags: Record<string, string | boolean | string[]>,
  name: string,
): string[] {
  const value = flags[name];
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function parseFlagToken(arg: string): { name: string; value?: string } {
  const trimmed = arg.replace(/^-+/, "");
  const separator = trimmed.indexOf("=");
  if (separator === -1) {
    return { name: trimmed };
  }

  return {
    name: trimmed.slice(0, separator),
    value: trimmed.slice(separator + 1),
  };
}

function nextFlagValue(value: string | undefined): string | boolean {
  if (value === undefined || value.startsWith("-")) {
    return true;
  }
  return value;
}

function setFlag(
  flags: Record<string, string | boolean | string[]>,
  name: string,
  value: string | boolean,
): void {
  if (!repeatableFlags.has(name)) {
    flags[name] = value;
    return;
  }

  const current = flags[name];
  if (Array.isArray(current)) {
    current.push(String(value));
    return;
  }
  flags[name] = [String(value)];
}
