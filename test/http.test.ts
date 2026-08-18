import { describe, expect, test } from "bun:test";
import {
  buildRequestPlan,
  executeAllPages,
  executeRequest,
  renderDryRun,
} from "../src/http.js";
import { findEndpoint } from "../src/endpoints.js";
import type { GlobalOptions, RequestPlan } from "../src/types.js";

const options: GlobalOptions = {
  accessToken: "secret-token",
  set: [],
  query: [
    "properties=email",
    "properties=firstname",
  ],
  properties: [],
  yes: false,
  dryRun: true,
  all: false,
  json: false,
  help: false,
  version: false,
};

describe("HubSpot HTTP requests", () => {
  test("fills versioned paths and sends bearer authentication", () => {
    const match = findEndpoint(["objects", "get", "contacts", "123"]);
    expect(match).toBeDefined();

    const plan = buildRequestPlan({
      endpoint: match!.endpoint,
      params: match!.params,
      options,
      context: {
        baseUrl: "https://api.hubapi.com",
        apiVersion: "2026-03",
      },
      query: [["archived", "false"]],
    });

    const url = new URL(plan.url);
    expect(url.pathname).toBe("/crm/objects/2026-03/contacts/123");
    expect(url.searchParams.getAll("properties")).toEqual([
      "email",
      "firstname",
    ]);
    expect(url.searchParams.get("archived")).toBe("false");
    expect(plan.headers.Authorization).toBe("Bearer secret-token");
  });

  test("dry runs redact bearer tokens", () => {
    const dryRun = renderDryRun({
      method: "GET",
      url: "https://api.hubapi.com/account-info/2026-03/details",
      auth: { token: "secret-token", source: "--access-token" },
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret-token",
      },
    });

    expect(dryRun).toEqual({
      method: "GET",
      url: "https://api.hubapi.com/account-info/2026-03/details",
      auth: { source: "--access-token" },
      headers: {
        Accept: "application/json",
        Authorization: "[redacted]",
      },
      body: undefined,
    });
  });

  test("reports actionable HubSpot API errors", async () => {
    const plan = requestPlan("https://api.hubapi.com/crm/objects/2026-03/contacts");
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          status: "error",
          message: "Invalid property",
          category: "VALIDATION_ERROR",
          correlationId: "abc-123",
        }),
        {
          status: 400,
          statusText: "Bad Request",
          headers: { "content-type": "application/json" },
        },
      );

    await expect(executeRequest(plan, fetcher)).rejects.toThrow(
      "HubSpot API returned 400 Bad Request: Invalid property (category: VALIDATION_ERROR, correlationId: abc-123)",
    );
  });

  test("follows query cursors and combines result pages", async () => {
    const calls: string[] = [];
    const responses = [
      {
        results: [{ id: "1" }],
        paging: { next: { after: "2" } },
      },
      {
        results: [{ id: "2" }],
      },
    ];
    const fetcher = async (input: string | URL | Request) => {
      calls.push(String(input));
      return Response.json(responses.shift());
    };

    const result = await executeAllPages(
      requestPlan(
        "https://api.hubapi.com/crm/objects/2026-03/contacts?limit=1",
      ),
      "query",
      fetcher,
    );

    expect(result).toEqual({ results: [{ id: "1" }, { id: "2" }] });
    expect(new URL(calls[1]!).searchParams.get("after")).toBe("2");
  });

  test("follows body cursors for CRM searches", async () => {
    const bodies: unknown[] = [];
    const responses = [
      {
        total: 2,
        results: [{ id: "1" }],
        paging: { next: { after: "1" } },
      },
      {
        total: 2,
        results: [{ id: "2" }],
      },
    ];
    const fetcher = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
      return Response.json(responses.shift());
    };

    const result = await executeAllPages(
      {
        ...requestPlan(
          "https://api.hubapi.com/crm/objects/2026-03/contacts/search",
        ),
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        },
        body: { query: "zaki", limit: 1 },
      },
      "body",
      fetcher,
    );

    expect(result).toEqual({
      total: 2,
      results: [{ id: "1" }, { id: "2" }],
    });
    expect(bodies).toEqual([
      { query: "zaki", limit: 1 },
      { query: "zaki", limit: 1, after: "1" },
    ]);
  });
});

function requestPlan(url: string): RequestPlan {
  return {
    method: "GET",
    url,
    auth: { token: "secret-token", source: "--access-token" },
    headers: {
      Accept: "application/json",
      Authorization: "Bearer secret-token",
    },
  };
}
