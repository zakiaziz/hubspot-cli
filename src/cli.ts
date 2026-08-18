#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { getBoolean, getGlobalOptions, getString, parseArgs } from "./args.js";
import { loadRuntimeContext } from "./auth.js";
import {
  configDir,
  configGet,
  configPath,
  configSet,
  configUnset,
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  profilePath,
  readConfig,
  requireProfile,
  setActiveProfileName,
  showProfile,
  writeProfile,
} from "./config.js";
import { endpoints, findEndpoint } from "./endpoints.js";
import {
  buildApiRequestPlan,
  buildRequestPlan,
  executeAllPages,
  executeRequest,
  renderDryRun,
} from "./http.js";
import { printJson, printRedacted, printResult, printText } from "./output.js";
import type {
  Endpoint,
  GlobalOptions,
  HttpMethod,
  ParsedArgs,
  Profile,
  QueryEntry,
} from "./types.js";
import {
  applyAssignments,
  mergeBody,
  propertyAssignmentsToBody,
  readJsonBody,
} from "./values.js";
import { environmentValue } from "./util.js";

const authFlags = ["profile", "access-token", "base-url", "api-version"] as const;
const profileWriteFlags = ["access-token", "base-url", "api-version"] as const;
const requestFlags = [
  ...authFlags,
  "body",
  "set",
  "query",
  "property",
  "yes",
  "dry-run",
  "all",
] as const;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  const options = getGlobalOptions(parsed);

  if (options.version) {
    printText(version());
    return;
  }
  if (options.help || parsed.command.length === 0) {
    printText(help());
    return;
  }
  rejectUnknownOptions(parsed);
  await dispatch(parsed, options);
}

async function dispatch(parsed: ParsedArgs, options: GlobalOptions): Promise<void> {
  const [group, action] = parsed.command;

  if (group === "setup") {
    assertAllowedFlags(parsed, [...authFlags, "from-env"]);
    await runSetup(parsed);
    return;
  }
  if (group === "profiles") {
    const allowed = ["create", "update"].includes(action ?? "")
      ? profileWriteFlags
      : [];
    assertAllowedFlags(parsed, allowed);
    runProfiles(parsed);
    return;
  }
  if (group === "config") {
    assertAllowedFlags(parsed, []);
    runConfig(parsed);
    return;
  }
  if (group === "auth") {
    assertAllowedFlags(parsed, authFlags);
    await runAuth(parsed, options);
    return;
  }
  if (group === "completions") {
    assertAllowedFlags(parsed, []);
    if (parsed.command.length !== 2) {
      throw new Error("Usage: hubspot completions <bash|zsh|fish>");
    }
    runCompletions(action);
    return;
  }
  if (group === "api" && action === "request") {
    assertAllowedFlags(parsed, requestFlags);
    await runApiRequest(parsed, options);
    return;
  }

  const match = findEndpoint(parsed.command);
  if (!match) {
    throw new Error(`Unknown command "${parsed.command.join(" ")}". Run hubspot --help.`);
  }
  assertAllowedFlags(parsed, requestFlags);
  await runEndpoint(match.endpoint, match.params, options);
}

async function runEndpoint(
  endpoint: Endpoint,
  params: Record<string, string>,
  options: GlobalOptions,
): Promise<void> {
  requireMutationConfirmation(endpoint.name, endpoint.mutation, options);
  validateEndpointOptions(endpoint, options);

  const body =
    endpoint.method === "GET"
      ? undefined
      : (buildBody(options, supportsProperties(endpoint)) ??
        (endpoint.pagination === "body" ? {} : undefined));
  const query: QueryEntry[] = [];
  const plan = buildRequestPlan({
    endpoint,
    params,
    options,
    context: loadRuntimeContext(options),
    query,
    body,
  });

  if (options.dryRun) {
    printRedacted(renderDryRun(plan));
    return;
  }
  if (options.all && endpoint.pagination) {
    printResult(await executeAllPages(plan, endpoint.pagination));
    return;
  }
  printResult(await executeRequest(plan));
}

async function runApiRequest(
  parsed: ParsedArgs,
  options: GlobalOptions,
): Promise<void> {
  const method = parsed.command[2]?.toUpperCase() as HttpMethod | undefined;
  const path = parsed.command[3];

  if (
    parsed.command.length !== 4 ||
    !method ||
    !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ||
    !path
  ) {
    throw new Error("Usage: hubspot api request <GET|POST|PUT|PATCH|DELETE> <path>");
  }
  if (options.all) {
    throw new Error("--all is available only for first-class paginated commands");
  }

  requireMutationConfirmation("api request", method !== "GET", options);
  validateBodyOptions(method, options, false);

  const body =
    method === "GET" ? undefined : buildBody(options, false);
  const query: QueryEntry[] = [];
  const plan = buildApiRequestPlan({
    method,
    path,
    options,
    context: loadRuntimeContext(options),
    query,
    body,
  });

  if (options.dryRun) {
    printRedacted(renderDryRun(plan));
    return;
  }
  printResult(await executeRequest(plan));
}

