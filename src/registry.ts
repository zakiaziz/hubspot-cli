import { readFileSync } from "node:fs";
import { CliError, stepsFailure, usageError, type ErrorCode, type StepPartial } from "./core/errors.js";
import type { Endpoint } from "./core/access.js";
import type { HookHelpers, PageInfo, PagedRequest, PageRequest, Pagination, RequestSpec, ResourceCommand } from "./core/provider.js";
import { FILE_OPTION, QUERY_OPTION, type ArgumentSpec, type Context, type GroupSpec, type OptionSpec, type PaginationSpec } from "./core/registry.js";
import type { HttpMethod } from "./core/types.js";
import { echoable, invalidValue, isRecord, listWords, missingFields, parseKeyValue, validateId } from "./core/values.js";

export const API_VERSION = "2026-03";
const VERSION_TOKEN = "{version}";

const BIN = "hubspot";
const ASSOCIATION_CATEGORIES = ["HUBSPOT_DEFINED", "USER_DEFINED", "INTEGRATOR_DEFINED"];
const BATCH_META = ["status", "startedAt", "completedAt"];
const PROVIDER_ORDER = "Order is set by HubSpot and is undocumented.";
const UNPAGINATED = "Not paginated. HubSpot returns the full list in one response; meta is empty.";
const NO_RESTORE = "HubSpot documents no way to restore it.";
const GRAM_6_ASSOCIATIONS = "An association joins two records and an object type pair, so no single primary target exists.";
const GRAM_4_DEFAULT = "create-default preserves the HubSpot term for the default association.";
const GRAM_4_UPSERT = "batch-upsert preserves the HubSpot term upsert for create-or-update by unique property.";
const GRAM_4_BATCH_DEFAULT = "batch-create-default preserves the HubSpot term for the default association.";
const GRAM_4_BATCH_VARIANT = "The action vocabulary lists batch-get, batch-create, and batch-update only; this batch action keeps the action name of its single-record command.";
const NOT_ATOMIC =
  "Not atomic. HubSpot can apply some items and reject others in one response, and nothing is rolled back. Rejected items exit 8 with PARTIAL_FAILURE.";
const SEARCH_ORDER = "Order follows sorts in the input file. Without sorts, HubSpot applies its default search order, which this tool does not change.";
/** HubSpot serves at most this many results for one search query, counted from offset 0. */
const SEARCH_WINDOW = 10_000;

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
  /** Checked shape of a --file body that holds the complete input of a search or a batch. */
  shape?: FileShape;
  /** The response lists per-item errors, and any of them fails PARTIAL_FAILURE. Results are a collection unless the command returns no content. */
  batch?: true;
  /** Names what the command returns. Collection reads set `page`. */
  returns: string;
  page?: PageLimits | "none";
  /** Effect sentence of a remote mutation, with {id}, {name}, and {count} tokens. Its presence marks the command as a mutation. */
  effect?: string;
  /** Effect sentence of a read that needs more than "Read only.", with the same tokens. */
  readEffect?: string;
  exceptions?: { rule: string; reason: string }[];
}

interface PageLimits {
  max: number;
  ordering?: string;
  style?: Pagination;
  window?: number;
}

type ItemCheck = (item: Record<string, unknown>, at: string) => void;

interface FileShape {
  /** Completes the --file help: what the file holds. */
  summary: string;
  /** Top-level fields the body may hold. Any other field fails INVALID_ARGUMENT. */
  keys: readonly string[];
  /** Fields that a pagination option sets, each with the option that replaces it. */
  paged?: Record<string, string>;
  /** Checks each item of the required inputs array. Its presence makes a nonempty inputs array required. */
  item?: ItemCheck;
  /** Most items HubSpot accepts in one request. Needs item. */
  max?: number;
  /** Checks the other fields. */
  fields?(body: Record<string, unknown>): void;
}

/** Search pages: the page size and cursor travel in the request body, and the continuation reads like every other HubSpot list. */
const searchPagination: Pagination = {
  apply(request: PagedRequest, page: PageRequest) {
    if (!isRecord(request.body)) throw new CliError("UNEXPECTED_ERROR", "HubSpot search pagination needs a JSON object body.");
    request.body.limit = page.size;
    if (page.cursor === null) delete request.body.after;
    else request.body.after = page.cursor;
  },
  read: readPage,
};

function batchShape(summary: string, item: ItemCheck, max: number): FileShape {
  return { summary: `${summary} At most ${max} inputs.`, keys: ["inputs"], item, max };
}

