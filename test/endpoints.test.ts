import { describe, expect, test } from "bun:test";
import { endpoints, findEndpoint } from "../src/endpoints.js";

describe("HubSpot endpoint registry", () => {
  test("covers the common CRM API groups", () => {
    const topLevel = new Set(endpoints.map((endpoint) => endpoint.pattern[0]));

    for (const group of [
      "objects",
      "properties",
      "owners",
      "pipelines",
      "stages",
      "associations",
      "schemas",
      "account",
    ]) {
      expect(topLevel.has(group)).toBe(true);
    }
  });

  test("matches generic object types and record identifiers", () => {
    const match = findEndpoint(["objects", "get", "2-12345", "67890"]);

    expect(match?.endpoint.path).toBe(
      "/crm/objects/:apiVersion/:objectType/:recordId",
    );
    expect(match?.params).toEqual({
      objectType: "2-12345",
      recordId: "67890",
    });
  });

  test("uses date-versioned HubSpot paths", () => {
    expect(findEndpoint(["owners", "list"])?.endpoint.path).toBe(
      "/crm/owners/:apiVersion",
    );
    expect(findEndpoint(["schemas", "list"])?.endpoint.path).toBe(
      "/crm-object-schemas/:apiVersion/schemas",
    );
  });

  test("marks state-changing commands as mutations", () => {
    expect(
      findEndpoint(["objects", "update", "contacts", "123"])?.endpoint.mutation,
    ).toBe(true);
    expect(
      findEndpoint([
        "associations",
        "delete",
        "contacts",
        "123",
        "companies",
        "456",
      ])?.endpoint.mutation,
    ).toBe(true);
    expect(findEndpoint(["objects", "list", "contacts"])?.endpoint.mutation).toBe(
      false,
    );
  });

  test("keeps POST-based reads safe without mutation confirmation", () => {
    expect(
      findEndpoint(["objects", "search", "contacts"])?.endpoint.mutation,
    ).toBe(false);
    expect(
      findEndpoint(["objects", "batch-read", "contacts"])?.endpoint.mutation,
    ).toBe(false);
    expect(
      findEndpoint([
        "associations",
        "batch-read",
        "contacts",
        "companies",
      ])?.endpoint.mutation,
    ).toBe(false);
  });

  test("identifies cursor pagination location", () => {
    expect(findEndpoint(["objects", "list", "contacts"])?.endpoint.pagination).toBe(
      "query",
    );
    expect(
      findEndpoint(["objects", "search", "contacts"])?.endpoint.pagination,
    ).toBe("body");
  });

  test("does not match unknown or incomplete commands", () => {
    expect(findEndpoint(["unknown"])).toBeUndefined();
    expect(
      findEndpoint(["objects", undefined, "contacts"] as unknown as string[]),
    ).toBeUndefined();
  });
});
