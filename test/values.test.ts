import { describe, expect, test } from "bun:test";
import {
  applyAssignments,
  assignmentsToQueryEntries,
  mergeBody,
  propertyAssignmentsToBody,
  unknownFlagsToBody,
  unknownFlagsToQueryEntries,
} from "../src/values.js";

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

  test("maps command fields to HubSpot camelCase names", () => {
    expect(
      unknownFlagsToBody([
        { name: "display-order", value: "2" },
        { name: "label", value: "Qualified" },
      ]),
    ).toEqual({ displayOrder: 2, label: "Qualified" });

    expect(
      unknownFlagsToQueryEntries([
        { name: "properties-with-history", value: "email" },
        { name: "archived", value: "false" },
      ]),
    ).toEqual([
      ["propertiesWithHistory", "email"],
      ["archived", "false"],
    ]);
  });

  test("preserves duplicate exact query parameters", () => {
    expect(assignmentsToQueryEntries(["properties=email", "properties=firstname"])).toEqual([
      ["properties", "email"],
      ["properties", "firstname"],
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
});
