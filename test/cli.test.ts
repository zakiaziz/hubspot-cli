import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "cli.ts",
);

let configHome: string;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), "hubspot-cli-e2e-"));
});

afterEach(() => {
  chmodSync(configHome, 0o700);
  rmSync(configHome, { recursive: true, force: true });
});

describe("hubspot CLI", () => {
  test("dry-runs record creation with string property values", async () => {
    const result = await runCli([
      "objects",
      "create",
      "contacts",
      "--access-token",
      "secret-token",
      "--property",
      "email=zaki@example.com",
      "--property",
      "annualrevenue=1000",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      method: "POST",
      url: "https://api.hubapi.com/crm/objects/2026-03/contacts",
      auth: { source: "--access-token" },
      headers: {
        Accept: "application/json",
        Authorization: "[redacted]",
        "Content-Type": "application/json",
      },
      body: {
        properties: {
          email: "zaki@example.com",
          annualrevenue: "1000",
        },
      },
    });
  });

  test("requires explicit confirmation for mutations", async () => {
    const result = await runCli([
      "objects",
      "archive",
      "contacts",
      "123",
      "--access-token",
      "secret-token",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      '"objects archive" changes HubSpot state. Re-run with --dry-run or --yes.',
    );
  });

  test("supports PATCH and duplicate query values through raw API access", async () => {
    const result = await runCli([
      "api",
      "request",
      "PATCH",
      "/crm/objects/2026-03/contacts/123",
      "--access-token",
      "secret-token",
      "--query",
      "properties=email",
      "--query",
      "properties=firstname",
      "--set",
      "properties.email=zaki@example.com",
      "--dry-run",
    ]);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const url = new URL(output.url);
    expect(url.searchParams.getAll("properties")).toEqual([
      "email",
      "firstname",
    ]);
    expect(output.method).toBe("PATCH");
    expect(output.body).toEqual({
      properties: { email: "zaki@example.com" },
    });
  });

  test("sets up and selects a profile from environment configuration", async () => {
    const setup = await runCli(["setup", "work", "--from-env"], {
      HUBSPOT_ACCESS_TOKEN: "environment-token",
      HUBSPOT_API_VERSION: "2026-03",
    });

    expect(setup.exitCode).toBe(0);
    expect(JSON.parse(setup.stdout)).toMatchObject({
      profile: "work",
      active: true,
    });

    const shown = await runCli(["profiles", "show", "work"]);
    expect(shown.exitCode).toBe(0);
    expect(JSON.parse(shown.stdout)).toEqual({
      accessToken: "[redacted]",
      apiVersion: "2026-03",
    });
  });

  test("verifies authentication against account details", async () => {
    let authorization: string | null = null;
    let pathname = "";
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        authorization = request.headers.get("authorization");
        pathname = new URL(request.url).pathname;
        return Response.json({
          portalId: 123,
          accountType: "STANDARD",
        });
      },
    });

    try {
      const result = await runCli([
        "auth",
        "verify",
        "--access-token",
        "secret-token",
        "--base-url",
        server.url.toString(),
      ]);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        portalId: 123,
        accountType: "STANDARD",
      });
      expect(authorization).toBe("Bearer secret-token");
      expect(pathname).toBe("/account-info/2026-03/details");
    } finally {
      server.stop(true);
    }
  });

  test("prints help and version without authentication", async () => {
    const help = await runCli(["--help"]);
    const version = await runCli(["--version"]);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("hubspot objects list <objectType>");
    expect(help.stdout).toContain("hubspot api request <method> <path>");
    expect(version.stdout.trim()).toBe("0.1.0");
  });
});

async function runCli(
  args: readonly string[],
  environment: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const processHandle = Bun.spawn([process.execPath, cli, ...args], {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      HUBSPOT_ACCESS_TOKEN: "",
      HUBSPOT_BASE_URL: "",
      HUBSPOT_API_VERSION: "",
      ...environment,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);

  return { exitCode, stdout, stderr };
}
