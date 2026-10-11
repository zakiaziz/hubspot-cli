#!/usr/bin/env node
import { globalFlags, utilityCommands, endpointFlags, canonicalUsage, resolveCommand, optionHelp } from "./commands.js";
import { CliError, asCliError } from "./errors.js";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBoolean, getGlobalOptions, getString, parseArgs, presentationOptions } from "./args.js";
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
  readProfile,
  setActiveProfileName,
  showProfile,
  writeProfile,
} from "./config.js";
import { endpoints, findEndpoint } from "./endpoints.js";
import {
  HubSpotApiError,
  buildApiRequestPlan,
  buildRequestPlan,
  executeAllPages,
  executeRequest,
  renderDryRun,
} from "./http.js";
import {
  configureOutput,
  printDiagnostic,
  printError,
  printJson,
  printResult,
  printText,
} from "./output.js";
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
  redact,
} from "./values.js";
import { environmentValue } from "./util.js";

const authFlags = ["profile", "access-token", "base-url", "api-version"] as const;
const profileWriteFlags = ["access-token", "base-url", "api-version"] as const;


export async function main(argv = process.argv.slice(2)): Promise<void> {
  configureOutput(presentationOptions(argv));
  const parsed = parseArgs(argv);
  const options = getGlobalOptions(parsed);
  configureOutput(options);
  if (options.quiet && options.verbose) {
    throw new CliError("--quiet and --verbose cannot be used together");
  }

  if (options.version) {
    printText("hubspot " + version());
    return;
  }
  if (options.help || parsed.command.length === 0) {
    printText(parsed.command.length === 0 ? help() : commandHelp(parsed.command));
    return;
  }
  rejectUnknownOptions(parsed);
  if (options.profile && parsed.command[0] !== "setup" && !readProfile(options.profile)) throw new CliError("Selected profile does not exist.", "CONFIGURATION_ERROR", 3);
  if (options.verbose) printDiagnostic({ diagnostic: { command: parsed.command[0], profile: options.profile ?? "active" } });
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
      throw new CliError("Usage: hubspot completions <bash|zsh|fish>");
    }
    runCompletions(action);
    return;
  }
  if (group === "api" && action === "request") {
    assertAllowedFlags(parsed, utilityCommands["api request"]!.flags);
    await runApiRequest(parsed, options);
    return;
  }

  const match = resolveCommand(parsed);
  assertAllowedFlags(parsed, endpointFlags(match.endpoint));
  await runEndpoint(match.endpoint, match.params, options);
}

