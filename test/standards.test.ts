import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeAllPages, executeRequest, buildApiRequestPlan } from "../src/http.js";
import { getGlobalOptions, parseArgs } from "../src/args.js";
import { CliError } from "../src/errors.js";
import type { RequestPlan } from "../src/types.js";

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "hubspot-contract-")); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });
async function run(args: string[], stdin?: string) {
  const child = Bun.spawn([process.execPath, "src/cli.ts", ...args], {
    cwd: join(import.meta.dir, ".."),
    env: { PATH: process.env.PATH, XDG_CONFIG_HOME: home, CI: "1", HUBSPOT_ACCESS_TOKEN: "fake-secret" },
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]), stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, exit };
}
const plan: RequestPlan = { method: "GET", url: "http://localhost/items", headers: { Authorization: "Bearer fake-secret" }, auth: { token: "fake-secret", source: "test" }, timeoutMs: 1000 };

test("max-items without page-size requests remaining capacity, preserving continuation", async () => {
  const limits: string[] = [];
  const result = await executeAllPages(plan, "query", async (input) => {
    const url = new URL(String(input));
    limits.push(url.searchParams.get("limit")!);
    return Response.json({ results: [{ id: "1" }, { id: "2" }], paging: { next: { after: "2" } } });
  }, 2) as { results: unknown[]; paging: unknown };
  expect(limits).toEqual(["2"]);
  expect(result.results).toHaveLength(2);
  expect(result.paging).toEqual({ next: { after: "2" } });
});

test("raw paths cannot change origin", () => {
  expect(() => buildApiRequestPlan({
    method: "GET", path: "//attacker.invalid/secrets",
    options: getGlobalOptions(parseArgs(["--access-token", "fake"])),
    context: { baseUrl: "https://api.hubapi.com", apiVersion: "2026-03" }, query: [],
  })).toThrow("configured origin");
});

test("transport rejects redirects and maps network failures", async () => {
  await expect(executeRequest(plan, async (_url, init) => {
    expect(init?.redirect).toBe("error");
    return new Response(null, { status: 302, headers: { Location: "https://attacker.invalid" } });
  })).rejects.toMatchObject({ exitCode: 1 });
  await expect(executeRequest(plan, async () => { throw new TypeError("connection failed"); })).rejects.toMatchObject({ exitCode: 7 });
});

test("parse failures honor pretty/human while compact JSON never has ANSI", async () => {
  const pretty = await run(["profiles", "list", "--format", "pretty", "--timeout", "0s"]);
  expect(pretty.exit).toBe(2);
  expect(JSON.parse(pretty.stderr).error.code).toBe("INVALID_ARGUMENT");
  expect(pretty.stderr.split("\n").length).toBeGreaterThan(2);
  const human = await run(["profiles", "list", "--format", "human", "--format", "human"]);
  expect(human.exit).toBe(2);
  expect(human.stderr).toContain("Duplicate");
  expect(human.stderr.trim().startsWith("{")).toBe(false);
  const plain = await run(["profiles", "list", "--color", "always"]);
  expect(plain.exit).toBe(0);
  expect(plain.stdout.trim().split("\n")).toHaveLength(1);
  expect(plain.stdout).not.toContain("\x1b");
});

test("irrelevant scope flags fail before transport", async () => {
  for (const args of [
    ["owners", "list", "--type", "contacts"],
    ["api", "request", "GET", "/anything", "--cursor", "unused"],
    ["objects", "get", "1", "--type", "contacts", "--yes"],
  ]) {
    const result = await run(args);
    expect(result.exit).toBe(2);
    expect(result.stdout).toBe("");
  }
});

test("stdin JSON input works and cannot prompt", async () => {
  const body = JSON.stringify({ properties: { email: "test@example.com" } });
  const preview = await run(["objects", "create", "--type", "contacts", "--file", "-", "--dry-run"], body);
  expect(preview.exit).toBe(0);
  expect(JSON.parse(preview.stdout).data.body).toEqual(JSON.parse(body));
  expect(preview.stdout).not.toContain("fake-secret");
  const unconfirmed = await run(["objects", "create", "--type", "contacts", "--file", "-"], body);
  expect(unconfirmed.exit).toBe(9);
});

test("file/body conflicts and unsafe assignments fail explicitly", async () => {
  const path = join(home, "body.json");
  writeFileSync(path, JSON.stringify({ properties: {} }));
  const conflict = await run(["objects", "create", "--type", "contacts", "--file", path, "--property", "email=x", "--dry-run"]);
  expect(conflict.exit).toBe(2);
  const reserved = await run(["objects", "create", "--type", "contacts", "--set", "__proto__.polluted=true", "--dry-run"]);
  expect(reserved.exit).toBe(2);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("missing explicit profiles do not fall back to environment credentials", async () => {
  const result = await run(["owners", "list", "--profile", "missing"]);
  expect(result.exit).toBe(3);
  expect(JSON.parse(result.stderr).error.code).toBe("CONFIGURATION_ERROR");
});

test("batch partial responses retain outcomes and exit eight", async () => {
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ results: [{ id: "1" }], errors: [{ message: "second failed" }] }) });
  try {
    const file = join(home, "batch.json"); writeFileSync(file, JSON.stringify({ inputs: [{ id: "1" }, { id: "2" }] }));
    const result = await run(["objects", "batch-get", "--type", "contacts", "--file", file, "--base-url", server.url.toString()]);
    expect(result.exit).toBe(8);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.partial.results).toEqual([{ id: "1" }]);
  } finally { server.stop(true); }
});

test("typed errors distinguish expected failures from internal exceptions", () => {
  const error = new CliError("Authentication required", "AUTHENTICATION_FAILED", 3);
  expect(error.exitCode).toBe(3);
});

test("help accepts command identifiers without requiring authentication", async () => {
  for (const args of [["objects", "get", "123", "--type", "contacts"], ["profiles", "get", "work"]]) {
    const result = await run([...args, "--help"]);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("Usage:");
  }
});
