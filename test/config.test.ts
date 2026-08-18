import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  configPath,
  configGet,
  configSet,
  configUnset,
  deleteProfile,
  getActiveProfileName,
  listProfiles,
  profilePath,
  readConfig,
  readProfile,
  requireProfile,
  setActiveProfileName,
  showProfile,
  validateBaseUrl,
  writeProfile,
} from "../src/config.js";

let temporaryDirectory: string;
let previousConfigHome: string | undefined;

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "hubspot-cli-test-"));
  previousConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = temporaryDirectory;
});

afterEach(() => {
  if (previousConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = previousConfigHome;
  }
  chmodSync(temporaryDirectory, 0o700);
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("profile configuration", () => {
  test("writes credentials with owner-only permissions", () => {
    writeProfile("work", {
      accessToken: "secret-token",
      apiVersion: "2026-03",
    });
    setActiveProfileName("work");

    expect(readProfile("work")).toEqual({
      accessToken: "secret-token",
      apiVersion: "2026-03",
    });
    expect(getActiveProfileName()).toBe("work");
    expect(statSync(profilePath("work")).mode & 0o777).toBe(0o600);
    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  test("redacts access tokens when showing profiles", () => {
    writeProfile("work", { accessToken: "secret-token" });

    expect(showProfile("work")).toEqual({ accessToken: "[redacted]" });
  });

  test("rejects profile names that can escape the configuration directory", () => {
    expect(() => profilePath("../work")).toThrow("Invalid profile name");
  });

  test("rejects invalid profile fields before writing credentials", () => {
    expect(() =>
      writeProfile("work", {
        accessToken: "secret-token",
        baseUrl: "javascript:alert(1)",
      }),
    ).toThrow('Invalid baseUrl "javascript:alert(1)"');
    expect(() =>
      writeProfile("work", {
        accessToken: "secret-token",
        apiVersion: "v3",
      }),
    ).toThrow('Invalid apiVersion "v3"');
  });

  test("rejects unknown and invalid global configuration", () => {
    expect(() => configSet("unknown", "value")).toThrow(
      'Unknown configuration key "unknown"',
    );
    expect(() => configSet("apiVersion", "v3")).toThrow(
      'Invalid apiVersion "v3"',
    );

    mkdirSync(dirname(configPath()), { recursive: true });
    writeFileSync(configPath(), '{"unexpected":true}\n');
    expect(() => readConfig()).toThrow(
      'Unknown configuration key "unexpected"',
    );
  });

  test("manages the complete profile and configuration lifecycle", () => {
    expect(listProfiles()).toEqual([]);
    expect(() => requireProfile("missing")).toThrow(
      'Profile "missing" does not exist',
    );

    writeProfile("zeta", { accessToken: "zeta-token" });
    writeProfile("alpha", { accessToken: "alpha-token" });
    expect(listProfiles()).toEqual(["alpha", "zeta"]);

    setActiveProfileName("zeta");
    expect(configGet("activeProfile")).toBe("zeta");
    expect(configSet("baseUrl", "https://example.test/")).toMatchObject({
      activeProfile: "zeta",
      baseUrl: "https://example.test",
    });
    expect(configSet("apiVersion", "2027-09")).toMatchObject({
      apiVersion: "2027-09",
    });
    expect(configUnset("baseUrl")).not.toHaveProperty("baseUrl");

    deleteProfile("alpha");
    expect(listProfiles()).toEqual(["zeta"]);
    deleteProfile("zeta");
    expect(getActiveProfileName()).toBeUndefined();
    expect(() => deleteProfile("zeta")).toThrow(
      'Profile "zeta" does not exist',
    );
  });

  test("rejects malformed configuration files and field types", () => {
    expect(() => validateBaseUrl("not-a-url")).toThrow(
      'Invalid baseUrl "not-a-url"',
    );
    expect(() => validateBaseUrl("https://user:pass@example.test")).toThrow(
      "without credentials",
    );

    mkdirSync(dirname(configPath()), { recursive: true });
    writeFileSync(configPath(), "not-json\n");
    expect(() => readConfig()).toThrow("Cannot read JSON configuration");

    writeFileSync(configPath(), "[]\n");
    expect(() => readConfig()).toThrow("must be a JSON object");

    mkdirSync(dirname(profilePath("invalid")), { recursive: true });
    writeFileSync(profilePath("invalid"), "[]\n");
    expect(() => readProfile("invalid")).toThrow("must be a JSON object");

    writeFileSync(profilePath("invalid"), '{"accessToken":42}\n');
    expect(() => readProfile("invalid")).toThrow(
      'profile field "accessToken" must be a non-empty string',
    );
  });
});
