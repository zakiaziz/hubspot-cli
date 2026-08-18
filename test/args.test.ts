import { describe, expect, test } from "bun:test";
import { getGlobalOptions, parseArgs } from "../src/args.js";

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

  test("preserves unrecognized flags for command-specific fields", () => {
    const parsed = parseArgs(["objects", "list", "contacts", "--properties", "email,name", "--archived=false"]);

    expect(parsed.unknownFlags).toEqual([
      { name: "properties", value: "email,name" },
      { name: "archived", value: "false" },
    ]);
  });

  test("rejects missing values for known value flags", () => {
    expect(() => parseArgs(["objects", "list", "contacts", "--profile"])).toThrow(
      "Missing value for --profile",
    );
  });
});
