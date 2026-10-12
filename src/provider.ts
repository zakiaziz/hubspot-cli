import { CliError } from "./core/errors.js";
import type { Provider, ProviderErrorDetail } from "./core/provider.js";
import { HTTP_METHODS } from "./core/types.js";
import { isRecord, visibleAsciiConstraint } from "./core/values.js";
import { API_VERSION, commands, groups, readPage } from "./registry.js";

export const provider: Provider = {
  bin: "hubspot",
  name: "HubSpot",
  secrets: [{ key: "accessToken", label: "access token", validate: visibleAsciiConstraint }],
  authScheme: "a bearer token",
  authorize: (credential) => ({ Authorization: `Bearer ${credential.accessToken}` }),
  baseUrl: { default: "https://api.hubapi.com", allowPath: false },
  endpointFields: [
    {
      key: "apiVersion",
      label: "API version",
      default: API_VERSION,
      validate: (value) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? undefined : "match YYYY-MM, such as 2026-03"),
    },
  ],
  requestIdHeader: "x-hubspot-correlation-id",
  errorDetail,
  pagination: {
    apply({ query }, page) {
      query.set("limit", String(page.size));
      if (page.cursor === null) query.delete("after");
      else query.set("after", page.cursor);
    },
    read: readPage,
  },
  verify: {
    method: "GET",
    path: (endpoint) => `/account-info/${endpoint.require("apiVersion")}/details`,
    query: [],
    effect: `Sends GET /account-info/VERSION/details, where VERSION is the configured API version (default ${API_VERSION}). Success proves that HubSpot accepted the access token for that request and identifies the account. It does not prove complete permission coverage.`,
    identity: accountIdentity,
  },
  api: {
    methods: HTTP_METHODS,
    examples: [
      `hubspot api request GET /crm/objects/${API_VERSION}/contacts --query limit=5`,
      `hubspot api request PATCH /crm/objects/${API_VERSION}/contacts/12345 --file contact.json --dry-run`,
    ],
  },
  groups,
  commands,
};

function errorDetail(body: unknown): ProviderErrorDetail {
  if (!isRecord(body)) return {};
  return {
    ...(typeof body.message === "string" && body.message !== "" ? { message: body.message } : {}),
    ...(typeof body.category === "string" ? { code: body.category } : {}),
    ...(typeof body.correlationId === "string" ? { requestId: body.correlationId } : {}),
  };
}

function accountIdentity(payload: unknown): unknown {
  if (isRecord(payload)) return payload;
  throw new CliError("INVALID_RESPONSE", "HubSpot returned no account details for auth verify.", {
    hint: "Retry later. If the failure persists, the HubSpot API contract may have changed.",
  });
}