async function runEndpoint(
  endpoint: Endpoint,
  params: Record<string, string>,
  options: GlobalOptions,
): Promise<void> {
  validateEndpointOptions(endpoint, options);

  const suppliedBody = endpoint.method === "GET"
    ? undefined
    : buildBody(options, supportsProperties(endpoint));
  if (endpoint.pagination === "body" && suppliedBody !== undefined && (typeof suppliedBody !== "object" || suppliedBody === null || Array.isArray(suppliedBody))) throw new CliError("Search input must be a JSON object.");
  if (suppliedBody && typeof suppliedBody === "object" && !Array.isArray(suppliedBody)) {
    if (options.cursor && "after" in suppliedBody) throw new CliError("--cursor conflicts with after in request input.");
    if (options.pageSize && "limit" in suppliedBody) throw new CliError("--page-size conflicts with limit in request input.");
  }
  const body =
    endpoint.pagination === "body"
      ? {
          ...(suppliedBody && typeof suppliedBody === "object" && !Array.isArray(suppliedBody)
            ? suppliedBody
            : {}),
          ...(options.cursor ? { after: options.cursor } : {}),
          ...(options.pageSize ? { limit: options.pageSize } : {}),
        }
      : suppliedBody;
  if (endpoint.name.includes("batch-")) {
    if (!body || typeof body !== "object" || !("inputs" in body) || !Array.isArray(body.inputs) || body.inputs.length === 0) throw new CliError("Batch input requires a nonempty inputs array.");
    if (endpoint.name === "objects batch-archive" || endpoint.name === "objects batch-get") {
      if (body.inputs.some((item: unknown) => !item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !item.id)) throw new CliError("Each batch target requires a nonempty string id.");
    }
  }
  if (endpoint.mutation && ["POST", "PATCH", "PUT"].includes(endpoint.method) && !endpoint.name.endsWith("create-default") && body === undefined) throw new CliError("This mutation requires --file or changed fields.");
  const query: QueryEntry[] = endpoint.pagination === "query"
    ? [
        ...(options.cursor ? [["after", options.cursor] as const] : []),
        ...(options.pageSize ? [["limit", String(options.pageSize)] as const] : []),
      ]
    : [];
  const plan = buildRequestPlan({
    endpoint,
    params,
    options,
    context: loadRuntimeContext(options),
    query,
    body,
  });

  await requireMutationConfirmation(endpoint.name + " " + Object.values(params).join(" "), endpoint.mutation, options);
  if (options.verbose) printDiagnostic({ diagnostic: redact(renderDryRun(plan)) });
  if (options.dryRun) {
    printJson(redact(renderDryRun(plan)));
    return;
  }
  if (options.all && endpoint.pagination) {
    printResult(envelope(await executeAllPages(plan, endpoint.pagination, undefined, options.maxItems), true));
    return;
  }
  const response = await executeRequest(plan);
  if (response && typeof response === "object" && "errors" in response && Array.isArray(response.errors) && response.errors.length > 0) {
    throw new CliError("HubSpot returned partial results. Inspect completed results and errors before retrying.", "PARTIAL_FAILURE", 8, { partial: response });
  }
  if (endpoint.method === "GET" && !isCollection(endpoint) && response === null) throw new CliError("Requested resource was not returned", "NOT_FOUND", 5);
  printResult(envelope(response, isCollection(endpoint)));
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
    throw new CliError("Usage: hubspot api request <GET|POST|PUT|PATCH|DELETE> <path>");
  }
  if (options.all) throw new CliError("--all is available only for first-class paginated commands");
  if (method === "GET" && (options.yes || options.dryRun)) throw new CliError("--yes and --dry-run apply only to mutations.");

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

  await requireMutationConfirmation("api request " + method + " " + path, method !== "GET", options);
  if (options.verbose) printDiagnostic({ diagnostic: redact(renderDryRun(plan)) });
  if (options.dryRun) {
    printJson(redact(renderDryRun(plan)));
    return;
  }
  printResult(await executeRequest(plan));
}

async function runSetup(parsed: ParsedArgs): Promise<void> {
  const profileName =
    getString(parsed.flags, "profile") ?? parsed.command[1] ?? "default";
  if (parsed.command.length > 2) {
    throw new CliError("Usage: hubspot setup [profile] [options]");
  }

  const fromEnvironment = getBoolean(parsed.flags, "from-env");
  let accessToken = getString(parsed.flags, "access-token");
  if (fromEnvironment) {
    accessToken = accessToken ?? environmentValue("HUBSPOT_ACCESS_TOKEN");
  }
  if (!accessToken) {
    throw new CliError(
      "Setup needs an access token. Pass --access-token or use --from-env with HUBSPOT_ACCESS_TOKEN.", "CONFIGURATION_ERROR", 3,
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

  if (listProfiles().includes(profileName)) throw new CliError("Profile already exists; use profiles update.", "CONFLICT", 6);
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
        throw new CliError("Usage: hubspot profiles list");
      }
      printResult({ data: listProfiles(), meta: { active: getActiveProfileName() ?? null } });
      return;
    case "get":
      if (!name || parsed.command.length !== 3) {
        throw new CliError("Usage: hubspot profiles get <name>");
      }
      printJson(redact(showProfile(name)));
      return;
    case "create":
    case "update": {
      if (!name || parsed.command.length !== 3) {
        throw new CliError(`Usage: hubspot profiles ${action} <name> [options]`);
      }
      if (action === "create" && listProfiles().includes(name)) throw new CliError("Profile already exists; use profiles update.", "CONFLICT", 6);
      const fields = profileFieldsFromFlags(parsed);
      if (Object.keys(fields).length === 0) {
        throw new CliError(
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
        throw new CliError("Usage: hubspot profiles delete <name>");
      }
      deleteProfile(name);
      printJson({ deleted: name });
      return;
    case "use":
      if (!name || parsed.command.length !== 3) {
        throw new CliError("Usage: hubspot profiles use <name>");
      }
      requireProfile(name);
      setActiveProfileName(name);
      printJson({ active: name });
      return;
    default:
      throw new CliError(
        "Usage: hubspot profiles <list|get|create|update|delete|use>",
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
        throw new CliError("Usage: hubspot config path");
      }
      printJson({ configDir: configDir(), configPath: configPath() });
      return;
    case "list":
      if (parsed.command.length !== 2) {
        throw new CliError("Usage: hubspot config list");
      }
      printJson(redact(readConfig()));
      return;
    case "get":
      if (!key || parsed.command.length !== 3) {
        throw new CliError("Usage: hubspot config get <key>");
      }
      printJson({ key, value: configGet(key) ?? null });
      return;
    case "set":
      if (!key || value === undefined || parsed.command.length !== 4) {
        throw new CliError("Usage: hubspot config set <key> <value>");
      }
      printJson(redact(configSet(key, value)));
      return;
    case "unset":
      if (!key || parsed.command.length !== 3) {
        throw new CliError("Usage: hubspot config unset <key>");
      }
      printJson(redact(configUnset(key)));
      return;
    default:
      throw new CliError("Usage: hubspot config <path|list|get|set|unset>");
  }
}

async function runAuth(parsed: ParsedArgs, options: GlobalOptions): Promise<void> {
  const action = parsed.command[1];
  if (action !== "verify" || parsed.command.length !== 2) {
    throw new CliError("Usage: hubspot auth verify");
  }

  const match = findEndpoint(["account", "get"]);
  if (!match) throw new CliError("Account details endpoint is not registered");
  const plan = buildRequestPlan({
    endpoint: match.endpoint,
    params: match.params,
    options,
    context: loadRuntimeContext(options),
    query: [],
  });
  printResult(envelope(await executeRequest(plan), false));
}

function runCompletions(shell: string | undefined): void {
  const words = completionWords().join(" ");
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
        completionWords()
          .map((word) => `complete -c hubspot -f -a ${word}`)
          .join("\n"),
      );
      return;
    default:
      throw new CliError("Usage: hubspot completions <bash|zsh|fish>");
  }
}