/** HubSpot accepts at most this many inputs in one object batch request. */
const OBJECT_BATCH_MAX = 100;
/** HubSpot accepts at most this many inputs in one association batch read. */
const ASSOCIATION_READ_MAX = 1000;
/** HubSpot accepts at most this many inputs in one association batch write. */
const ASSOCIATION_WRITE_MAX = 2000;

const SHAPES = {
  search: {
    summary: "Holds the search body: query, filterGroups, sorts, and properties. Use --page-size and --cursor instead of limit and after.",
    keys: ["query", "filterGroups", "sorts", "properties"],
    paged: { limit: "--page-size", after: "--cursor" },
    fields: checkSearchFields,
  },
  objectRead: {
    summary: `Holds {"inputs":[{"id":"12345"}]} and optionally properties, propertiesWithHistory, and idProperty. At most ${OBJECT_BATCH_MAX} inputs.`,
    keys: ["inputs", "properties", "propertiesWithHistory", "idProperty"],
    item: hasId,
    max: OBJECT_BATCH_MAX,
    fields: checkReadFields,
  },
  objectCreate: batchShape('Holds {"inputs":[{"properties":{"firstname":"Ada"}}]}. An item can also hold associations.', hasProperties, OBJECT_BATCH_MAX),
  objectUpdate: batchShape(
    'Holds {"inputs":[{"id":"12345","properties":{"lifecyclestage":"customer"}}]}. Omitted properties keep their values.',
    hasIdAndProperties,
    OBJECT_BATCH_MAX,
  ),
  objectUpsert: batchShape(
    'Holds {"inputs":[{"id":"ada@example.com","idProperty":"email","properties":{"firstname":"Ada"}}]}.',
    hasIdAndProperties,
    OBJECT_BATCH_MAX,
  ),
  objectArchive: batchShape('Holds {"inputs":[{"id":"12345"}]}.', hasId, OBJECT_BATCH_MAX),
  associationRead: batchShape(
    'Holds {"inputs":[{"id":"12345"}]}, with the IDs of --from-type records. An input can also hold after, the paging.next.after of an earlier result, to read that record\'s next page of associations.',
    hasId,
    ASSOCIATION_READ_MAX,
  ),
  associationCreate: batchShape(
    'Holds {"inputs":[{"from":{"id":"12345"},"to":{"id":"67890"},"types":[{"associationCategory":"HUBSPOT_DEFINED","associationTypeId":1}]}]}.',
    hasLabels,
    ASSOCIATION_WRITE_MAX,
  ),
  associationDefault: batchShape('Holds {"inputs":[{"from":{"id":"12345"},"to":{"id":"67890"}}]}.', hasEndpoints, ASSOCIATION_WRITE_MAX),
  associationDelete: batchShape('Holds {"inputs":[{"from":{"id":"12345"},"to":[{"id":"67890"}]}]}.', hasTargets, ASSOCIATION_WRITE_MAX),
} satisfies Record<string, FileShape>;

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
    path: ["objects", "search"],
    summary: "Search records of one object type.",
    method: "POST",
    route: `/crm/objects/${V}/{type}/search`,
    scope: [TYPE],
    input: "file",
    shape: SHAPES.search,
    returns: "records",
    page: { max: 200, ordering: SEARCH_ORDER, style: searchPagination, window: SEARCH_WINDOW },
    readEffect: "Sends one POST search request per page for records of type {type}. A search changes nothing.",
  },
  {
    path: ["objects", "batch-get"],
    summary: "Get several records by ID.",
    method: "POST",
    route: `/crm/objects/${V}/{type}/batch/read`,
    scope: [TYPE],
    input: "file",
    shape: SHAPES.objectRead,
    batch: true,
    returns: "records",
    readEffect: "Sends one POST request that reads the records of type {type} listed in the file. Records HubSpot cannot read exit 8 with PARTIAL_FAILURE.",
  },
  {
    path: ["objects", "batch-create"],
    summary: "Create several records.",
    method: "POST",
    route: `/crm/objects/${V}/{type}/batch/create`,
    scope: [TYPE],
    input: "file",
    shape: SHAPES.objectCreate,
    batch: true,
    returns: "the created records",
    effect: "Creates records of type {type} from {count} in the file.",
  },
  {
    path: ["objects", "batch-update"],
    summary: "Update several records.",
    method: "POST",
    route: `/crm/objects/${V}/{type}/batch/update`,
    scope: [TYPE],
    input: "file",
    shape: SHAPES.objectUpdate,
    batch: true,
    returns: "the updated records",
    effect: "Updates records of type {type} from {count} in the file. Omitted properties keep their values.",
  },
  {
    path: ["objects", "batch-upsert"],
    summary: "Create or update several records by unique property.",
    method: "POST",
    route: `/crm/objects/${V}/{type}/batch/upsert`,
    scope: [TYPE],
    input: "file",
    shape: SHAPES.objectUpsert,
    batch: true,
    returns: "the upserted records",
    effect: "Creates or updates records of type {type} from {count} in the file. HubSpot matches each item by its idProperty and id.",
    exceptions: [{ rule: "CLI-GRAM-4", reason: GRAM_4_UPSERT }],
  },
  {
    path: ["objects", "batch-archive"],
    summary: "Archive several records.",
    method: "POST",
    route: `/crm/objects/${V}/{type}/batch/archive`,
    scope: [TYPE],
    input: "file",
    shape: SHAPES.objectArchive,
    batch: true,
    returns: "no content",
    effect: "Archives the records of type {type} named by {count} in the file. The records move to the HubSpot recycling bin, which HubSpot documents as the way to restore them.",
    exceptions: [{ rule: "CLI-GRAM-4", reason: GRAM_4_BATCH_VARIANT }],
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
    path: ["associations", "batch-get"],
    summary: "Get the associations of several records.",
    method: "POST",
    route: `/crm/associations/${V}/{from-type}/{to-type}/batch/read`,
    scope: [FROM_TYPE, TO_TYPE],
    input: "file",
    shape: SHAPES.associationRead,
    batch: true,
    returns: "association results",
    readEffect: "Sends one POST request that reads the {to-type} associations of the {from-type} records listed in the file. Records HubSpot cannot read exit 8 with PARTIAL_FAILURE. The tool does not follow a result's paging.next.after.",
  },
  {
    path: ["associations", "batch-create"],
    summary: "Create labeled associations for several record pairs.",
    method: "POST",
    route: `/crm/associations/${V}/{from-type}/{to-type}/batch/create`,
    scope: [FROM_TYPE, TO_TYPE],
    input: "file",
    shape: SHAPES.associationCreate,
    batch: true,
    returns: "association results",
    effect: "Creates labeled associations between {from-type} and {to-type} records from {count} in the file.",
  },
  {
    path: ["associations", "batch-create-default"],
    summary: "Create default associations for several record pairs.",
    method: "POST",
    route: `/crm/associations/${V}/{from-type}/{to-type}/batch/associate/default`,
    scope: [FROM_TYPE, TO_TYPE],
    input: "file",
    shape: SHAPES.associationDefault,
    batch: true,
    returns: "association results",
    effect: "Creates default associations between {from-type} and {to-type} records from {count} in the file.",
    exceptions: [{ rule: "CLI-GRAM-4", reason: GRAM_4_BATCH_DEFAULT }],
  },
  {
    path: ["associations", "batch-delete"],
    summary: "Delete every association between several record pairs.",
    method: "POST",
    route: `/crm/associations/${V}/{from-type}/{to-type}/batch/archive`,
    scope: [FROM_TYPE, TO_TYPE],
    input: "file",
    shape: SHAPES.associationDelete,
    batch: true,
    returns: "no content",
    effect: "Removes every association between {from-type} records and the {to-type} records named by {count} in the file. HubSpot documents no way to restore them.",
    exceptions: [{ rule: "CLI-GRAM-4", reason: GRAM_4_BATCH_VARIANT }],
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
  { path: ["associations"], summary: "List, create, and delete record associations, singly or in batches.", title: "Manage record associations." },
  { path: ["objects"], summary: "List, get, search, create, update, upsert, and archive CRM records, singly or in batches.", title: "Manage CRM records." },
  { path: ["owners"], summary: "List and get record owners.", title: "Inspect record owners." },
  { path: ["pipelines"], summary: "List, get, create, replace, update, and delete pipelines.", title: "Manage pipelines." },
  { path: ["properties"], summary: "List, get, create, update, and archive property definitions.", title: "Manage property definitions." },
  { path: ["schemas"], summary: "List, get, create, update, and delete custom object schemas.", title: "Manage custom object schemas." },
  { path: ["stages"], summary: "List, get, create, replace, update, and delete pipeline stages.", title: "Manage pipeline stages." },
];

