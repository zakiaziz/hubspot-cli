import { CliError } from "./errors.js";
import type { GlobalOptions, ParsedArgs, UnknownFlag } from "./types.js";

const valueFlags = new Set([
  "profile",
  "access-token",
  "base-url",
  "api-version",
  "file",
  "set",
  "query",
  "property",
  "format", "color", "timeout", "cursor", "page-size", "max-items",
  "type", "pipeline-id", "from-type", "from-id", "to-type", "to-id",
]);

const booleanFlags = new Set([
  "yes",
  "dry-run",
  "all",
  "help",
  "version",
  "from-env",
  "quiet", "verbose", "no-input",
]);

const repeatableFlags = new Set(["set", "query", "property"]);

const aliases: Record<string, string> = {
  h: "help",
  q: "quiet",
  v: "verbose",
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

    if (arg.startsWith("---") || (!arg.startsWith("--") && !/^-[hqvy](?:=|$)/.test(arg))) throw new CliError("Unknown option " + JSON.stringify(arg) + ".");
    const parsed = parseFlagToken(arg);
    const name = arg.startsWith("--") ? parsed.name : aliases[parsed.name] ?? parsed.name;

    if (booleanFlags.has(name)) {
      setFlag(flags, name, parseBooleanFlag(name, parsed.value));
      continue;
    }

    if (valueFlags.has(name)) {
      const value = parsed.value ?? argv[index + 1];
      if (
        value === undefined ||
        (parsed.value === undefined && value.startsWith("-") && value !== "-")
      ) {
        throw new CliError(`Missing value for --${name}`);
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
    file: getString(parsed.flags, "file"),
    set: getStringArray(parsed.flags, "set"),
    query: getStringArray(parsed.flags, "query"),
    properties: getStringArray(parsed.flags, "property"),
    yes: getBoolean(parsed.flags, "yes"),
    dryRun: getBoolean(parsed.flags, "dry-run"),
    all: getBoolean(parsed.flags, "all"),
    cursor: getString(parsed.flags, "cursor"),
    pageSize: parsePositiveInteger(parsed.flags, "page-size"),
    maxItems: parsePositiveInteger(parsed.flags, "max-items"),
    format: parseChoice(parsed.flags, "format", ["json", "pretty", "human"], "json"),
    color: parseChoice(parsed.flags, "color", ["auto", "always", "never"], "auto"),
    quiet: getBoolean(parsed.flags, "quiet"),
    verbose: getBoolean(parsed.flags, "verbose"),
    noInput: getBoolean(parsed.flags, "no-input"),
    timeoutMs: parseDuration(getString(parsed.flags, "timeout") ?? "30s"),
    help: getBoolean(parsed.flags, "help"),
    version: getBoolean(parsed.flags, "version"),
  };
}

function parseChoice<T extends string>(flags: ParsedArgs["flags"], name: string, allowed: readonly T[], fallback: T): T {
  const value = getString(flags, name);
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) throw new CliError("Invalid --" + name + " value " + JSON.stringify(value) + ". Use " + allowed.join(", ") + ".");
  return value as T;
}

function parsePositiveInteger(flags: ParsedArgs["flags"], name: string): number | undefined {
  const value = getString(flags, name);
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new CliError("--" + name + " must be a positive integer; received " + JSON.stringify(value) + ".");
  return Number(value);
}

function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m)$/.exec(value);
  if (!match) throw new CliError("--timeout must include ms, s, or m; received " + JSON.stringify(value) + ".");
  const amount = Number(match[1]);
  const milliseconds = amount * (match[2] === "m" ? 60000 : match[2] === "s" ? 1000 : 1);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > 2147483647) throw new CliError("--timeout must be between 1ms and 2147483647ms.");
  return milliseconds;
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
  return flags[name] === true;
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

function parseBooleanFlag(name: string, value: string | undefined): boolean {
  if (value === undefined || value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new CliError(
    `Invalid boolean value "${value}" for --${name}. Use true or false.`,
  );
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
    if (name in flags) throw new CliError("Duplicate option " + JSON.stringify("--" + name));
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

export function presentationOptions(argv: readonly string[]): Pick<GlobalOptions, "format" | "color"> {
  const result: { format: GlobalOptions["format"]; color: GlobalOptions["color"] } = { format: "json", color: "auto" };
  for (let i = 0; i < argv.length && argv[i] !== "--"; i += 1) {
    const token = argv[i] ?? "";
    for (const key of ["format", "color"] as const) {
      const value = token === "--" + key ? argv[i + 1] : token.startsWith("--" + key + "=") ? token.slice(key.length + 3) : undefined;
      if (key === "format" && ["json", "pretty", "human"].includes(value ?? "")) result.format = value as GlobalOptions["format"];
      if (key === "color" && ["auto", "always", "never"].includes(value ?? "")) result.color = value as GlobalOptions["color"];
    }
  }
  return result;
}