function validateEndpointOptions(endpoint: Endpoint, options: GlobalOptions): void {
  if ((options.all || options.cursor || options.pageSize || options.maxItems) && !endpoint.pagination) {
    throw new CliError("Pagination options are not supported by " + JSON.stringify(endpoint.name));
  }
  if (options.maxItems && !options.all) throw new CliError("--max-items requires --all");
  if (options.query.some((entry) => entry.startsWith("limit=")) && options.pageSize) throw new CliError("--page-size conflicts with --query limit.");
  if (options.query.some((entry) => entry.startsWith("after=")) && options.cursor) throw new CliError("--cursor conflicts with --query after.");
  validateBodyOptions(endpoint.method, options, supportsProperties(endpoint));
}

function validateBodyOptions(
  method: HttpMethod,
  options: GlobalOptions,
  allowProperties: boolean,
): void {
  if (
    method === "GET" &&
    (options.file || options.set.length > 0 || options.properties.length > 0)
  ) {
    throw new CliError("GET commands do not accept --file, --set, or --property");
  }
  if (options.file && (options.set.length > 0 || options.properties.length > 0)) {
    throw new CliError("--file cannot be combined with --set or --property");
  }
  if (!allowProperties && options.properties.length > 0) {
    throw new CliError(
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
  const exact = readJsonBody(options.file);

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
  throw new CliError(
    `Unknown option "--${option.name}". Use --query for query parameters or --set for body fields.`,
  );
}

function assertAllowedFlags(
  parsed: ParsedArgs,
  allowed: readonly string[],
): void {
  const allowedSet = new Set([
    ...allowed,
    ...globalFlags,
  ]);
  for (const name of Object.keys(parsed.flags)) {
    if (!allowedSet.has(name)) {
      throw new CliError(`Option "--${name}" is not valid for this command`);
    }
  }
}

function supportsProperties(endpoint: Endpoint): boolean {
  return endpoint.name === "objects create" || endpoint.name === "objects update";
}

async function requireMutationConfirmation(
  commandName: string,
  mutation: boolean,
  options: GlobalOptions,
): Promise<void> {
  if (!mutation || options.yes || options.dryRun) return;
  const ci = process.env.CI;
  const nonInteractive = options.noInput || options.file === "-" || !process.stdin.isTTY ||
    (ci !== undefined && !["", "0", "false"].includes(ci.toLowerCase()));
  if (nonInteractive) {
    throw new CliError(`"${commandName}" changes HubSpot state. Re-run with --dry-run or --yes.`, "CONFIRMATION_REQUIRED", 9);
  }
  process.stderr.write(`Profile: ${options.profile ?? "active"}\nOperation: ${commandName}\nEffect: changes HubSpot state\n`);
  const input = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await input.question("Continue? [y/N] ");
    if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
      throw new CliError(`"${commandName}" changes HubSpot state and confirmation was declined.`, "CONFIRMATION_DECLINED", 9);
    }
  } finally {
    input.close();
  }
}


