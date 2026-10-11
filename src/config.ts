import { CliError } from "./errors.js";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, isAbsolute } from "node:path";
import type { Profile } from "./types.js";
import { isRecord } from "./util.js";
import { redact } from "./values.js";

export interface AppConfig {
  readonly activeProfile?: string;
  readonly baseUrl?: string;
  readonly apiVersion?: string;
}

const configKeys = new Set(["activeProfile", "baseUrl", "apiVersion"]);
const writableConfigKeys = new Set(["baseUrl", "apiVersion"]);
const profileKeys = new Set(["accessToken", "baseUrl", "apiVersion"]);

export function configDir(): string {
  const configured = process.env.XDG_CONFIG_HOME;
  const base = configured && isAbsolute(configured) ? configured : join(homedir(), ".config");
  return join(base, "hubspot");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function profilesDir(): string {
  return join(configDir(), "profiles");
}

export function profilePath(name: string): string {
  assertProfileName(name);
  return join(profilesDir(), `${name}.json`);
}

export function readConfig(): AppConfig {
  const value = readJsonFile(configPath());
  if (value === undefined) return {};
  try { return validateConfig(value); }
  catch (error) { throw new CliError((error instanceof Error ? error.message : "Invalid configuration") + ". Check " + configPath() + ".", "CONFIGURATION_ERROR", 3); }
}

export function readProfile(name: string | undefined): Profile | undefined {
  if (!name) {
    return undefined;
  }
  const path = profilePath(name);
  const value = readJsonFile(path);
  if (value === undefined) return undefined;
  try { return validateProfile(value, path); }
  catch (error) { throw new CliError((error instanceof Error ? error.message : "Invalid profile") + ". Check " + path + ".", "CONFIGURATION_ERROR", 3); }
}

export function requireProfile(name: string): Profile {
  const profile = readProfile(name);
  if (!profile) {
    throw new CliError(`Profile "${name}" does not exist`, "NOT_FOUND", 5);
  }
  return profile;
}

export function writeProfile(name: string, profile: Profile): void {
  const path = profilePath(name);
  writeJsonFile(path, validateProfile(profile, path));
}

export function deleteProfile(name: string): void {
  const path = profilePath(name);
  if (!existsSync(path)) {
    throw new CliError(`Profile "${name}" does not exist`, "NOT_FOUND", 5);
  }
  rmSync(path);
  if (getActiveProfileName() === name) {
    const config = { ...readConfig() };
    delete config.activeProfile;
    writeJsonFile(configPath(), config);
  }
}

export function listProfiles(): string[] {
  if (!existsSync(profilesDir())) {
    return [];
  }
  return readdirSync(profilesDir())
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

export function resolveProfileName(
  requested: string | undefined,
): string | undefined {
  return requested ?? process.env.HUBSPOT_PROFILE ?? getActiveProfileName();
}

export function getActiveProfileName(): string | undefined {
  return readConfig().activeProfile;
}

export function setActiveProfileName(name: string): void {
  assertProfileName(name);
  writeJsonFile(configPath(), { ...readConfig(), activeProfile: name });
}

export function showProfile(name: string): unknown {
  return redact(requireProfile(name));
}

export function configGet(key: string): unknown {
  assertConfigKey(key, configKeys);
  return readConfig()[key as keyof AppConfig];
}

export function configSet(key: string, input: string): AppConfig {
  assertConfigKey(key, writableConfigKeys);
  const value =
    key === "baseUrl" ? validateBaseUrl(input) : validateApiVersion(input);
  const config = { ...readConfig(), [key]: value };
  writeJsonFile(configPath(), config);
  return config;
}

export function configUnset(key: string): AppConfig {
  assertConfigKey(key, writableConfigKeys);
  const config: Record<string, unknown> = { ...readConfig() };
  delete config[key];
  writeJsonFile(configPath(), config);
  return config;
}

export function validateBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CliError(
      "Invalid baseUrl. Use an absolute HTTP or HTTPS URL without credentials.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new CliError(
      "Invalid baseUrl. Use an absolute HTTP or HTTPS URL without credentials.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

export function validateApiVersion(input: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(input);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) {
    throw new CliError(
      `Invalid apiVersion "${input}". Use a date version such as 2026-03.`,
    );
  }
  return input;
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new CliError("Cannot read JSON configuration at " + path + ". Check permissions and JSON syntax.", "CONFIGURATION_ERROR", 3);
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(configDir(), 0o700);
  if (dirname(path) === profilesDir()) {
    chmodSync(profilesDir(), 0o700);
  }

  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function validateConfig(value: unknown): AppConfig {
  if (!isRecord(value)) {
    throw new CliError(`Configuration at ${configPath()} must be a JSON object`);
  }
  assertKnownKeys(value, configKeys, "configuration");

  const activeProfile = optionalString(value, "activeProfile", "configuration");
  if (activeProfile) {
    assertProfileName(activeProfile);
  }
  const baseUrl = optionalString(value, "baseUrl", "configuration");
  const apiVersion = optionalString(value, "apiVersion", "configuration");

  return {
    ...(activeProfile ? { activeProfile } : {}),
    ...(baseUrl ? { baseUrl: validateBaseUrl(baseUrl) } : {}),
    ...(apiVersion ? { apiVersion: validateApiVersion(apiVersion) } : {}),
  };
}

function validateProfile(value: unknown, path: string): Profile {
  if (!isRecord(value)) {
    throw new CliError(`Profile at ${path} must be a JSON object`);
  }
  assertKnownKeys(value, profileKeys, "profile");

  const accessToken = optionalString(value, "accessToken", "profile");
  const baseUrl = optionalString(value, "baseUrl", "profile");
  const apiVersion = optionalString(value, "apiVersion", "profile");

  return {
    ...(accessToken ? { accessToken } : {}),
    ...(baseUrl ? { baseUrl: validateBaseUrl(baseUrl) } : {}),
    ...(apiVersion ? { apiVersion: validateApiVersion(apiVersion) } : {}),
  };
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  kind: string,
): string | undefined {
  const field = value[key];
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== "string" || field.trim() === "") {
    throw new CliError(`${kind} field "${key}" must be a non-empty string`);
  }
  return field;
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  kind: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new CliError(`Unknown ${kind} key "${key}"`);
    }
  }
}

function assertConfigKey(
  key: string,
  allowed: ReadonlySet<string>,
): void {
  if (!allowed.has(key)) {
    throw new CliError(
      `Unknown configuration key "${key}". Valid keys: ${[...allowed].join(", ")}.`,
    );
  }
}

function assertProfileName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new CliError(
      `Invalid profile name "${name}". Use letters, numbers, periods, underscores, or hyphens.`,
    );
  }
}