export const commands: ResourceCommand[] = DEFINITIONS.map(toCommand);

function toCommand(definition: Definition): ResourceCommand {
  const { page, effect, batch } = definition;
  const paginated = page !== undefined && page !== "none";
  const exceptions = [
    ...(definition.path[0] === "associations" ? [{ rule: "CLI-GRAM-6", reason: GRAM_6_ASSOCIATIONS }] : []),
    ...(definition.exceptions ?? []),
  ];
  const fill = (sentence: string): string => fillTokens(sentence, (token) => placeholderOf(definition, token));
  const collection = page !== undefined || (batch === true && definition.returns !== "no content");
  return {
    path: definition.path,
    summary: definition.summary,
    arguments: definition.id ? [definition.id] : [],
    options: optionSpecs(definition),
    effects:
      effect === undefined
        ? { kind: "read", ...(definition.readEffect === undefined ? {} : { summary: fill(definition.readEffect) }) }
        : { kind: "remote-mutation", summary: fill(effect), ...(batch ? { atomicity: NOT_ATOMIC } : {}) },
    output: outputText(definition),
    method: definition.method,
    ...(collection ? { collectionKey: "results" } : {}),
    ...(batch && collection ? { providerMeta: BATCH_META } : {}),
    ...(batch ? { settle: settleBatch } : {}),
    ...(paginated ? { pagination: paginationSpec(page) } : {}),
    ...(page === "none" ? { unpaginated: UNPAGINATED } : {}),
    ...(definition.id && effect === undefined ? { emptyIsNotFound: true } : {}),
    examples: exampleCommands(definition, paginated),
    ...(exceptions.length > 0 ? { exceptions } : {}),
    request: (context, endpoint) => buildRequest(definition, paginated, context, endpoint),
  };
}

