import { describe, expect, test } from "bun:test";
import { getGlobalOptions, getString, parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  test("separates commands, known flags, and command fields", () => {
    const parsed = parseArgs([
      "objects",
      "create",
      "contacts",
      "--profile",
      "work",
      "--property",
      "email=zaki@example.com",
      "--property",
      "lifecyclestage=customer",
      "--set",
      "associations=[{\"to\":{\"id\":\"123\"}}]",
      "--dry-run",
    ]);

    expect(parsed.command).toEqual(["objects", "create", "contacts"]);
    expect(getGlobalOptions(parsed).profile).toBe("work");
    expect(getGlobalOptions(parsed).properties).toEqual([
      "email=zaki@example.com",
      "lifecyclestage=customer",
    ]);
    expect(getGlobalOptions(parsed).set).toEqual([
      "associations=[{\"to\":{\"id\":\"123\"}}]",
    ]);
    expect(getGlobalOptions(parsed).dryRun).toBe(true);
  });

  test("supports exact repeated query parameters and all-page output", () => {
    const parsed = parseArgs([
      "objects",
      "list",
      "contacts",
      "--query",
      "properties=email",
      "--query",
      "properties=firstname",
      "--all",
    ]);

    expect(getGlobalOptions(parsed).query).toEqual([
      "properties=email",
      "properties=firstname",
    ]);
    expect(getGlobalOptions(parsed).all).toBe(true);
  });

  test("captures unrecognized flags for validation", () => {
    const parsed = parseArgs(["objects", "list", "contacts", "--properties", "email,name", "--archived=false"]);

    expect(parsed.unknownFlags).toEqual([
      { name: "properties", value: "email,name" },
      { name: "archived", value: "false" },
    ]);
    expect(parseArgs(["objects", "list", "contacts", "--archived"]).unknownFlags).toEqual([
      { name: "archived", value: true },
    ]);
  });

  test("rejects missing values for known value flags", () => {
    expect(() => parseArgs(["objects", "list", "contacts", "--profile"])).toThrow(
      "Missing value for --profile",
    );
  });

  test("stops option parsing after the terminator", () => {
    expect(
      parseArgs(["api", "request", "GET", "/test", "--", "--literal"]),
    ).toMatchObject({
      command: ["api", "request", "GET", "/test", "--literal"],
      unknownFlags: [],
    });
  });

  test("normalizes manually constructed repeated values", () => {
    const parsed = {
      command: [],
      flags: {
        profile: ["first", "second"],
        set: "limit=100",
        query: "after=001",
        property: "email=zaki@example.com",
      },
      unknownFlags: [],
    };

    expect(getString(parsed.flags, "profile")).toBe("second");
    expect(getGlobalOptions(parsed)).toMatchObject({
      set: ["limit=100"],
      query: ["after=001"],
      properties: ["email=zaki@example.com"],
    });
  });
});

test("boolean options accept only true or false", () => {
  expect(getGlobalOptions(parseArgs(["--yes=true"])).yes).toBe(true);
  expect(getGlobalOptions(parseArgs(["--yes=false"])).yes).toBe(false);
  expect(() => parseArgs(["--yes=definitely"])).toThrow(
    'Invalid boolean value "definitely" for --yes. Use true or false.',
  );
});
