import {
  requireAccessToken,
  resolveAccessToken,
  type RuntimeContext,
} from "./auth.js";
import type {
  Endpoint,
  GlobalOptions,
  PaginationLocation,
  QueryEntry,
  RequestPlan,
} from "./types.js";
import { assignmentsToQueryEntries, redact } from "./values.js";

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface BuildRequestOptions {
  readonly endpoint: Endpoint;
  readonly params: Record<string, string>;
  readonly options: GlobalOptions;
  readonly context: RuntimeContext;
  readonly query: readonly QueryEntry[];
  readonly body?: unknown;
}

export function buildRequestPlan(input: BuildRequestOptions): RequestPlan {
  const auth = requireAccessToken(
    resolveAccessToken(input.options, input.context),
    input.endpoint.name,
  );
  const path = fillPath(input.endpoint.path, {
    ...input.params,
    apiVersion: input.context.apiVersion,
  });
  const url = buildUrl(input.context.baseUrl, path, [
    ...input.query,
    ...assignmentsToQueryEntries(input.options.query),
  ]);

  return {
    method: input.endpoint.method,
    url,
    auth,
    headers: buildHeaders(auth.token, input.body),
    ...(input.body === undefined ? {} : { body: input.body }),
  };
}

export function buildApiRequestPlan(input: {
  readonly method: RequestPlan["method"];
  readonly path: string;
  readonly options: GlobalOptions;
  readonly context: RuntimeContext;
  readonly query: readonly QueryEntry[];
  readonly body?: unknown;
}): RequestPlan {
  const auth = requireAccessToken(
    resolveAccessToken(input.options, input.context),
    "api request",
  );
  return {
    method: input.method,
    url: buildUrl(input.context.baseUrl, normalizePath(input.path), [
      ...input.query,
      ...assignmentsToQueryEntries(input.options.query),
    ]),
    auth,
    headers: buildHeaders(auth.token, input.body),
    ...(input.body === undefined ? {} : { body: input.body }),
  };
}

export async function executeRequest(
  plan: RequestPlan,
  fetcher: Fetcher = fetch,
): Promise<unknown> {
  const response = await fetcher(plan.url, {
    method: plan.method,
    headers: plan.headers,
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const payload =
    contentType.includes("application/json") && text
      ? (JSON.parse(text) as unknown)
      : text;

  if (!response.ok) {
    throw new Error(
      `HubSpot API returned ${response.status} ${response.statusText}: ${formatErrorPayload(payload)}`,
    );
  }

  return payload === "" ? null : payload;
}

export async function executeAllPages(
  initialPlan: RequestPlan,
  pagination: PaginationLocation,
  fetcher: Fetcher = fetch,
): Promise<unknown> {
  let plan = initialPlan;
  let firstPage: Record<string, unknown> | undefined;
  const results: unknown[] = [];
  const seenCursors = new Set<string>();

  for (;;) {
    const payload = await executeRequest(plan, fetcher);
    if (!isObject(payload) || !Array.isArray(payload.results)) {
      throw new Error(
        'HubSpot pagination expected a JSON object with a "results" array',
      );
    }

    firstPage ??= payload;
    results.push(...payload.results);
    const cursor = nextCursor(payload);
    if (!cursor) {
      const combined: Record<string, unknown> = { ...firstPage, results };
      delete combined.paging;
      return combined;
    }
    if (seenCursors.has(cursor)) {
      throw new Error(`HubSpot pagination repeated cursor "${cursor}"`);
    }
    seenCursors.add(cursor);
    plan = withCursor(plan, pagination, cursor);
  }
}

export function renderDryRun(plan: RequestPlan): unknown {
  return {
    method: plan.method,
    url: plan.url,
    auth: { source: plan.auth.source },
    headers: redact(plan.headers),
    body: redact(plan.body),
  };
}

function buildHeaders(
  token: string,
  body: unknown,
): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
  };
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: readonly QueryEntry[],
): string {
  const url = new URL(normalizePath(path), ensureTrailingSlash(baseUrl));
  for (const [name, value] of query) {
    url.searchParams.append(name, value);
  }
  return url.toString();
}

function fillPath(
  path: string,
  params: Record<string, string | undefined>,
): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const value = params[key];
    if (!value) {
      throw new Error(`Missing path parameter "${key}"`);
    }
    return encodeURIComponent(value);
  });
}

function withCursor(
  plan: RequestPlan,
  pagination: PaginationLocation,
  cursor: string,
): RequestPlan {
  if (pagination === "query") {
    const url = new URL(plan.url);
    url.searchParams.set("after", cursor);
    return { ...plan, url: url.toString() };
  }

  if (!isObject(plan.body)) {
    throw new Error("Body pagination requires a JSON object body");
  }
  return { ...plan, body: { ...plan.body, after: cursor } };
}

function nextCursor(payload: Record<string, unknown>): string | undefined {
  const paging = payload.paging;
  if (!isObject(paging) || !isObject(paging.next)) {
    return undefined;
  }
  const after = paging.next.after;
  return typeof after === "string" || typeof after === "number"
    ? String(after)
    : undefined;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function formatErrorPayload(payload: unknown): string {
  if (!isObject(payload)) {
    return typeof payload === "string" ? payload : JSON.stringify(payload);
  }

  const message =
    typeof payload.message === "string" ? payload.message : JSON.stringify(payload);
  const details = [
    typeof payload.category === "string"
      ? `category: ${payload.category}`
      : undefined,
    typeof payload.correlationId === "string"
      ? `correlationId: ${payload.correlationId}`
      : undefined,
  ].filter((value): value is string => value !== undefined);

  return details.length === 0 ? message : `${message} (${details.join(", ")})`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
