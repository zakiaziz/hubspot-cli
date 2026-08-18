import type { Endpoint } from "./types.js";

export const endpoints: readonly Endpoint[] = [
  endpoint(
    "objects list",
    ["objects", "list", ":objectType"],
    "GET",
    "/crm/objects/:apiVersion/:objectType",
    "List records for any standard or custom object type.",
    false,
    "query",
  ),
  endpoint(
    "objects get",
    ["objects", "get", ":objectType", ":recordId"],
    "GET",
    "/crm/objects/:apiVersion/:objectType/:recordId",
    "Get one record.",
  ),
  endpoint(
    "objects search",
    ["objects", "search", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType/search",
    "Search records.",
    false,
    "body",
  ),
  endpoint(
    "objects create",
    ["objects", "create", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType",
    "Create one record.",
    true,
  ),
  endpoint(
    "objects update",
    ["objects", "update", ":objectType", ":recordId"],
    "PATCH",
    "/crm/objects/:apiVersion/:objectType/:recordId",
    "Update one record.",
    true,
  ),
  endpoint(
    "objects archive",
    ["objects", "archive", ":objectType", ":recordId"],
    "DELETE",
    "/crm/objects/:apiVersion/:objectType/:recordId",
    "Move one record to HubSpot's recycling bin.",
    true,
  ),
  endpoint(
    "objects batch-read",
    ["objects", "batch-read", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType/batch/read",
    "Read a batch of records.",
  ),
  endpoint(
    "objects batch-create",
    ["objects", "batch-create", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType/batch/create",
    "Create a batch of records.",
    true,
  ),
  endpoint(
    "objects batch-update",
    ["objects", "batch-update", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType/batch/update",
    "Update a batch of records.",
    true,
  ),
  endpoint(
    "objects batch-upsert",
    ["objects", "batch-upsert", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType/batch/upsert",
    "Create or update a batch of records.",
    true,
  ),
  endpoint(
    "objects batch-archive",
    ["objects", "batch-archive", ":objectType"],
    "POST",
    "/crm/objects/:apiVersion/:objectType/batch/archive",
    "Archive a batch of records.",
    true,
  ),
  endpoint(
    "properties list",
    ["properties", "list", ":objectType"],
    "GET",
    "/crm/properties/:apiVersion/:objectType",
    "List property definitions for an object type.",
  ),
  endpoint(
    "properties get",
    ["properties", "get", ":objectType", ":propertyName"],
    "GET",
    "/crm/properties/:apiVersion/:objectType/:propertyName",
    "Get one property definition.",
  ),
  endpoint(
    "properties create",
    ["properties", "create", ":objectType"],
    "POST",
    "/crm/properties/:apiVersion/:objectType",
    "Create a property definition.",
    true,
  ),
  endpoint(
    "properties update",
    ["properties", "update", ":objectType", ":propertyName"],
    "PATCH",
    "/crm/properties/:apiVersion/:objectType/:propertyName",
    "Update a property definition.",
    true,
  ),
  endpoint(
    "properties archive",
    ["properties", "archive", ":objectType", ":propertyName"],
    "DELETE",
    "/crm/properties/:apiVersion/:objectType/:propertyName",
    "Archive a property definition.",
    true,
  ),
  endpoint(
    "owners list",
    ["owners", "list"],
    "GET",
    "/crm/owners/:apiVersion",
    "List owners.",
    false,
    "query",
  ),
  endpoint(
    "owners get",
    ["owners", "get", ":ownerId"],
    "GET",
    "/crm/owners/:apiVersion/:ownerId",
    "Get one owner.",
  ),
  endpoint(
    "pipelines list",
    ["pipelines", "list", ":objectType"],
    "GET",
    "/crm/pipelines/:apiVersion/:objectType",
    "List pipelines for an object type.",
  ),
  endpoint(
    "pipelines get",
    ["pipelines", "get", ":objectType", ":pipelineId"],
    "GET",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId",
    "Get one pipeline.",
  ),
  endpoint(
    "pipelines create",
    ["pipelines", "create", ":objectType"],
    "POST",
    "/crm/pipelines/:apiVersion/:objectType",
    "Create a pipeline.",
    true,
  ),
  endpoint(
    "pipelines replace",
    ["pipelines", "replace", ":objectType", ":pipelineId"],
    "PUT",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId",
    "Replace a pipeline.",
    true,
  ),
  endpoint(
    "pipelines update",
    ["pipelines", "update", ":objectType", ":pipelineId"],
    "PATCH",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId",
    "Update a pipeline.",
    true,
  ),
  endpoint(
    "pipelines delete",
    ["pipelines", "delete", ":objectType", ":pipelineId"],
    "DELETE",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId",
    "Delete a pipeline.",
    true,
  ),
  endpoint(
    "stages list",
    ["stages", "list", ":objectType", ":pipelineId"],
    "GET",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId/stages",
    "List pipeline stages.",
  ),
  endpoint(
    "stages get",
    ["stages", "get", ":objectType", ":pipelineId", ":stageId"],
    "GET",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId/stages/:stageId",
    "Get one pipeline stage.",
  ),
  endpoint(
    "stages create",
    ["stages", "create", ":objectType", ":pipelineId"],
    "POST",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId/stages",
    "Create a pipeline stage.",
    true,
  ),
  endpoint(
    "stages replace",
    ["stages", "replace", ":objectType", ":pipelineId", ":stageId"],
    "PUT",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId/stages/:stageId",
    "Replace a pipeline stage.",
    true,
  ),
  endpoint(
    "stages update",
    ["stages", "update", ":objectType", ":pipelineId", ":stageId"],
    "PATCH",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId/stages/:stageId",
    "Update a pipeline stage.",
    true,
  ),
  endpoint(
    "stages delete",
    ["stages", "delete", ":objectType", ":pipelineId", ":stageId"],
    "DELETE",
    "/crm/pipelines/:apiVersion/:objectType/:pipelineId/stages/:stageId",
    "Delete a pipeline stage.",
    true,
  ),
  endpoint(
    "associations list",
    ["associations", "list", ":fromObjectType", ":fromObjectId", ":toObjectType"],
    "GET",
    "/crm/objects/:apiVersion/:fromObjectType/:fromObjectId/associations/:toObjectType",
    "List a record's associations to one object type.",
    false,
    "query",
  ),
  endpoint(
    "associations create-default",
    [
      "associations",
      "create-default",
      ":fromObjectType",
      ":fromObjectId",
      ":toObjectType",
      ":toObjectId",
    ],
    "PUT",
    "/crm/objects/:apiVersion/:fromObjectType/:fromObjectId/associations/default/:toObjectType/:toObjectId",
    "Create a default association.",
    true,
  ),
  endpoint(
    "associations create",
    [
      "associations",
      "create",
      ":fromObjectType",
      ":fromObjectId",
      ":toObjectType",
      ":toObjectId",
    ],
    "PUT",
    "/crm/objects/:apiVersion/:fromObjectType/:fromObjectId/associations/:toObjectType/:toObjectId",
    "Create labeled associations.",
    true,
  ),
  endpoint(
    "associations delete",
    [
      "associations",
      "delete",
      ":fromObjectType",
      ":fromObjectId",
      ":toObjectType",
      ":toObjectId",
    ],
    "DELETE",
    "/crm/objects/:apiVersion/:fromObjectType/:fromObjectId/associations/:toObjectType/:toObjectId",
    "Remove every association between two records.",
    true,
  ),
  endpoint(
    "associations batch-read",
    ["associations", "batch-read", ":fromObjectType", ":toObjectType"],
    "POST",
    "/crm/associations/:apiVersion/:fromObjectType/:toObjectType/batch/read",
    "Read associations for a batch of records.",
  ),
  endpoint(
    "associations batch-create",
    ["associations", "batch-create", ":fromObjectType", ":toObjectType"],
    "POST",
    "/crm/associations/:apiVersion/:fromObjectType/:toObjectType/batch/create",
    "Create labeled associations for record pairs.",
    true,
  ),
  endpoint(
    "associations batch-create-default",
    ["associations", "batch-create-default", ":fromObjectType", ":toObjectType"],
    "POST",
    "/crm/associations/:apiVersion/:fromObjectType/:toObjectType/batch/associate/default",
    "Create default associations for record pairs.",
    true,
  ),
  endpoint(
    "associations batch-delete",
    ["associations", "batch-delete", ":fromObjectType", ":toObjectType"],
    "POST",
    "/crm/associations/:apiVersion/:fromObjectType/:toObjectType/batch/archive",
    "Remove associations for record pairs.",
    true,
  ),
  endpoint(
    "associations labels",
    ["associations", "labels", ":fromObjectType", ":toObjectType"],
    "GET",
    "/crm/associations/:apiVersion/:fromObjectType/:toObjectType/labels",
    "List association labels.",
  ),
  endpoint(
    "schemas list",
    ["schemas", "list"],
    "GET",
    "/crm-object-schemas/:apiVersion/schemas",
    "List custom object schemas.",
  ),
  endpoint(
    "schemas get",
    ["schemas", "get", ":objectType"],
    "GET",
    "/crm-object-schemas/:apiVersion/schemas/:objectType",
    "Get one custom object schema.",
  ),
  endpoint(
    "schemas create",
    ["schemas", "create"],
    "POST",
    "/crm-object-schemas/:apiVersion/schemas",
    "Create a custom object schema.",
    true,
  ),
  endpoint(
    "schemas update",
    ["schemas", "update", ":objectType"],
    "PATCH",
    "/crm-object-schemas/:apiVersion/schemas/:objectType",
    "Update a custom object schema.",
    true,
  ),
  endpoint(
    "schemas delete",
    ["schemas", "delete", ":objectType"],
    "DELETE",
    "/crm-object-schemas/:apiVersion/schemas/:objectType",
    "Delete a custom object schema.",
    true,
  ),
  endpoint(
    "account details",
    ["account", "details"],
    "GET",
    "/account-info/:apiVersion/details",
    "Get account details.",
  ),
  endpoint(
    "account api-usage",
    ["account", "api-usage"],
    "GET",
    "/account-info/:apiVersion/api-usage/daily/private-apps",
    "Get private-app daily API usage.",
  ),
];

export function findEndpoint(
  command: readonly string[],
): { endpoint: Endpoint; params: Record<string, string> } | undefined {
  for (const candidate of endpoints) {
    if (candidate.pattern.length !== command.length) {
      continue;
    }

    const params: Record<string, string> = {};
    const matches = candidate.pattern.every((part, index) => {
      const value = command[index];
      if (value === undefined) {
        return false;
      }
      if (part.startsWith(":")) {
        params[part.slice(1)] = value;
        return true;
      }
      return part === value;
    });

    if (matches) {
      return { endpoint: candidate, params };
    }
  }

  return undefined;
}

function endpoint(
  name: string,
  pattern: readonly string[],
  method: Endpoint["method"],
  path: string,
  description: string,
  mutation = false,
  pagination?: Endpoint["pagination"],
): Endpoint {
  return {
    name,
    pattern,
    method,
    path,
    description,
    mutation,
    ...(pagination ? { pagination } : {}),
  };
}