function envelope(value: unknown, collection: boolean): unknown {
  if (collection && value && typeof value === "object" && "results" in value && Array.isArray(value.results)) {
    const { results, paging, ...metadata } = value as { results: unknown[]; paging?: { next?: { after?: string | number } }; [key: string]: unknown };
    const next = paging?.next?.after;
    return { data: results, meta: { ...metadata, next_cursor: next === undefined ? null : String(next), has_more: next !== undefined } };
  }
  return { data: value, meta: {} };
}

function isCollection(endpoint: Endpoint): boolean {
  return endpoint.name.endsWith(" list") || endpoint.name.includes(" search") || endpoint.name.includes("batch-");
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
  return [
    "hubspot " + version(),
    "", "Usage:", "  hubspot <resource> <action> [identifier] [options]",
    "", "Commands:",
    ...Object.values(utilityCommands).map((item) => "  hubspot " + item.usage + "\n    " + item.description),
    ...endpoints.map((item) => "  hubspot " + canonicalUsage(item) + "\n    " + item.description),
    "", "Global options:",
    ...globalFlags.map((flag) => "  --" + flag + "  " + optionHelp[flag]),
    "  --help, -h  Local help", "  --version  Executable name and version",
    "", "Use <command> --help for its arguments, options, examples, and effects.",
  ].join("\n");
}

function commandHelp(command: readonly string[]): string {
  const name = command.join(" ");
  const matches = endpoints.filter((item) => item.name === name || item.name.startsWith(name + " ") || name.startsWith(item.name + " "));
  const utilities = Object.entries(utilityCommands).filter(([key]) => key === name || key.startsWith(name + " ") || name.startsWith(key + " "));
  if (!matches.length && !utilities.length) throw new CliError("Unknown command " + JSON.stringify(name) + ". Run hubspot --help.");
  return [
    ...matches.map((item) => [
      item.description, "", "Usage:", "  hubspot " + canonicalUsage(item),
      "", "Options:", ...[...globalFlags, ...endpointFlags(item)].map((flag) => "  --" + flag + "  " + optionHelp[flag]),
      "  --help, -h  Show this help.",
      "", "Output:", "  json/pretty: {data,meta}; human: table or labeled fields.",
      item.pagination ? "  One page by default; meta.next_cursor resumes and meta.has_more indicates continuation." : "  No client pagination options.",
      "", "Effects:", item.mutation ? "  Remote mutation; --yes or terminal confirmation required. Dry runs are local and write-free." : "  Read-only; no confirmation required.",
      "", "Examples:", "  hubspot " + canonicalUsage(item) + (item.mutation ? (endpointFlags(item).includes("file") ? " --file request.json --dry-run" : " --dry-run") : " --format pretty"),
      "", "Failures:", "  2 input; 3 auth/config; 4 permission; 5 missing; 6 conflict; 7 transient; 8 partial; 9 confirmation.",
    ].join("\n")),
    ...utilities.map(([, item]) => [
      item.description, "", "Usage:", "  hubspot " + item.usage,
      "", "Options:", ...[...globalFlags, ...item.flags].map((flag) => "  --" + flag + "  " + optionHelp[flag]),
      "", "Output:", name.startsWith("completions") ? "  Shell code as text; does not install or modify shell files." : "  json/pretty structured output; human presentation.",
      "", "Example:", "  hubspot " + item.usage + " --help",
      "", "Failures:", "  2 invalid input; 3 invalid configuration/authentication; 5 missing resource; 6 conflict.",
    ].join("\n")),
  ].join("\n\n");
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


function completionWords(): string[] {
  return [...new Set([
    ...topLevelWords(),
    ...Object.keys(utilityCommands).flatMap((name) => name.split(" ")),
    ...endpoints.flatMap((endpoint) => endpoint.name.split(" ")),
    ...Object.keys(optionHelp).map((name) => "--" + name),
    "--help", "--version", "json", "pretty", "human", "auto", "always", "never",
    ...listProfiles(),
  ])].sort();
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
    throw new CliError(`Package version is missing from ${packagePath}`);
  }
  return packageJson.version;
}




const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  process.once("SIGINT", () => process.exit(130));
  main().catch((error: unknown) => {
    printError(error);
    process.exitCode = asCliError(error).exitCode;
  });
}