function paginationSpec(page: PageLimits): PaginationSpec {
  return {
    max: page.max,
    default: Math.min(page.max, 100),
    ordering: page.ordering ?? PROVIDER_ORDER,
    ...(page.style === undefined ? {} : { style: page.style }),
    ...(page.window === undefined ? {} : { window: page.window }),
  };
}

function optionSpecs(definition: Definition): OptionSpec[] {
  const input: OptionSpec[] = [];
  if (definition.input === "file") input.push(fileOption(definition));
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

function fileOption(definition: Definition): OptionSpec {
  const description = definition.shape ? `${FILE_OPTION.description} ${definition.shape.summary}` : FILE_OPTION.description;
  return { ...FILE_OPTION, description, required: true };
}

function outputText(definition: Definition): string {
  const { page, returns } = definition;
  if (page === "none") return `Collection envelope. data is the array of ${returns}; meta is empty.`;
  if (page !== undefined) {
    return `Collection envelope. data is the array of ${returns}; meta holds next_cursor and has_more, and provider when HubSpot returns extra collection fields.`;
  }
  const partial = "A response that lists item errors fails with PARTIAL_FAILURE; error.partial holds the completed and failed items.";
  if (returns === "no content") {
    const none = "Resource envelope. data is null because HubSpot returns no content; meta is empty.";
    return definition.batch ? `${none} ${partial}` : none;
  }
  if (definition.batch) {
    return `Collection envelope. data is the array of ${returns}; meta.provider holds status, startedAt, and completedAt when HubSpot returns them. ${partial}`;
  }
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
  const lookup = (token: string): string => (token === "count" ? countText(inputCount(body)) : valueOf(token, context));
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

function countText(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function inputCount(body: unknown): number {
  return isRecord(body) && Array.isArray(body.inputs) ? body.inputs.length : 0;
}

function placeholderOf(definition: Definition, token: string): string {
  if (token === "id") return definition.id?.name ?? "";
  if (token === "count") return "N items";
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
  if (definition.shape) checkShape(definition.shape, body);
  return body;
}

function checkShape(shape: FileShape, body: Record<string, unknown>): void {
  for (const [field, option] of Object.entries(shape.paged ?? {})) {
    if (!Object.hasOwn(body, field)) continue;
    throw usageError(`--file must not contain ${field}; ${option} sets it.`, `Remove ${field} from the input file and use ${option}.`, {
      option: "--file",
      field,
    });
  }
  for (const field of Object.keys(body)) {
    if (shape.keys.includes(field)) continue;
    throw usageError(
      `--file must contain only ${listWords(shape.keys, "and")}; received unknown field "${echoable(field)}".`,
      `Remove "${echoable(field)}" from the input file.`,
      { option: "--file", field: echoable(field), allowed: shape.keys.join(", ") },
    );
  }
  if (shape.item) checkInputs(body.inputs, shape.item, shape.max);
  shape.fields?.(body);
}

function checkInputs(inputs: unknown, check: ItemCheck, max: number | undefined): void {
  if (!Array.isArray(inputs) || inputs.length === 0) throw fieldError("inputs", "be a nonempty array", inputs);
  if (max !== undefined && inputs.length > max) {
    throw usageError(`--file inputs must hold at most ${max} items; received ${inputs.length}.`, `Split the input into files of at most ${max} inputs.`, {
      option: "--file",
      field: "inputs",
      received: String(inputs.length),
      allowed: `1-${max}`,
    });
  }
  for (const [index, entry] of inputs.entries()) {
    const at = `inputs[${index}]`;
    requireObject(entry, at);
    check(entry, at);
  }
}

function checkSearchFields(body: Record<string, unknown>): void {
  if (body.query !== undefined && typeof body.query !== "string") throw fieldError("query", "be a string", body.query);
  for (const field of ["filterGroups", "sorts"]) {
    if (body[field] !== undefined && !Array.isArray(body[field])) throw fieldError(field, "be an array", body[field]);
  }
  if (body.properties !== undefined) requireTexts(body.properties, "properties");
}

function checkReadFields(body: Record<string, unknown>): void {
  if (body.properties !== undefined) requireTexts(body.properties, "properties");
  if (body.propertiesWithHistory !== undefined) requireTexts(body.propertiesWithHistory, "propertiesWithHistory");
  if (body.idProperty !== undefined) requireText(body.idProperty, "idProperty");
}

function hasId(item: Record<string, unknown>, at: string): void {
  requireText(item.id, `${at}.id`);
}

function hasProperties(item: Record<string, unknown>, at: string): void {
  requireObject(item.properties, `${at}.properties`);
}

function hasIdAndProperties(item: Record<string, unknown>, at: string): void {
  hasId(item, at);
  hasProperties(item, at);
}

function hasEndpoints(item: Record<string, unknown>, at: string): void {
  const { from, to } = item;
  requireObject(from, `${at}.from`);
  requireText(from.id, `${at}.from.id`);
  requireObject(to, `${at}.to`);
  requireText(to.id, `${at}.to.id`);
}

function hasLabels(item: Record<string, unknown>, at: string): void {
  hasEndpoints(item, at);
  const { types } = item;
  requireList(types, `${at}.types`);
  for (const [index, type] of types.entries()) {
    const label = `${at}.types[${index}]`;
    requireObject(type, label);
    if (typeof type.associationCategory !== "string" || !ASSOCIATION_CATEGORIES.includes(type.associationCategory)) {
      throw fieldError(`${label}.associationCategory`, `be one of ${ASSOCIATION_CATEGORIES.join(", ")}`, type.associationCategory);
    }
    if (typeof type.associationTypeId !== "number" || !Number.isSafeInteger(type.associationTypeId) || type.associationTypeId < 0) {
      throw fieldError(`${label}.associationTypeId`, "be a nonnegative integer", type.associationTypeId);
    }
  }
}

function hasTargets(item: Record<string, unknown>, at: string): void {
  const { from, to } = item;
  requireObject(from, `${at}.from`);
  requireText(from.id, `${at}.from.id`);
  requireList(to, `${at}.to`);
  for (const [index, target] of to.entries()) {
    requireObject(target, `${at}.to[${index}]`);
    requireText(target.id, `${at}.to[${index}].id`);
  }
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value === "") throw fieldError(field, "be a nonempty string", value);
}

function requireObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw fieldError(field, "be an object", value);
}

function requireList(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw fieldError(field, "be a nonempty array", value);
}

function requireTexts(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw fieldError(field, "be an array of strings", value);
}

function fieldError(field: string, constraint: string, value: unknown): CliError {
  const received = describe(value);
  return usageError(`--file ${field} must ${constraint}; received ${received}.`, `Fix ${field} in the input file.`, {
    option: "--file",
    field,
    received,
  });
}

/** Names a received value without echoing objects and arrays, which can hold property values. */
function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (typeof value === "string") return `"${echoable(value)}"`;
  if (Array.isArray(value)) return value.length === 0 ? "an empty array" : "an array";
  if (isRecord(value)) return "an object";
  return String(value);
}

