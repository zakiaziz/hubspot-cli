import { readFileSync } from "node:fs";
import { usageError } from "./core/errors.js";
import type { Endpoint } from "./core/access.js";
import type { RequestSpec, ResourceCommand } from "./core/provider.js";
import { FILE_OPTION, QUERY_OPTION, type ArgumentSpec, type Context, type GroupSpec, type OptionSpec } from "./core/registry.js";
import type { HttpMethod } from "./core/types.js";
import { invalidValue, isRecord, missingFields, parseKeyValue, validateId } from "./core/values.js";

export const API_VERSION = "2026-03";
const VERSION_TOKEN = "{version}";

const BIN = "hubspot";
const PROVIDER_ORDER = "Order is set by HubSpot and is undocumented.";
const UNPAGINATED = "Not paginated. HubSpot returns the full list in one response; meta is empty.";
const NO_RESTORE = "HubSpot documents no way to restore it.";
const GRAM_6_ASSOCIATIONS = "An association joins two records and an object type pair, so no single primary target exists.";
const GRAM_4_DEFAULT = "create-default preserves the HubSpot term for the default association.";

function idArgument(name: string, description: string): ArgumentSpec {
  return { name, description, check: (value) => validateId(name, value) };
}

function scopeOption(name: string, placeholder: string, description: string): OptionSpec {
  return {
    name,
    placeholder,
    type: "string",
    required: true,
    description,
    check: (value) => validateId(`--${name}`, value),
  };
}

const RECORD_ID = idArgument("RECORD_ID", "Record ID.");
const PROPERTY_NAME = idArgument("PROPERTY_NAME", "Property internal name.");
const OWNER_ID = idArgument("OWNER_ID", "Owner ID.");
const PIPELINE_ID = idArgument("PIPELINE_ID", "Pipeline ID.");
const STAGE_ID = idArgument("STAGE_ID", "Stage ID.");
const SCHEMA_TYPE = idArgument("OBJECT_TYPE", "Custom object type name or ID, such as 2-1234567.");

const TYPE = scopeOption("type", "OBJECT_TYPE", "HubSpot object type name or ID, such as contacts or 2-1234567.");
const PIPELINE = scopeOption("pipeline-id", "PIPELINE_ID", "Pipeline ID.");
const FROM_TYPE = scopeOption("from-type", "OBJECT_TYPE", "Source object type, such as contacts.");
const FROM_ID = scopeOption("from-id", "RECORD_ID", "Source record ID.");
const TO_TYPE = scopeOption("to-type", "OBJECT_TYPE", "Target object type, such as companies.");
const TO_ID = scopeOption("to-id", "RECORD_ID", "Target record ID.");

const SAMPLES: Record<string, string> = {
  RECORD_ID: "12345",
  PROPERTY_NAME: "lifecyclestage",
  OWNER_ID: "98765",
  PIPELINE_ID: "default",
  STAGE_ID: "appointmentscheduled",
  OBJECT_TYPE: "2-1234567",
  type: "contacts",
  "pipeline-id": "default",
  "from-type": "contacts",
  "from-id": "12345",
  "to-type": "companies",
  "to-id": "67890",
};

interface Definition {
  path: string[];
  summary: string;
  method: HttpMethod;
  /** Request path. {id} is the positional argument; {name} is the value of the scope option of that name. */
  route: string;
  id?: ArgumentSpec;
  scope?: OptionSpec[];
  input?: "file" | "properties";
  arrayBody?: boolean;
  /** Names what the command returns. Collection reads set `page`. */
  returns: string;
  page?: { max: number } | "none";
  /** Effect sentence of a remote mutation, with {id} and {name} tokens. Its presence marks the command as a mutation. */
  effect?: string;
  exceptions?: { rule: string; reason: string }[];
}

const V = VERSION_TOKEN;