async function runSetup(parsed: ParsedArgs): Promise<void> {
  const profileName =
    getString(parsed.flags, "profile") ?? parsed.command[1] ?? "default";
  if (parsed.command.length > 2) {
    throw new Error("Usage: hubspot setup [profile] [options]");
  }

  const fromEnvironment = getBoolean(parsed.flags, "from-env");
  let accessToken = getString(parsed.flags, "access-token");
  if (fromEnvironment) {
    accessToken = accessToken ?? environmentValue("HUBSPOT_ACCESS_TOKEN");
  }
  if (!accessToken && process.stdin.isTTY) {
    const prompt = createInterface({ input, output });
    try {
      accessToken =
        (await prompt.question("HubSpot access token: ")).trim() || undefined;
    } finally {
      prompt.close();
    }
  }
  if (!accessToken) {
    throw new Error(
      "Setup needs an access token. Pass --access-token or use --from-env with HUBSPOT_ACCESS_TOKEN.",
    );
  }

  const baseUrl =
    getString(parsed.flags, "base-url") ??
    (fromEnvironment ? environmentValue("HUBSPOT_BASE_URL") : undefined);
  const apiVersion =
    getString(parsed.flags, "api-version") ??
    (fromEnvironment ? environmentValue("HUBSPOT_API_VERSION") : undefined);
  const profile: Profile = {
    accessToken,
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiVersion ? { apiVersion } : {}),
  };

  writeProfile(profileName, profile);
  setActiveProfileName(profileName);
  printJson({ profile: profileName, path: profilePath(profileName), active: true });
}

function runProfiles(parsed: ParsedArgs): void {
  const action = parsed.command[1];
  const name = parsed.command[2];

  switch (action) {
    case "list":
      if (parsed.command.length !== 2) {
        throw new Error("Usage: hubspot profiles list");
      }
      printJson({ active: getActiveProfileName(), profiles: listProfiles() });
      return;
    case "show":
      if (!name || parsed.command.length !== 3) {
        throw new Error("Usage: hubspot profiles show <name>");
      }
      printRedacted(showProfile(name));
      return;
    case "create":
    case "update": {
      if (!name || parsed.command.length !== 3) {
        throw new Error(`Usage: hubspot profiles ${action} <name> [options]`);
      }
      const fields = profileFieldsFromFlags(parsed);
      if (Object.keys(fields).length === 0) {
        throw new Error(
          `Profile ${action} needs --access-token, --base-url, or --api-version`,
        );
      }
      const profile =
        action === "update" ? { ...requireProfile(name), ...fields } : fields;
      writeProfile(name, profile);
      printJson({ profile: name, path: profilePath(name) });
      return;
    }
    case "delete":
      if (!name || parsed.command.length !== 3) {
        throw new Error("Usage: hubspot profiles delete <name>");
      }
      deleteProfile(name);
      printJson({ deleted: name });
      return;
    case "use":
      if (!name || parsed.command.length !== 3) {
        throw new Error("Usage: hubspot profiles use <name>");
      }
      requireProfile(name);
      setActiveProfileName(name);
      printJson({ active: name });
      return;
    default:
      throw new Error(
        "Usage: hubspot profiles <list|show|create|update|delete|use>",
      );
  }
}

function runConfig(parsed: ParsedArgs): void {
  const action = parsed.command[1];
  const key = parsed.command[2];
  const value = parsed.command[3];

  switch (action) {
    case "path":
      if (parsed.command.length !== 2) {
        throw new Error("Usage: hubspot config path");
      }
      printJson({ configDir: configDir(), configPath: configPath() });
      return;
    case "show":
      if (parsed.command.length !== 2) {
        throw new Error("Usage: hubspot config show");
      }
      printRedacted(readConfig());
      return;
    case "get":
      if (!key || parsed.command.length !== 3) {
        throw new Error("Usage: hubspot config get <key>");
      }
      printResult(configGet(key) ?? null);
      return;
    case "set":
      if (!key || value === undefined || parsed.command.length !== 4) {
        throw new Error("Usage: hubspot config set <key> <value>");
      }
      printRedacted(configSet(key, value));
      return;
    case "unset":
      if (!key || parsed.command.length !== 3) {
        throw new Error("Usage: hubspot config unset <key>");
      }
      printRedacted(configUnset(key));
      return;
    default:
      throw new Error("Usage: hubspot config <path|show|get|set|unset>");
  }
}

async function runAuth(parsed: ParsedArgs, options: GlobalOptions): Promise<void> {
  const action = parsed.command[1] ?? "verify";
  if (action !== "verify" || parsed.command.length > 2) {
    throw new Error("Usage: hubspot auth verify");
  }

  const match = findEndpoint(["account", "details"]);
  if (!match) throw new Error("Account details endpoint is not registered");
  const plan = buildRequestPlan({
    endpoint: match.endpoint,
    params: match.params,
    options,
    context: loadRuntimeContext(options),
    query: [],
  });
  printResult(await executeRequest(plan));
}