const ITEM_ERROR_CODES = new Map<string, ErrorCode>([
  ["VALIDATION_ERROR", "INVALID_REQUEST"],
  ["OBJECT_NOT_FOUND", "NOT_FOUND"],
  ["CONFLICT", "CONFLICT"],
  ["RATE_LIMITS", "RATE_LIMITED"],
  ["INTERNAL_ERROR", "TRANSIENT_FAILURE"],
  ["FORBIDDEN", "PERMISSION_DENIED"],
  ["MISSING_SCOPES", "PERMISSION_DENIED"],
  ["INVALID_AUTHENTICATION", "AUTHENTICATION_FAILED"],
]);

/** Fails PARTIAL_FAILURE when a batch response lists item errors, with the completed and failed items. */
function settleBatch(result: { data: unknown; payload: unknown }, context: Context, helpers: HookHelpers): unknown {
  const errors = isRecord(result.payload) ? result.payload.errors : undefined;
  if (errors === undefined || errors === null) return result.data;
  if (!Array.isArray(errors)) {
    throw new CliError("INVALID_RESPONSE", `HubSpot returned an errors field that is not an array for ${context.spec.path.join(" ")}.`, {
      hint: "Retry later. If the failure persists, the HubSpot API contract may have changed.",
    });
  }
  if (errors.length === 0) return result.data;
  const results = isRecord(result.payload) && Array.isArray(result.payload.results) ? result.payload.results : [];
  const partial: StepPartial = {
    completed: results.map((item, index) => ({ step: itemName(item, `result ${index + 1}`), result: item })),
    failed: errors.flatMap((error, index) => failedItems(error, index)),
    not_attempted: [],
  };
  const mutation = context.spec.effects.kind === "remote-mutation";
  throw stepsFailure(partial, {
    unit: "items",
    provider: helpers.provider,
    hint: mutation
      ? "Check which items completed before retrying. Resubmitting a completed item can repeat its effect."
      : "Fix the failed items and read them again.",
  });
}