const DEFINITIONS: Definition[] = [
  {
    path: ["objects", "list"],
    summary: "List records of one object type.",
    method: "GET",
    route: `/crm/objects/${V}/{type}`,
    scope: [TYPE],
    returns: "records",
    page: { max: 100 },
  },
  {
    path: ["objects", "get"],
    summary: "Get one record.",
    method: "GET",
    route: `/crm/objects/${V}/{type}/{id}`,
    id: RECORD_ID,
    scope: [TYPE],
    returns: "the record",
  },
  {
    path: ["objects", "create"],
    summary: "Create one record.",
    method: "POST",
    route: `/crm/objects/${V}/{type}`,
    scope: [TYPE],
    input: "properties",
    returns: "the created record",
    effect: "Creates a record of type {type}.",
  },
  {
    path: ["objects", "update"],
    summary: "Update one record.",
    method: "PATCH",
    route: `/crm/objects/${V}/{type}/{id}`,
    id: RECORD_ID,
    scope: [TYPE],
    input: "properties",
    returns: "the updated record",
    effect: "Updates record {id} of type {type}. Omitted properties keep their values.",
  },
  {
    path: ["objects", "archive"],
    summary: "Archive one record.",
    method: "DELETE",
    route: `/crm/objects/${V}/{type}/{id}`,
    id: RECORD_ID,
    scope: [TYPE],
    returns: "no content",
    effect: `Archives record {id} of type {type}. The record moves to the HubSpot recycling bin, which HubSpot documents as the way to restore it.`,
  },
  {
    path: ["properties", "list"],
    summary: "List property definitions of one object type.",
    method: "GET",
    route: `/crm/properties/${V}/{type}`,
    scope: [TYPE],
    returns: "property definitions",
    page: "none",
  },
  {
    path: ["properties", "get"],
    summary: "Get one property definition.",
    method: "GET",
    route: `/crm/properties/${V}/{type}/{id}`,
    id: PROPERTY_NAME,
    scope: [TYPE],
    returns: "the property definition",
  },
  {
    path: ["properties", "create"],
    summary: "Create a property definition.",
    method: "POST",
    route: `/crm/properties/${V}/{type}`,
    scope: [TYPE],
    input: "file",
    returns: "the created property definition",
    effect: "Creates a property definition for type {type}.",
  },
  {
    path: ["properties", "update"],
    summary: "Update a property definition.",
    method: "PATCH",
    route: `/crm/properties/${V}/{type}/{id}`,
    id: PROPERTY_NAME,
    scope: [TYPE],
    input: "file",
    returns: "the updated property definition",
    effect: "Updates property {id} of type {type}. Omitted fields keep their values.",
  },
  {
    path: ["properties", "archive"],
    summary: "Archive a property definition.",
    method: "DELETE",
    route: `/crm/properties/${V}/{type}/{id}`,
    id: PROPERTY_NAME,
    scope: [TYPE],
    returns: "no content",
    effect: `Archives property {id} of type {type}. ${NO_RESTORE}`,
  },
  {
    path: ["owners", "list"],
    summary: "List owners.",
    method: "GET",
    route: `/crm/owners/${V}`,
    returns: "owners",
    page: { max: 500 },
  },
  {
    path: ["owners", "get"],
    summary: "Get one owner.",
    method: "GET",
    route: `/crm/owners/${V}/{id}`,
    id: OWNER_ID,
    returns: "the owner",
  },
  {
    path: ["pipelines", "list"],
    summary: "List pipelines of one object type.",
    method: "GET",
    route: `/crm/pipelines/${V}/{type}`,
    scope: [TYPE],
    returns: "pipelines",
    page: "none",
  },
  {
    path: ["pipelines", "get"],
    summary: "Get one pipeline.",
    method: "GET",
    route: `/crm/pipelines/${V}/{type}/{id}`,
    id: PIPELINE_ID,
    scope: [TYPE],
    returns: "the pipeline",
  },
  {
    path: ["pipelines", "create"],
    summary: "Create a pipeline.",
    method: "POST",
    route: `/crm/pipelines/${V}/{type}`,
    scope: [TYPE],
    input: "file",
    returns: "the created pipeline",
    effect: "Creates a pipeline for type {type}.",
  },
  {
    path: ["pipelines", "replace"],
    summary: "Replace a pipeline.",
    method: "PUT",
    route: `/crm/pipelines/${V}/{type}/{id}`,
    id: PIPELINE_ID,
    scope: [TYPE],
    input: "file",
    returns: "the replaced pipeline",
    effect: "Replaces pipeline {id} of type {type} with the complete pipeline in the file.",
  },
  {
    path: ["pipelines", "update"],
    summary: "Update a pipeline.",
    method: "PATCH",
    route: `/crm/pipelines/${V}/{type}/{id}`,
    id: PIPELINE_ID,
    scope: [TYPE],
    input: "file",
    returns: "the updated pipeline",
    effect: "Updates pipeline {id} of type {type}. Omitted fields keep their values.",
  },
  {
    path: ["pipelines", "delete"],
    summary: "Delete a pipeline.",
    method: "DELETE",
    route: `/crm/pipelines/${V}/{type}/{id}`,
    id: PIPELINE_ID,
    scope: [TYPE],
    returns: "no content",
    effect: "Deletes pipeline {id} of type {type}. HubSpot documents no way to restore it.",
  },
  {
    path: ["stages", "list"],
    summary: "List the stages of one pipeline.",
    method: "GET",
    route: `/crm/pipelines/${V}/{type}/{pipeline-id}/stages`,
    scope: [TYPE, PIPELINE],
    returns: "pipeline stages",
    page: "none",
  },
  {
    path: ["stages", "get"],
    summary: "Get one pipeline stage.",
    method: "GET",
    route: `/crm/pipelines/${V}/{type}/{pipeline-id}/stages/{id}`,
    id: STAGE_ID,
    scope: [TYPE, PIPELINE],
    returns: "the pipeline stage",
  },
  {
    path: ["stages", "create"],
    summary: "Create a pipeline stage.",
    method: "POST",
    route: `/crm/pipelines/${V}/{type}/{pipeline-id}/stages`,
    scope: [TYPE, PIPELINE],
    input: "file",
    returns: "the created pipeline stage",
    effect: "Creates a stage in pipeline {pipeline-id} of type {type}.",
  },
  {
    path: ["stages", "replace"],
    summary: "Replace a pipeline stage.",
    method: "PUT",
    route: `/crm/pipelines/${V}/{type}/{pipeline-id}/stages/{id}`,
    id: STAGE_ID,
    scope: [TYPE, PIPELINE],
    input: "file",
    returns: "the replaced pipeline stage",
    effect: "Replaces stage {id} in pipeline {pipeline-id} of type {type} with the complete stage in the file.",
  },
  {
    path: ["stages", "update"],
    summary: "Update a pipeline stage.",
    method: "PATCH",
    route: `/crm/pipelines/${V}/{type}/{pipeline-id}/stages/{id}`,
    id: STAGE_ID,
    scope: [TYPE, PIPELINE],
    input: "file",
    returns: "the updated pipeline stage",
    effect: "Updates stage {id} in pipeline {pipeline-id} of type {type}. Omitted fields keep their values.",
  },
  {
    path: ["stages", "delete"],
    summary: "Delete a pipeline stage.",
    method: "DELETE",
    route: `/crm/pipelines/${V}/{type}/{pipeline-id}/stages/{id}`,
    id: STAGE_ID,
    scope: [TYPE, PIPELINE],
    returns: "no content",
    effect: "Deletes stage {id} from pipeline {pipeline-id} of type {type}. HubSpot documents no way to restore it.",
  },
  {
    path: ["associations", "list"],
    summary: "List a record's associations to one object type.",
    method: "GET",
    route: `/crm/objects/${V}/{from-type}/{from-id}/associations/{to-type}`,
    scope: [FROM_TYPE, FROM_ID, TO_TYPE],
    returns: "associations",
    page: { max: 500 },
  },
  {
    path: ["associations", "create"],
    summary: "Create labeled associations between two records.",
    method: "PUT",
    route: `/crm/objects/${V}/{from-type}/{from-id}/associations/{to-type}/{to-id}`,
    scope: [FROM_TYPE, FROM_ID, TO_TYPE, TO_ID],
    input: "file",
    arrayBody: true,
    returns: "the association result",
    effect: "Associates {from-type} {from-id} with {to-type} {to-id} using the labels in the file.",
  },
  {
    path: ["associations", "create-default"],
    summary: "Create the default association between two records.",
    method: "PUT",
    route: `/crm/objects/${V}/{from-type}/{from-id}/associations/default/{to-type}/{to-id}`,
    scope: [FROM_TYPE, FROM_ID, TO_TYPE, TO_ID],
    returns: "the association result",
    effect: "Associates {from-type} {from-id} with {to-type} {to-id} using the default association.",
    exceptions: [{ rule: "CLI-GRAM-4", reason: GRAM_4_DEFAULT }],
  },
  {
    path: ["associations", "delete"],
    summary: "Delete every association between two records.",
    method: "DELETE",
    route: `/crm/objects/${V}/{from-type}/{from-id}/associations/{to-type}/{to-id}`,
    scope: [FROM_TYPE, FROM_ID, TO_TYPE, TO_ID],
    returns: "no content",
    effect: "Removes every association between {from-type} {from-id} and {to-type} {to-id}. HubSpot documents no way to restore them.",
  },
  {
    path: ["association-labels", "list"],
    summary: "List association labels between two object types.",
    method: "GET",
    route: `/crm/associations/${V}/{from-type}/{to-type}/labels`,
    scope: [FROM_TYPE, TO_TYPE],
    returns: "association labels",
    page: "none",
  },
  {
    path: ["schemas", "list"],
    summary: "List custom object schemas.",
    method: "GET",
    route: `/crm-object-schemas/${V}/schemas`,
    returns: "custom object schemas",
    page: "none",
  },
  {
    path: ["schemas", "get"],
    summary: "Get one custom object schema.",
    method: "GET",
    route: `/crm-object-schemas/${V}/schemas/{id}`,
    id: SCHEMA_TYPE,
    returns: "the custom object schema",
  },
  {
    path: ["schemas", "create"],
    summary: "Create a custom object schema.",
    method: "POST",
    route: `/crm-object-schemas/${V}/schemas`,
    input: "file",
    returns: "the created custom object schema",
    effect: "Creates a custom object schema.",
  },
  {
    path: ["schemas", "update"],
    summary: "Update a custom object schema.",
    method: "PATCH",
    route: `/crm-object-schemas/${V}/schemas/{id}`,
    id: SCHEMA_TYPE,
    input: "file",
    returns: "the updated custom object schema",
    effect: "Updates custom object schema {id}. Omitted fields keep their values.",
  },
  {
    path: ["schemas", "delete"],
    summary: "Delete a custom object schema.",
    method: "DELETE",
    route: `/crm-object-schemas/${V}/schemas/{id}`,
    id: SCHEMA_TYPE,
    returns: "no content",
    effect: "Deletes custom object schema {id}. HubSpot documents no way to restore it.",
  },
  {
    path: ["account", "get"],
    summary: "Get account details.",
    method: "GET",
    route: `/account-info/${V}/details`,
    returns: "the account details",
  },
  {
    path: ["account", "usage", "get"],
    summary: "Get private-app daily API usage.",
    method: "GET",
    route: `/account-info/${V}/api-usage/daily/private-apps`,
    returns: "the daily API usage",
  },
];

