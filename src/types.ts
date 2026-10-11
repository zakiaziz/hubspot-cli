export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type PaginationLocation = "query" | "body";

export interface Endpoint {
  readonly name: string;
  readonly pattern: readonly string[];
  readonly method: HttpMethod;
  readonly path: string;
  readonly description: string;
  readonly mutation: boolean;
  readonly pagination?: PaginationLocation;
}

export interface UnknownFlag {
  readonly name: string;
  readonly value: string | boolean;
}

export interface ParsedArgs {
  readonly command: string[];
  readonly flags: Record<string, string | boolean | string[]>;
  readonly unknownFlags: UnknownFlag[];
}

export interface Profile {
  readonly accessToken?: string;
  readonly baseUrl?: string;
  readonly apiVersion?: string;
}

export interface GlobalOptions {
  readonly profile?: string;
  readonly accessToken?: string;
  readonly baseUrl?: string;
  readonly apiVersion?: string;
  readonly file?: string;
  readonly set: string[];
  readonly query: string[];
  readonly properties: string[];
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly all: boolean;
  readonly cursor?: string;
  readonly pageSize?: number;
  readonly maxItems?: number;
  readonly format: "json" | "pretty" | "human";
  readonly color: "auto" | "always" | "never";
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly noInput: boolean;
  readonly timeoutMs: number;
  readonly help: boolean;
  readonly version: boolean;
}

export type QueryEntry = readonly [name: string, value: string];

export interface ResolvedAuth {
  readonly token?: string;
  readonly source?: string;
}

export interface RequestPlan {
  readonly method: HttpMethod;
  readonly url: string;
  readonly auth: ResolvedAuth;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}