function runCompletions(shell: string | undefined): void {
  const words = topLevelWords().join(" ");
  switch (shell) {
    case "bash":
      printText(`_hubspot_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${words}" -- "$cur") )
}
complete -F _hubspot_complete hubspot`);
      return;
    case "zsh":
      printText(`#compdef hubspot
_arguments '*: :(${words})'`);
      return;
    case "fish":
      printText(
        topLevelWords()
          .map((word) => `complete -c hubspot -f -a ${word}`)
          .join("\n"),
      );
      return;
    default:
      throw new Error("Usage: hubspot completions <bash|zsh|fish>");
  }
}

function validateEndpointOptions(endpoint: Endpoint, options: GlobalOptions): void {
  if (options.all && !endpoint.pagination) {
    throw new Error(`--all is not supported by "${endpoint.name}"`);
  }
  validateBodyOptions(endpoint.method, options, supportsProperties(endpoint));
}

function validateBodyOptions(
  method: HttpMethod,
  options: GlobalOptions,
  allowProperties: boolean,
): void {
  if (
    method === "GET" &&
    (options.body || options.set.length > 0 || options.properties.length > 0)
  ) {
    throw new Error("GET commands do not accept --body, --set, or --property");
  }
  if (!allowProperties && options.properties.length > 0) {
    throw new Error(
      "--property is available only for objects create and objects update",
    );
  }
}

function buildBody(
  options: GlobalOptions,
  allowProperties: boolean,
): unknown {
  const generated: Record<string, unknown> = {};
  applyAssignments(generated, options.set);
  const withProperties = mergeBody(
    generated,
    allowProperties ? propertyAssignmentsToBody(options.properties) : {},
  ) as Record<string, unknown>;
  const exact = readJsonBody(options.body);

  if (
    exact === undefined &&
    Object.keys(generated).length === 0 &&
    options.properties.length === 0
  ) {
    return undefined;
  }
  return mergeBody(exact, withProperties);
}

function rejectUnknownOptions(parsed: ParsedArgs): void {
  const option = parsed.unknownFlags[0];
  if (!option) {
    return;
  }
  throw new Error(
    `Unknown option "--${option.name}". Use --query for query parameters or --set for body fields.`,
  );
}

function assertAllowedFlags(
  parsed: ParsedArgs,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const name of Object.keys(parsed.flags)) {
    if (!allowedSet.has(name)) {
      throw new Error(`Option "--${name}" is not valid for this command`);
    }
  }
}

function supportsProperties(endpoint: Endpoint): boolean {
  return endpoint.name === "objects create" || endpoint.name === "objects update";
}

function requireMutationConfirmation(
  commandName: string,
  mutation: boolean,
  options: GlobalOptions,
): void {
  if (mutation && !options.yes && !options.dryRun) {
    throw new Error(
      `"${commandName}" changes HubSpot state. Re-run with --dry-run or --yes.`,
    );
  }
}

function profileFieldsFromFlags(parsed: ParsedArgs): Profile {
  const accessToken = getString(parsed.flags, "access-token");
  const baseUrl = getString(parsed.flags, "base-url");
  const apiVersion = getString(parsed.flags, "api-version");
  return {
    ...(accessToken ? { accessToken } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiVersion ? { apiVersion } : {}),
  };
}

function help(): string {
  const commandLines = endpoints.map((endpoint) => {
    const command = endpoint.pattern
      .map((part) => (part.startsWith(":") ? `<${part.slice(1)}>` : part))
      .join(" ");
    const access = endpoint.mutation ? " [mutation]" : "";
    return `  hubspot ${command}${access}\n      ${endpoint.description}`;
  });

  return `hubspot-cli

Usage:
  hubspot <command> [options]

Configuration:
  hubspot setup [profile] [options]
  hubspot profiles <list|show|create|update|delete|use>
  hubspot config <path|show|get|set|unset>
  hubspot auth verify
  hubspot completions <bash|zsh|fish>

API commands:
${commandLines.join("\n")}
  hubspot api request <method> <path>
      Call a bearer-authenticated JSON API path.

Global options:
  --profile <name>          Select a profile.
  --access-token <token>    Override the bearer access token.
  --base-url <url>          Override https://api.hubapi.com.
  --api-version <YYYY-MM>   Override 2026-03 in first-class commands.
  --body <json|@file>       Supply an exact JSON body.
  --set <path=value>        Set a typed body field; repeatable.
  --property <name=value>   Set a CRM property string; repeatable.
  --query <name=value>      Add an exact query parameter; repeatable.
  --all                     Follow every page for supported commands.
  --dry-run                 Print a redacted request without sending it.
  --yes, -y                 Confirm a mutation.
  --help, -h                Show help.
  --version, -v             Show version.`;
}

function topLevelWords(): string[] {
  return [
    "setup",
    "profiles",
    "config",
    "auth",
    "completions",
    "api",
    ...new Set(endpoints.map((endpoint) => endpoint.pattern[0] as string)),
  ];
}

function version(): string {
  const packagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "package.json",
  );
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    version?: unknown;
  };
  if (typeof packageJson.version !== "string") {
    throw new Error(`Package version is missing from ${packagePath}`);
  }
  return packageJson.version;
}


const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