export const groups: GroupSpec[] = [
  { path: ["account"], summary: "Get account details and API usage.", title: "Inspect account details." },
  { path: ["account", "usage"], summary: "Get API usage.", title: "Inspect API usage." },
  { path: ["association-labels"], summary: "List association labels.", title: "Inspect association labels." },
  { path: ["associations"], summary: "List, create, and delete record associations.", title: "Manage record associations." },
  { path: ["objects"], summary: "List, get, create, update, and archive CRM records.", title: "Manage CRM records." },
  { path: ["owners"], summary: "List and get record owners.", title: "Inspect record owners." },
  { path: ["pipelines"], summary: "List, get, create, replace, update, and delete pipelines.", title: "Manage pipelines." },
  { path: ["properties"], summary: "List, get, create, update, and archive property definitions.", title: "Manage property definitions." },
  { path: ["schemas"], summary: "List, get, create, update, and delete custom object schemas.", title: "Manage custom object schemas." },
  { path: ["stages"], summary: "List, get, create, replace, update, and delete pipeline stages.", title: "Manage pipeline stages." },
];

export const commands: ResourceCommand[] = DEFINITIONS.map(toCommand);

function toCommand(definition: Definition): ResourceCommand {
  const { page, effect } = definition;
  const paginated = page !== undefined && page !== "none";
  const exceptions = [
    ...(definition.path[0] === "associations" ? [{ rule: "CLI-GRAM-6", reason: GRAM_6_ASSOCIATIONS }] : []),
    ...(definition.exceptions ?? []),
  ];
  return {
    path: definition.path,
    summary: definition.summary,
    arguments: definition.id ? [definition.id] : [],
    options: optionSpecs(definition),
    effects:
      effect === undefined
        ? { kind: "read" }
        : { kind: "remote-mutation", summary: fillTokens(effect, (token) => placeholderOf(definition, token)) },
    output: outputText(definition),
    method: definition.method,
    ...(page === undefined ? {} : { collectionKey: "results" }),
    ...(paginated ? { pagination: { max: page.max, default: Math.min(page.max, 100), ordering: PROVIDER_ORDER } } : {}),
    ...(page === "none" ? { unpaginated: UNPAGINATED } : {}),
    ...(definition.id && effect === undefined ? { emptyIsNotFound: true } : {}),
    examples: exampleCommands(definition, paginated),
    ...(exceptions.length > 0 ? { exceptions } : {}),
    request: (context, endpoint) => buildRequest(definition, paginated, context, endpoint),
  };
}

