import {
  readConfig,
  readProfile,
  resolveProfileName,
  validateApiVersion,
  validateBaseUrl,
} from "./config.js";
import type {
  GlobalOptions,
  Profile,
  ResolvedAuth,
} from "./types.js";
import { environmentValue } from "./util.js";

export interface RuntimeContext {
  readonly profileName?: string;
  readonly profile?: Profile;
  readonly baseUrl: string;
  readonly apiVersion: string;
}

export function loadRuntimeContext(options: GlobalOptions): RuntimeContext {
  const profileName = resolveProfileName(options.profile);
  const profile = readProfile(profileName);
  const config = readConfig();
  const baseUrl =
    options.baseUrl ??
    environmentValue("HUBSPOT_BASE_URL") ??
    profile?.baseUrl ??
    config.baseUrl ??
    "https://api.hubapi.com";
  const apiVersion =
    options.apiVersion ??
    environmentValue("HUBSPOT_API_VERSION") ??
    profile?.apiVersion ??
    config.apiVersion ??
    "2026-03";

  return {
    profileName,
    profile,
    baseUrl: validateBaseUrl(baseUrl),
    apiVersion: validateApiVersion(apiVersion),
  };
}

export function resolveAccessToken(
  options: GlobalOptions,
  context: RuntimeContext,
): ResolvedAuth {
  if (options.accessToken) {
    return { token: options.accessToken, source: "--access-token" };
  }
  const environmentToken = environmentValue("HUBSPOT_ACCESS_TOKEN");
  if (environmentToken) {
    return {
      token: environmentToken,
      source: "HUBSPOT_ACCESS_TOKEN",
    };
  }
  if (context.profile?.accessToken) {
    return {
      token: context.profile.accessToken,
      source: `profile:${context.profileName}`,
    };
  }
  return {};
}

export function requireAccessToken(
  auth: ResolvedAuth,
  commandName: string,
): Required<ResolvedAuth> {
  if (auth.token && auth.source) {
    return { token: auth.token, source: auth.source };
  }

  throw new Error(
    `Missing access token for "${commandName}". Use --access-token, HUBSPOT_ACCESS_TOKEN, or run hubspot setup.`,
  );
}
