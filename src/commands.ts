import { CliError } from "./errors.js";
import { endpoints } from "./endpoints.js";
import type { Endpoint, ParsedArgs } from "./types.js";
import { getString } from "./args.js";

export const globalFlags = ["profile", "format", "color", "quiet", "verbose", "no-input", "timeout"];
export const authFlags = ["access-token", "base-url", "api-version"];
export const utilityCommands: Record<string, { usage: string; description: string; flags: string[] }> = {
  setup: { usage: "setup [profile] [--from-env]", description: "Create and activate a profile; existing profiles require profiles update.", flags: [...authFlags, "from-env"] },
  "profiles list": { usage: "profiles list", description: "List saved profile names and the active profile.", flags: [] },
  "profiles get": { usage: "profiles get <name>", description: "Read a profile with secrets redacted.", flags: [] },
  "profiles create": { usage: "profiles create <name>", description: "Create a saved profile.", flags: authFlags },
  "profiles update": { usage: "profiles update <name>", description: "Update supplied profile fields.", flags: authFlags },
  "profiles delete": { usage: "profiles delete <name>", description: "Delete a local profile and clear its active selection.", flags: [] },
  "profiles use": { usage: "profiles use <name>", description: "Select a saved profile.", flags: [] },
  "config list": { usage: "config list", description: "Read global configuration.", flags: [] },
  "config path": { usage: "config path", description: "Print configuration paths.", flags: [] },
  "config get": { usage: "config get <key>", description: "Read a configuration value.", flags: [] },
  "config set": { usage: "config set <key> <value>", description: "Set baseUrl or apiVersion.", flags: [] },
  "config unset": { usage: "config unset <key>", description: "Remove baseUrl or apiVersion.", flags: [] },
  "auth verify": { usage: "auth verify", description: "Verify access to account details; this does not prove all endpoint permissions.", flags: authFlags },
  "api request": { usage: "api request <GET|POST|PUT|PATCH|DELETE> <path>", description: "Send a raw same-origin JSON API request.", flags: [...authFlags, "file", "set", "query", "yes", "dry-run"] },
  "completions bash": { usage: "completions bash", description: "Print Bash completion code.", flags: [] },
  "completions zsh": { usage: "completions zsh", description: "Print Zsh completion code.", flags: [] },
  "completions fish": { usage: "completions fish", description: "Print Fish completion code.", flags: [] },
};

export function scopeFlag(endpoint: Endpoint, parameter: string): string | undefined {
  const resource = endpoint.pattern[0];
  if (["objects", "properties", "pipelines", "stages"].includes(resource ?? "") && parameter === ":objectType") return "type";
  if (resource === "stages" && parameter === ":pipelineId") return "pipeline-id";
  if (resource === "associations" || resource === "association-labels") {
    return ({ ":fromObjectType": "from-type", ":fromObjectId": "from-id", ":toObjectType": "to-type", ":toObjectId": "to-id" } as Record<string, string>)[parameter];
  }
  return undefined;
}

export function endpointFlags(endpoint: Endpoint): string[] {
  return [
    ...authFlags, "query",
    ...endpoint.pattern.flatMap((part) => scopeFlag(endpoint, part) ? [scopeFlag(endpoint, part)!] : []),
    ...(!["GET", "DELETE"].includes(endpoint.method) ? ["file", "set"] : []),
    ...(["objects create", "objects update"].includes(endpoint.name) ? ["property"] : []),
    ...(endpoint.pagination ? ["all", "cursor", "page-size", "max-items"] : []),
    ...(endpoint.mutation ? ["yes", "dry-run"] : []),
  ];
}

export function canonicalUsage(endpoint: Endpoint): string {
  const positional = endpoint.pattern.filter((part) => !scopeFlag(endpoint, part))
    .map((part) => part.startsWith(":") ? "<" + part.slice(1) + ">" : part);
  const scoped = endpoint.pattern.flatMap((part) => {
    const flag = scopeFlag(endpoint, part);
    return flag ? ["--" + flag + " <" + flag + ">"] : [];
  });
  return [...positional, ...scoped].join(" ");
}

export function resolveCommand(parsed: ParsedArgs): { endpoint: Endpoint; params: Record<string, string> } {
  const endpoint = endpoints.find((item) => {
    const prefix = item.pattern.filter((part) => !part.startsWith(":"));
    return prefix.every((part, index) => parsed.command[index] === part);
  });
  if (!endpoint) throw new CliError("Unknown or incomplete command. Run hubspot --help.");
  const prefix = endpoint.pattern.filter((part) => !part.startsWith(":"));
  const positionals = parsed.command.slice(prefix.length);
  const params: Record<string, string> = {};
  for (const part of endpoint.pattern.filter((part) => part.startsWith(":"))) {
    const flag = scopeFlag(endpoint, part);
    const value = flag ? getString(parsed.flags, flag) : positionals.shift();
    if (value === undefined || value === "") throw new CliError("Missing " + (flag ? "--" + flag : part.slice(1)) + ". Usage: hubspot " + canonicalUsage(endpoint));
    params[part.slice(1)] = value;
  }
  if (positionals.length) throw new CliError("Unexpected argument. Usage: hubspot " + canonicalUsage(endpoint));
  return { endpoint, params };
}

export const optionHelp: Record<string, string> = {
  profile: "NAME; saved profile, otherwise HUBSPOT_PROFILE or active profile",
  format: "json|pretty|human; default json, compact and uncolored",
  color: "auto|always|never; default auto, presentation formats only",
  quiet: "Alias -q. Suppress notices; preserve results and errors",
  verbose: "Alias -v. Redacted request diagnostics on stderr",
  "no-input": "Never prompt; automatically enforced in CI or nonterminal input",
  timeout: "DURATION; default 30s, positive ms/s/m, maximum 2147483647ms",
  "access-token": "TOKEN; prefer HUBSPOT_ACCESS_TOKEN to avoid shell history",
  "base-url": "URL; default https://api.hubapi.com, no cross-origin paths or redirects",
  "api-version": "YYYY-MM; default 2026-03",
  type: "OBJECT_TYPE; required, standard name or custom type ID",
  "pipeline-id": "PIPELINE_ID; required pipeline scope",
  "from-type": "OBJECT_TYPE; required source type",
  "from-id": "ID; required source record",
  "to-type": "OBJECT_TYPE; required destination type",
  "to-id": "ID; required destination record",
  file: "PATH; complete provider JSON body; - reads stdin; conflicts with --set/--property",
  set: "PATH=VALUE; repeatable typed JSON fields; null and empty strings remain distinct",
  property: "NAME=VALUE; repeatable CRM strings, including an explicit empty string",
  query: "NAME=VALUE; repeatable exact provider query parameters",
  all: "Follow all pages; default one page",
  cursor: "TOKEN; opaque continuation from meta.next_cursor",
  "page-size": "N; positive provider page size; defaults to an implicit bounded size of 100",
  "max-items": "N; total bound; requires --all; continuation remains resumable",
  yes: "Supply remote mutation confirmation",
  "dry-run": "Local validation and redacted preview; no requests or writes",
  "from-env": "Read setup values from HUBSPOT_* environment variables",
};