function optionSpecs(definition: Definition): OptionSpec[] {
  const input: OptionSpec[] = [];
  if (definition.input === "file") input.push({ ...FILE_OPTION, required: true });
  if (definition.input === "properties") {
    input.push(
      { ...FILE_OPTION, conflicts: ["property"] },
      {
        name: "property",
        placeholder: "NAME=VALUE",
        type: "key-value",
        repeatable: true,
        description: "Set a CRM property to a literal string value. An empty VALUE sends an empty string, which HubSpot can treat as clearing the property.",
      },
    );
  }
  return [...(definition.scope ?? []), ...input, QUERY_OPTION];
}

function outputText(definition: Definition): string {
  const { page, returns } = definition;
  if (page === "none") return `Collection envelope. data is the array of ${returns}; meta is empty.`;
  if (page !== undefined) {
    return `Collection envelope. data is the array of ${returns}; meta holds next_cursor and has_more, and provider when HubSpot returns extra collection fields.`;
  }
  if (returns === "no content") return "Resource envelope. data is null because HubSpot returns no content; meta is empty.";
  return `Resource envelope. data is ${returns}; meta is empty.`;
}

function exampleCommands(definition: Definition, paginated: boolean): string[] {
  const positional = definition.id ? [SAMPLES[definition.id.name]] : [];
  const scoped = (definition.scope ?? []).map((option) => `--${option.name} ${sampleOf(definition, option.name)}`);
  const input = {
    none: "",
    file: " --file input.json",
    properties: definition.path[1] === "create" ? " --property firstname=Ada" : " --property lifecyclestage=customer",
  }[definition.input ?? "none"];
  const base = [BIN, ...definition.path, ...positional, ...scoped].join(" ") + input;
  if (definition.effect !== undefined) return [`${base} --dry-run`, `${base} --yes`];
  if (paginated) return [base, `${base} --all --max-items 200 --format human`];
  return [base, `${base} --format human`];
}

