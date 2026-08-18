import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyAssignments,
  assignmentsToQueryEntries,
  mergeBody,
  parseValue,
  propertyAssignmentsToBody,
  readJsonBody,
  redact,
  setPath,
} from "../src/values.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("HubSpot request values", () => {
  test("keeps CRM property values as strings", () => {
    expect(propertyAssignmentsToBody(["email=zaki@example.com", "amount=1000", "active=false"])).toEqual({
      properties: {
        email: "zaki@example.com",
        amount: "1000",
        active: "false",
      },
    });
  });

  test("uses typed JSON values for general body assignments", () => {
    const body: Record<string, unknown> = {};
    applyAssignments(body, [
      "limit=200",
      "filterGroups=[{\"filters\":[{\"propertyName\":\"email\",\"operator\":\"EQ\",\"value\":\"zaki@example.com\"}]}]",
    ]);

    expect(body).toEqual({
      limit: 200,
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: "zaki@example.com",
            },
          ],
        },
      ],
    });
  });

  test("redacts API credentials", () => {
    expect(redact({ hapikey: "secret", apiKey: "secret", label: "safe" })).toEqual({
      hapikey: "[redacted]",
      apiKey: "[redacted]",
      label: "safe",
    });
  });

  test("preserves duplicate exact query parameters", () => {
    expect(assignmentsToQueryEntries(["properties=email", "properties=firstname", "after=001"])).toEqual([
      ["properties", "email"],
      ["properties", "firstname"],
      ["after", "001"],
    ]);
  });

  test("merges exact bodies with generated fields", () => {
    expect(
      mergeBody(
        { properties: { email: "old@example.com" }, traceId: "abc" },
        { properties: { email: "new@example.com", firstname: "Zaki" } },
      ),
    ).toEqual({
      properties: { email: "new@example.com", firstname: "Zaki" },
      traceId: "abc",
    });
  });

  test("reads object and array bodies from literals and files", () => {
    expect(readJsonBody(undefined)).toBeUndefined();
    expect(readJsonBody('{"active":true}')).toEqual({ active: true });

    const directory = mkdtempSync(join(tmpdir(), "hubspot-values-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "body.json");
    writeFileSync(path, "[1,2]\n");
    expect(readJsonBody(`@${path}`)).toEqual([1, 2]);
    expect(() => readJsonBody("42")).toThrow(
      "Body must be a JSON object or array",
    );
  });

  test("parses JSON-compatible assignment values", () => {
    expect(parseValue('{"nested":[true,null,1.5]}')).toEqual({
      nested: [true, null, 1.5],
    });
    expect(parseValue("plain text")).toBe("plain text");
  });

  test("preserves array bodies and rejects generated fields for them", () => {
    expect(mergeBody([1, 2], {})).toEqual([1, 2]);
    expect(() => mergeBody([1, 2], { limit: 10 })).toThrow(
      "Cannot merge generated fields into an array body",
    );
  });

  test("redacts nested arrays and preserves primitive values", () => {
    expect(redact([{ accessToken: "secret" }, "safe", null])).toEqual([
      { accessToken: "[redacted]" },
      "safe",
      null,
    ]);
  });

  test("sets nested paths and rejects empty paths", () => {
    const target: Record<string, unknown> = { filters: "replace" };
    setPath(target, "filters.primary.value", "test");
    expect(target).toEqual({
      filters: { primary: { value: "test" } },
    });
    expect(() => setPath({}, ".", "value")).toThrow(
      "Assignment path cannot be empty",
    );
  });

  test("rejects malformed assignments by kind", () => {
    expect(() => applyAssignments({}, ["missing"])).toThrow(
      'Invalid assignment "missing"',
    );
    expect(() => propertyAssignmentsToBody(["missing"])).toThrow(
      'Invalid property "missing"',
    );
    expect(() => assignmentsToQueryEntries(["missing"])).toThrow(
      'Invalid query "missing"',
    );
  });
});
