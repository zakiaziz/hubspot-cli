import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configPath,
  getActiveProfileName,
  profilePath,
  readProfile,
  setActiveProfileName,
  showProfile,
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
});