function sampleOf(definition: Definition, name: string): string | undefined {
  const pipelineScoped = definition.path[0] === "pipelines" || definition.path[0] === "stages";
  return name === "type" && pipelineScoped ? "deals" : SAMPLES[name];
}

function buildRequest(definition: Definition, paginated: boolean, context: Context, endpoint: Endpoint): RequestSpec {
  const body = buildBody(definition, context);
  const lookup = (token: string): string => valueOf(token, context);
  const version = endpoint.require("apiVersion");
  return {
    path: fillTokens(definition.route, (token) => (token === "version" ? version : encodeURIComponent(lookup(token)))),
    query: queryEntries(context, paginated),
    ...(body === undefined ? {} : { body }),
    ...(definition.effect === undefined ? {} : { effect: fillTokens(definition.effect, lookup) }),
  };
}

function fillTokens(template: string, replace: (token: string) => string): string {
  return template.replace(/\{([a-z-]+)\}/g, (_match, token: string) => replace(token));
}

function valueOf(token: string, context: Context): string {
  return token === "id" ? (context.args[0] ?? "") : (context.options.string(token) ?? "");
}

function placeholderOf(definition: Definition, token: string): string {
  if (token === "id") return definition.id?.name ?? "";
  return definition.scope?.find((option) => option.name === token)?.placeholder ?? token;
}

