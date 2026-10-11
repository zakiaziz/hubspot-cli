import { CliError, statusFailure } from "./errors.js";
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
import { isRecord, isSensitiveKey } from "./util.js";
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

export class HubSpotApiError extends CliError {

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly apiMessage: string,
    readonly category?: string,
    readonly correlationId?: string,
  ) {
    const details = [
      category ? `category: ${category}` : undefined,
      correlationId ? `correlationId: ${correlationId}` : undefined,
    ].filter((value): value is string => value !== undefined);
    const suffix = details.length === 0 ? "" : ` (${details.join(", ")})`;

    super(
      "HubSpot API returned " + status + " " + statusText + ": " + apiMessage + suffix,
      statusFailure(status).code, statusFailure(status).exitCode,
      { status, provider_code: category, request_id: correlationId, retryable: statusFailure(status).retryable },
    );
    this.name = "HubSpotApiError";
  }
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
    timeoutMs: input.options.timeoutMs,
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
    timeoutMs: input.options.timeoutMs,
    ...(input.body === undefined ? {} : { body: input.body }),
  };
}

export async function executeRequest(
  plan: RequestPlan,
  fetcher: Fetcher = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(plan.url, {
    method: plan.method,
    headers: plan.headers,
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
    signal: AbortSignal.timeout(plan.timeoutMs ?? 30000),
    redirect: "error",
  });
  } catch {
    throw new CliError("HubSpot request failed, timed out, or was redirected. Check connectivity and the configured endpoint; mutation outcome may be unknown.", "TRANSIENT_FAILURE", 7, { retryable: plan.method === "GET" });
  }
  if (response.status >= 300 && response.status < 400) throw new CliError("HubSpot redirects are not followed.", "PROVIDER_ERROR", 1);
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("json") && !contentType.startsWith("text/")) throw new CliError("Unsupported binary response. Raw API access supports JSON or text only.", "PROVIDER_ERROR", 1);
  let payload: unknown = text;
  if (contentType.includes("json") && text) {
    try { payload = JSON.parse(text); }
    catch { throw new CliError("HubSpot returned malformed JSON.", "PROVIDER_ERROR", 1); }
  }

  if (!response.ok) {
    const details = parseErrorPayload(payload);
    throw new HubSpotApiError(
      response.status,
      response.statusText,
      details.message,
      details.category,
      details.correlationId,
    );
  }

  return payload === "" ? null : payload;
}

export async function executeAllPages(
  initialPlan: RequestPlan,
  pagination: PaginationLocation,
  fetcher: Fetcher = fetch,
  maxItems?: number,
): Promise<unknown> {
  let plan = initialPlan;
  let firstPage: Record<string, unknown> | undefined;
  const results: unknown[] = [];
  const seenCursors = new Set<string>();

  for (;;) {
    if (maxItems !== undefined) {
      const remaining = maxItems - results.length;
      plan = withPageLimit(plan, pagination, remaining);
    }
    const payload = await executeRequest(plan, fetcher);
    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      throw new CliError(
        'HubSpot pagination expected a JSON object with a "results" array',
        "INVALID_RESPONSE",
        1,
      );
    }

    firstPage ??= payload;
    results.push(...payload.results);
    const cursor = nextCursor(payload);
    if (maxItems !== undefined && results.length >= maxItems) {
      if (results.length > maxItems) {
        throw new CliError("--max-items stopped inside a provider page and cannot return a safe continuation cursor", "INVALID_RESPONSE", 1);
      }
      const combined: Record<string, unknown> = { ...firstPage, results };
      if (cursor) combined.paging = { next: { after: cursor } };
      else delete combined.paging;
      return combined;
    }
    if (!cursor) {
      const combined: Record<string, unknown> = { ...firstPage, results };
      delete combined.paging;
      return combined;
    }
    if (seenCursors.has(cursor)) {
      throw new CliError(`HubSpot pagination repeated cursor "${cursor}"`, "INVALID_RESPONSE", 1);
    }
    seenCursors.add(cursor);
    plan = withCursor(plan, pagination, cursor);
  }
}

export function renderDryRun(plan: RequestPlan): unknown {
  return {
    method: plan.method,
    url: redactUrl(plan.url),
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
  if (url.origin !== new URL(baseUrl).origin || url.username || url.password || url.hash) throw new CliError("API path must stay on the configured origin and contain no credentials or fragment.");
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
      throw new CliError(`Missing path parameter "${key}"`);
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

  if (!isRecord(plan.body)) {
    throw new CliError("Body pagination requires a JSON object body");
  }
  return { ...plan, body: { ...plan.body, after: cursor } };
}


function withPageLimit(
  plan: RequestPlan,
  pagination: PaginationLocation,
  limit: number,
): RequestPlan {
  if (pagination === "query") {
    const url = new URL(plan.url);
    const requested = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : NaN;
    url.searchParams.set("limit", String(Number.isFinite(requested) ? Math.min(requested, limit) : Math.min(100, limit)));
    return { ...plan, url: url.toString() };
  }
  if (!isRecord(plan.body)) throw new CliError("Body pagination requires a JSON object body");
  const requested = Number(plan.body.limit);
  return {
    ...plan,
    body: { ...plan.body, limit: Number.isFinite(requested) ? Math.min(requested, limit) : Math.min(100, limit) },
  };
}

function nextCursor(payload: Record<string, unknown>): string | undefined {
  const paging = payload.paging;
  if (!isRecord(paging) || !isRecord(paging.next)) {
    return undefined;
  }
  const after = paging.next.after;
  return typeof after === "string" || typeof after === "number"
    ? String(after)
    : undefined;
}

function redactUrl(input: string): string {
  const url = new URL(input);
  for (const name of [...url.searchParams.keys()]) {
    if (isSensitiveKey(name)) {
      url.searchParams.set(name, "[redacted]");
    }
  }
  return url.toString();
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function parseErrorPayload(payload: unknown): {
  message: string;
  category?: string;
  correlationId?: string;
} {
  if (!isRecord(payload)) {
    return {
      message:
        typeof payload === "string" ? payload : JSON.stringify(payload),
    };
  }

  return {
    message:
      typeof payload.message === "string"
        ? payload.message
        : JSON.stringify(payload),
    ...(typeof payload.category === "string"
      ? { category: payload.category }
      : {}),
    ...(typeof payload.correlationId === "string"
      ? { correlationId: payload.correlationId }
      : {}),
  };
}
