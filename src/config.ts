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
import { dirname, join } from "node:path";
import type { Profile } from "./types.js";
import { parseValue, redact, setPath } from "./values.js";

export interface AppConfig {
  readonly activeProfile?: string;
  readonly baseUrl?: string;
  readonly apiVersion?: string;
  readonly [key: string]: unknown;
}

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
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
  return readJsonFile<AppConfig>(configPath()) ?? {};
}

export function readProfile(name: string | undefined): Profile | undefined {
  if (!name) {
    return undefined;
  }
  return readJsonFile<Profile>(profilePath(name));
}

export function requireProfile(name: string): Profile {
  const profile = readProfile(name);
  if (!profile) {
    throw new Error(`Profile "${name}" does not exist`);
  }
  return profile;
}

export function writeProfile(name: string, profile: Profile): void {
  writeJsonFile(profilePath(name), profile);
}

export function deleteProfile(name: string): void {
  const path = profilePath(name);
  if (!existsSync(path)) {
    throw new Error(`Profile "${name}" does not exist`);
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

export function resolveProfileName(requested: string | undefined): string | undefined {
  return requested ?? process.env.HUBSPOT_PROFILE ?? getActiveProfileName();
}

export function getActiveProfileName(): string | undefined {
  const value = readConfig().activeProfile;
  return typeof value === "string" ? value : undefined;
}

export function setActiveProfileName(name: string): void {
  assertProfileName(name);
  writeJsonFile(configPath(), { ...readConfig(), activeProfile: name });
}

export function showProfile(name: string): unknown {
  return redact(requireProfile(name));
}

export function configGet(path: string): unknown {
  let cursor: unknown = readConfig();
  for (const part of path.split(".").filter(Boolean)) {
    if (!isObject(cursor)) {
      return undefined;
    }
    cursor = cursor[part];
  }
  return cursor;
}

export function configSet(path: string, input: string): AppConfig {
  const config: Record<string, unknown> = { ...readConfig() };
  setPath(config, path, parseValue(input));
  writeJsonFile(configPath(), config);
  return config;
}

export function configUnset(path: string): AppConfig {
  const config: Record<string, unknown> = { ...readConfig() };
  deletePath(config, path);
  writeJsonFile(configPath(), config);
  return config;
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `Cannot read JSON configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
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

function assertProfileName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(
      `Invalid profile name "${name}". Use letters, numbers, periods, underscores, or hyphens.`,
    );
  }
}

function deletePath(target: Record<string, unknown>, path: string): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Configuration path cannot be empty");
  }

  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!isObject(next)) {
      return;
    }
    cursor = next;
  }
  delete cursor[parts.at(-1) as string];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
