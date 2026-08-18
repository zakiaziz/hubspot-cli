import { afterEach, describe, expect, test } from "bun:test";
import {
  loadRuntimeContext,
  requireAccessToken,
  resolveAccessToken,
} from "../src/auth.js";
import type { GlobalOptions } from "../src/types.js";

const baseOptions: GlobalOptions = {
  set: [],
  query: [],
  properties: [],
  yes: false,
  dryRun: false,
  all: false,
  json: false,
  help: false,
  version: false,
};

const previousAccessToken = process.env.HUBSPOT_ACCESS_TOKEN;
const previousBaseUrl = process.env.HUBSPOT_BASE_URL;
const previousApiVersion = process.env.HUBSPOT_API_VERSION;

afterEach(() => {
  restoreEnvironment("HUBSPOT_ACCESS_TOKEN", previousAccessToken);
  restoreEnvironment("HUBSPOT_BASE_URL", previousBaseUrl);
  restoreEnvironment("HUBSPOT_API_VERSION", previousApiVersion);
});

describe("HubSpot authentication", () => {
  test("resolves access tokens from flags before environment and profiles", () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "environment-token";

    expect(
      resolveAccessToken(
        { ...baseOptions, accessToken: "flag-token" },
        {
          baseUrl: "https://api.hubapi.com",
          apiVersion: "2026-03",
          profileName: "work",
          profile: { accessToken: "profile-token" },
        },
      ),
    ).toEqual({ token: "flag-token", source: "--access-token" });
  });

  test("resolves environment tokens before profiles", () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "environment-token";

    expect(
      resolveAccessToken(baseOptions, {
        baseUrl: "https://api.hubapi.com",
        apiVersion: "2026-03",
        profileName: "work",
        profile: { accessToken: "profile-token" },
      }),
    ).toEqual({
      token: "environment-token",
      source: "HUBSPOT_ACCESS_TOKEN",
    });
  });

  test("reports every supported token source when authentication is missing", () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;

    expect(() =>
      requireAccessToken(
        resolveAccessToken(baseOptions, {
          baseUrl: "https://api.hubapi.com",
          apiVersion: "2026-03",
        }),
        "objects list",
      ),
    ).toThrow(
      'Missing access token for "objects list". Use --access-token, HUBSPOT_ACCESS_TOKEN, or run hubspot setup.',
    );
  });

  test("uses documented API defaults and environment overrides", () => {
    process.env.HUBSPOT_BASE_URL = "https://example.test";
    process.env.HUBSPOT_API_VERSION = "2027-09";

    expect(loadRuntimeContext(baseOptions)).toMatchObject({
      baseUrl: "https://example.test",
      apiVersion: "2027-09",
    });
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