function queryEntries(context: Context, paginated: boolean): [string, string][] {
  const entries = context.options.strings("query").map((pair) => parseKeyValue("--query", pair));
  if (!paginated) return entries;
  for (const [name] of entries) {
    const replacement = name === "limit" ? "--page-size" : name === "after" ? "--cursor" : undefined;
    if (replacement === undefined) continue;
    throw invalidValue("--query", `not name ${name}, which ${replacement} sets`, name, `Use ${replacement} instead.`);
  }
  return entries;
}

function buildBody(definition: Definition, context: Context): unknown {
  const file = context.options.string("file");
  if (definition.input === "properties" && file === undefined) {
    const properties = buildProperties(context);
    if (Object.keys(properties).length === 0) throw missingFields(definition.path.join(" "), ["property", "file"], definition.path.at(-1) === "update");
    return { properties };
  }
  if (file === undefined) return undefined;
  const body = readJsonFile(file);
  if (definition.arrayBody) {
    if (Array.isArray(body) && body.every(isRecord)) return body;
    throw usageError("--file must contain a JSON array of objects.", "Wrap the input in a JSON array of objects.", { option: "--file" });
  }
  if (!isRecord(body)) {
    throw usageError("--file must contain a JSON object.", "Wrap the input in a JSON object.", { option: "--file" });
  }
  if (definition.input === "properties" && body.properties !== undefined && !isRecord(body.properties)) {
    throw usageError("--file must hold a JSON object in properties.", "Set properties to an object of property names and values.", {
      option: "--file",
    });
  }
  return body;
}

function buildProperties(context: Context): Record<string, string> {
  const properties = new Map<string, string>();
  for (const pair of context.options.strings("property")) {
    const [name, value] = parseKeyValue("--property", pair);
    if (properties.has(name)) {
      throw usageError(`--property ${name} was provided more than once.`, "Provide each property once.", {
        option: "--property",
        received: name,
      });
    }
    properties.set(name, value);
  }
  return Object.fromEntries(properties);
}

function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    throw usageError(
      `--file could not be read${typeof code === "string" ? ` (${code})` : ""}.`,
      "Check that the path exists and is readable, or use - for stdin.",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw usageError("--file must contain valid JSON.", "Fix the JSON syntax in the input.");
  }
}