/** One failed entry per input ID or write trace ID that HubSpot lists, else one for the error. */
function failedItems(error: unknown, index: number): StepPartial["failed"] {
  const detail = isRecord(error) ? error : {};
  const category = typeof detail.category === "string" ? detail.category : undefined;
  const reason = typeof detail.message === "string" && detail.message !== "" ? detail.message : "no message";
  const context = isRecord(detail.context) ? detail.context : {};
  const named = [...namesOf(context.ids), ...namesOf(context.objectWriteTraceId)];
  const steps = named.length > 0 ? named : [`error ${index + 1}`];
  const failure = {
    code: (category === undefined ? undefined : ITEM_ERROR_CODES.get(category)) ?? ("PROVIDER_ERROR" as const),
    message: `HubSpot rejected the item: ${reason}${category === undefined ? "" : ` (${category})`}.`,
  };
  return steps.map((step) => ({ step, error: failure }));
}

/** Reads a context field that HubSpot sends as one string or an array of strings. */
function namesOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((name): name is string => typeof name === "string" && name !== "");
}

/** Names a result by its record ID, or by the source record ID of an association result. */
function itemName(item: unknown, fallback: string): string {
  if (!isRecord(item)) return fallback;
  const id = item.id ?? (isRecord(item.from) ? item.from.id : undefined);
  return typeof id === "string" || typeof id === "number" ? String(id) : fallback;
}

/** Reads the continuation of a HubSpot page: paging.next.after, with the other collection fields as meta.provider. */
export function readPage(payload: unknown, collectionKey: string | undefined): PageInfo | undefined {
  if (!isRecord(payload)) return undefined;
  const nextCursor = readCursor(payload.paging);
  if (nextCursor === undefined) return undefined;
  const extra = Object.entries(payload).filter(
    ([field, value]) => ![collectionKey, "paging"].includes(field) && !(field === "errors" && Array.isArray(value) && value.length === 0),
  );
  return {
    nextCursor,
    ...(extra.length > 0 ? { provider: Object.fromEntries(extra) } : {}),
  };
}

const MAX_CURSOR_LENGTH = 1024;

/** Returns the next cursor, null when no page remains, or undefined when paging breaks the contract. */
function readCursor(paging: unknown): string | null | undefined {
  if (paging === undefined) return null;
  if (!isRecord(paging)) return undefined;
  if (paging.next === undefined) return null;
  const after = isRecord(paging.next) ? paging.next.after : undefined;
  const cursor = typeof after === "number" && Number.isSafeInteger(after) && after >= 0 ? String(after) : after;
  if (typeof cursor === "string" && cursor !== "" && cursor.length <= MAX_CURSOR_LENGTH) return cursor;
  return undefined;
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
