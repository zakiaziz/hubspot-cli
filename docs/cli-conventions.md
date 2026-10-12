# CLI conventions

The command-line contract of the `hubspot` executable. Read before designing,
implementing, or reviewing commands.

Rules have stable IDs. MUST is required; SHOULD permits a documented exception
with its reason. Cite IDs in findings. Existing code is not precedent. The
command registry in `src/` is the command specification (`CLI-SPEC-1`); the
README `Exceptions` section records every exception.

## Command grammar

~~~text
<tool> <resource> <action> [identifier] [options]
<tool> <resource> <subresource> <action> [identifier] [options]
<tool> <utility-group> <action> [arguments] [options]
~~~

- `CLI-GRAM-1` MUST use noun-first commands, plural resources, explicit actions,
  and lowercase kebab-case. Singleton concepts and utility groups remain
  singular: account, auth, config, api.
- `CLI-GRAM-2` MUST preserve meaningful provider terminology. Notes and
  transcripts need not share a name.
- `CLI-GRAM-3` SHOULD use at most one subresource level, only for a distinct
  concept. Do not mechanically reproduce API URL hierarchies.
- `CLI-GRAM-4` MUST use the action vocabulary below. Implement only supported
  provider capabilities; retain domain actions such as send and publish.
- `CLI-GRAM-5` MUST reserve edit for opening an editor. Flag-driven changes use
  update. Inspection uses get, not show, view, or details.
- `CLI-GRAM-6` SHOULD use one positional identifier for the primary target.
  Scope and secondary IDs use options; dynamic object types use --type.

| Action | Contract |
| --- | --- |
| list | Retrieve a collection, optionally filtered. |
| get | Retrieve one identified resource or singleton. |
| search | Search text or a documented provider expression. |
| create | Create a resource. |
| update | Change supplied fields; preserve omitted fields. |
| replace | Replace using a documented complete-input contract. |
| delete | Delete; document recoverability. |
| archive / restore | Change archival state where supported. |
| send / publish / retry | Perform the named domain operation. |
| export / import | Transfer content through a documented file format. |
| batch-get / batch-create / batch-update | Operate on explicit multiple targets. |

Examples:

~~~bash
hubspot objects get RECORD_ID --type contacts
hubspot objects update RECORD_ID --type deals --property amount=1000000
hubspot stages get STAGE_ID --type deals --pipeline-id PIPELINE_ID
hubspot account usage get
~~~

## Arguments and input

- `CLI-IN-1` MUST reject unknown commands, options, extra arguments, invalid
  values, and conflicting inputs before requests. Never execute guessed
  corrections or silently ignore options.
- `CLI-IN-2` MUST accept --name value and --name=value, and honor -- as the end
  of options. IDs are opaque strings. Alternate identifiers require explicit
  selectors such as --id-property email; do not infer their type.
- `CLI-IN-3` MUST interpret content literally. Use --body-file PATH for content
  files and --file PATH for complete structured input. A file path of - means
  stdin. Do not expand @filename in ordinary content.
- `CLI-IN-4` MUST reject complete-file input mixed with field flags unless the
  specification explicitly defines merging. Reject duplicate scalar options;
  declare repeatable options.
- `CLI-IN-5` SHOULD use repeatable collection options, such as --label account
  --label security, instead of comma-delimited input.
- `CLI-IN-6` MUST distinguish omitted, empty, null, and cleared update values.
  Document explicit clearing behavior; do not infer removal from empty strings.
- `CLI-IN-7` MUST document accepted ISO 8601 forms, date-only timezone, and
  inclusive or exclusive filter boundaries.
- `CLI-IN-8` MUST validate structured input. Free-form provider properties
  require explicit input such as --property name=value and documented types.

## Options

- `CLI-OPT-1` MUST use the global names and meanings below. An option is global
  only when applicable throughout the tool.
- `CLI-OPT-2` MUST reserve the listed short flags. New flags SHOULD have only
  long names. --version has no short form.
- `CLI-OPT-3` MUST keep pagination, confirmation, previews, and file input
  command-specific. Shared names do not make options global.
- `CLI-OPT-4` MUST reject irrelevant flags, unsupported formats, and conflicting
  options, including --quiet with --verbose. Never silently fall back.

| Global option | Contract |
| --- | --- |
| --help, -h | Local help; no credentials or network. |
| --version | Executable name and version as text. |
| --profile NAME | Select a saved configuration. |
| --format json\|pretty\|human | Default human: tables or labeled fields. Json: compact and uncolored, for agents and scripts. Pretty: indented JSON with syntax highlighting. |
| --quiet, -q | Suppress progress and notices, preserving results and errors. |
| --verbose, -v | Redacted diagnostics on stderr. |
| --no-input | Never prompt; fail for missing required input. |
| --color auto\|always\|never | Color for pretty and human formats; default auto. JSON format is always uncolored. |
| --timeout DURATION | Per-request timeout with units, such as 30s; document default. |

| Command-specific option | Contract |
| --- | --- |
| --yes, -y | Supply confirmation. |
| --dry-run | Preview without writes. |
| --all | Traverse all collection read pages. |
| --page-size N | Requested page size within provider limits. |
| --cursor TOKEN | Resume supported collection reads. |
| --max-items N | Bound total traversal. |
| --file PATH | Structured input; - reads stdin. |

Provider options such as --locale retain their meaning and declare their scope.
Additional presentation formats such as markdown require explicit command support.

## Utilities and configuration

- `CLI-CFG-1` MUST use these names for supported capabilities:
  profiles list|get|create|update|delete|use; auth verify;
  config get|list|path; completions bash|zsh|fish;
  api request METHOD PATH.
- `CLI-CFG-2` MUST implement setup through the same profile/config operations
  as explicit commands. Setup may create and activate a profile.
- `CLI-CFG-3` MUST read credentials and endpoint settings only from a profile.
  The profile is the one named by `--profile`, otherwise `activeProfile` in
  `config.json`. No environment variable supplies or selects credentials,
  endpoints, or profiles; scheduled jobs pass `--profile` explicitly. A missing
  requested or active profile fails without fallback. The profile stores
  whatever authenticates the tool (API key, token, cookie, email plus token),
  and each tool supports one authentication scheme.
- `CLI-CFG-4` MUST fill profile secrets through a hidden prompt (interactive)
  or `--<secret>-file PATH` (non-interactive, `-` reads stdin), never a
  command-line value. MUST redact secrets
  in diagnostics, previews, and configuration inspection. Declare intentional
  secret output, such as a newly created webhook signing secret.
- `CLI-CFG-5` MUST keep configuration in a directory named after the
  executable, `~/.config/hubspot`, never the repo or package name
  (`hubspot-cli`). Honor an absolute XDG_CONFIG_HOME with ~/.config as
  fallback, and protect credential files with mode 0600 and their directories
  with mode 0700 on Unix.
- `CLI-CFG-6` MUST describe what auth verify proves. A successful resource
  request does not prove identity or complete permission coverage.

## Help and completion

- `CLI-HELP-1` MUST provide --help at every command level: purpose, usage,
  types, defaults, allowed values, examples, output, pagination, side effects,
  and relevant failures.
- `CLI-HELP-2` MUST show help on stdout and exit 0 for no command and for a
  command group without an action: the root or group help, exactly as --help
  prints it. A leaf command with missing or invalid input fails with exit 2
  and focused usage.
- `CLI-HELP-3` MUST derive help and completions from the same command
  definitions. Completion commands print scripts, not edit shell files.
- `CLI-HELP-4` SHOULD support Bash, Zsh, and Fish completion for commands,
  options, static values, and local profiles. MUST NOT request network data
  for completion by default.

## Output

- `CLI-OUT-1` MUST default operational commands to --format human regardless
  of terminal detection, for the person at the keyboard. Agents and scripts
  pass --format json: compact JSON on one line, with no indentation, syntax
  highlighting, or extra whitespace outside string values, followed by one
  newline. --format pretty is indented, colorized JSON for debugging. Help,
  version, and completion retain documented text outputs.
- `CLI-OUT-2` MUST send results to stdout and progress, warnings, prompts,
  diagnostics, and errors to stderr. Structured results contain no surrounding
  prose. --format json never contains ANSI escape sequences, even with
  --color always.
- `CLI-OUT-3` MUST emit one JSON document for ordinary successful operations.
  First-class commands use a data/meta envelope. data is an object for one
  resource, an array for collections, or null for no returned resource.
- `CLI-OUT-4` MUST preserve provider field names within data. Paginated meta
  includes next_cursor and has_more where supported. Every network command's
  meta includes profile, the name of the profile that supplied credentials. Never claim completeness
  for truncated or provider-capped results.
- `CLI-OUT-5` MUST preserve provider JSON shape for raw api request output.
  Represent non-JSON text as a JSON string and an empty body as null.
  Unsupported binary output fails explicitly.
- `CLI-OUT-6` SHOULD use tables for human collections and labeled fields for
  individual resources. Human output is not a parsing contract.

~~~json
{
  "data": [{"id": "101", "properties": {"firstname": "Ada"}}],
  "meta": {"next_cursor": null, "has_more": false}
}
~~~

- `CLI-OUT-7` MUST support --format pretty for the same JSON document and fields
  as json, indented with two spaces and followed by one newline. Syntax
  highlighting follows --color; formatting never changes values or schemas.
- `CLI-OUT-8` MUST apply color independently to each output stream in pretty
  and human modes. With --color auto, highlight only when that stream is a
  terminal and NO_COLOR is unset or empty. --color never disables color;
  explicit --color always enables it, including when redirected or NO_COLOR
  is set. ANSI-colored pretty output is presentation, not parseable JSON;
  --format json always remains parseable and uncolored.
- `CLI-OUT-9` MUST use --format human as the default presentation and support
  --format json and pretty explicitly. Do not switch formats automatically
  based on terminal detection.

~~~bash
hubspot objects list --type contacts                  # Human-readable table (default).
hubspot objects list --type contacts --format json    # Compact, uncolored JSON.
hubspot objects list --type contacts --format pretty  # Indented JSON; highlighted in a terminal.
hubspot objects list --type contacts --format pretty --color never
~~~

## Errors and exit codes

- `CLI-ERR-1` MUST send structured errors to stderr in json and pretty modes,
  using the selected format and that stream's color policy, and actionable
  text in human mode. Codes are stable; messages identify the failed
  constraint and invalid value when safe. Never echo secrets.
- `CLI-ERR-2` MUST include provider status, code, and request ID when available.
  State retryability without implying that repeating a mutation is safe.
- `CLI-ERR-3` MUST use the exit codes below. Empty collections succeed;
  missing requested individual resources fail.
- `CLI-ERR-4` MUST report completed and failed steps/items on partial operations,
  exit 8, and avoid implying rollback. Specify the partial-result schema.

| Code | Meaning |
| --- | --- |
| 0 | Success, including empty collections. |
| 1 | Unexpected or unclassified failure. |
| 2 | Invalid command, argument, or option. |
| 3 | Missing or invalid configuration or authentication. |
| 4 | Permission denied. |
| 5 | Resource not found. |
| 6 | Conflict or unmet precondition. |
| 7 | Rate limit or transient service/network failure. |
| 8 | Partial completion. |
| 9 | Confirmation required or declined. |
| 130 | Interrupted by user. |

~~~json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "--page-size must be an integer from 1 to 100; received \"101\".",
    "hint": "Use --page-size 100.",
    "retryable": false
  }
}
~~~

## Mutations and automation

- `CLI-SAFE-1` MUST require confirmation for remote mutations. In an interactive
  terminal, show profile, target, and effects before prompting. --yes supplies
  confirmation, never missing fields, validation bypass, or authorization.
- `CLI-SAFE-2` MUST NOT prompt with --no-input, nonterminal stdin, or CI mode.
  Missing confirmation exits 9. CI mode means CI is nonempty and not 0 or false,
  case-insensitively. Never consume request-content stdin as prompt input.
- `CLI-SAFE-3` MUST NOT alias --force to --yes. A constraint override requires
  a distinct documented meaning and still needs mutation confirmation.
- `CLI-SAFE-4` MUST make dry runs write-free and redact previews. State whether
  previews validate locally or also read remotely. Preview success does not
  guarantee execution success. Dry runs need no confirmation.
- `CLI-SAFE-5` MUST classify first-class operations by effects, not HTTP method.
  POST search is a read. Raw requests conservatively require confirmation for
  methods other than GET, HEAD, and OPTIONS.
- `CLI-SAFE-6` MUST require explicit targets for destructive batches. --all
  belongs to read pagination, never implicit mutation scope.
- `CLI-SAFE-7` MUST document multi-request atomicity. Do not promise rollback
  without implementing it.
- `CLI-SAFE-8` MUST return job ID and status for asynchronous work. If supported,
  --wait has a documented overall timeout distinct from request timeout.

## Pagination, batches, and retries

- `CLI-PAGE-1` MUST fetch one page by default. --all follows continuation;
  --max-items bounds traversal. Document provider limits and ordering.
- `CLI-PAGE-2` MUST preserve continuation without skipping items. When stopping
  mid-page, preserve unread position or stop at a resumable boundary.
  Never return a next-page cursor after discarding unread current-page items.
- `CLI-PAGE-3` MUST report pagination limitations. Do not invent usable cursors
  when the provider cannot support continuation.
- `CLI-BATCH-1` MUST use explicit batch actions and per-item outcomes.
  Partial success is not exit 0.
- `CLI-RETRY-1` SHOULD retry safe reads with bounded backoff and provider retry
  guidance. MUST NOT automatically retry mutations unless duplicate effects
  are prevented. An unknown outcome is not proof of failure.

## Raw API access

- `CLI-API-1` MUST use api request METHOD PATH, repeatable --query key=value,
  and --file PATH for structured bodies. Preserve explicit provider query names.
  Reject unknown flags instead of translating them into API fields.
- `CLI-API-2` MUST document supported methods, authentication, and content
  types. Never silently send selected-profile credentials to another origin.
- `CLI-API-3` MUST separate raw access from first-class input contracts.
  It is an escape hatch, not a second implicit option interpretation.

## Compatibility and implementation

- `CLI-COMPAT-1` MUST version commands, options, defaults, JSON shapes, and exit
  codes as contracts. Publish migration mappings before removing old behavior.
- `CLI-COMPAT-2` MUST keep one canonical spelling. Temporary aliases warn on
  stderr and name their removal release. Do not add permanent get/show/view
  or singular/plural synonyms.
- `CLI-COMPAT-3` MUST explicitly migrate existing -v version behavior before
  assigning -v to verbose. Do not silently reinterpret scripts.
- `CLI-ARCH-1` SHOULD share parsing, output, errors, confirmation, and help
  machinery. MUST keep provider authentication and API behavior in focused
  components. Prefer composition over a provider-aware base class.
- `CLI-VERIFY-1` MUST verify changed contracts by running the built CLI:
  parsing failures before requests, streams, schemas, exit codes,
  non-interactive execution, confirmation, previews, pagination, and partial
  failures as relevant, using loopback mock servers for network paths. The
  repository carries no test suite. Never exercise live mutations merely to
  test CLI behavior.

## Distribution and installation

- `CLI-DIST-1` MUST publish as `@zakiaziz/hubspot-cli` on the npm registry. The
  `bin` key is `hubspot`.
- `CLI-DIST-2` MUST target Node. The executable starts with
  `#!/usr/bin/env node`, `engines.node` names the oldest supported Node LTS
  (currently `>=22`), and code uses only Node APIs, never `Bun.*` globals. Bun
  runs the same file unchanged.
- `CLI-DIST-3` MUST ship a prebuilt executable. `bin` points into `dist/`,
  `dist/` stays out of Git, `prepack` runs the build, and `files` lists only
  `dist`, `README.md`, `LICENSE`, and `docs`. The build bundles dependencies
  with `bun build --target=node`.
- `CLI-DIST-4` MUST declare `license`, `repository`, and
  `"publishConfig": {"access": "public"}`.
- `CLI-DIST-5` MUST document installation in the README as
  `npm install -g @zakiaziz/hubspot-cli` and `bun add -g @zakiaziz/hubspot-cli`.
  User-facing install steps never require `git clone` or a build.
- `CLI-DIST-6` MUST install maintainer checkouts with `bun link` from the
  checkout, which places the command in `~/.bun/bin`. Keep one install per
  machine: no copies in nvm, `~/.local/bin`, or other global prefixes.
- `CLI-DIST-7` MUST keep runtime selection out of the package. Maintainer
  machines that run only Bun invoke the linked command as `bun <command path>`
  from a shell profile script; the published file carries no launcher logic.
  Cron jobs and systemd units load no profile, so they call
  `/home/<user>/.bun/bin/bun /home/<user>/.bun/bin/hubspot` with absolute
  paths.
- `CLI-DIST-8` MUST keep the repository self-contained. Code, docs, and commit
  messages describe only this tool: no references to any employer, to other
  tools, or to an external standards file. Because the code and docs cite rule
  IDs, the repository ships this file.
- `CLI-DIST-9` MUST commit as `Zaki Aziz <vexity@gmail.com>`, set in this
  repository with `git config user.email`, so a different global Git identity
  never applies.
- `CLI-DIST-10` MUST keep an unpublished tool at version `0.1.0` with no
  migration guides. Versioning and `CLI-COMPAT-1` migration mappings start with
  the first npm publish.
- `CLI-DIST-11` MUST NOT add CI workflows (`.github/workflows` or similar).

~~~bash
npm install -g @zakiaziz/hubspot-cli    # Node users.
bun add -g @zakiaziz/hubspot-cli        # Bun users.
cd hubspot-cli && bun run build && bun link   # Maintainers.
~~~

## Command specification template

- `CLI-SPEC-1` MUST specify each new or changed command using these fields in
  its command registry. Reference shared policies instead of duplicating them. Record exceptions with rule IDs and reasons.

~~~yaml
command: hubspot objects update
summary: Update one record.
arguments:
  - name: RECORD_ID
    type: string
    required: true
options:
  - name: type
    type: string
    required: true
  - name: file
    type: path
    stdin: true
    conflicts: [property]
  - name: property
    type: key-value
    repeatable: true
  - name: query
    type: key-value
    repeatable: true
validation:
  - Require --property or --file, not both.
  - Reject unknown options and duplicate scalar options.
authentication:
  credential: required
  profile: optional
effects:
  kind: remote-mutation
  confirmation: required
  dry-run: supported
  atomic: true
  sequence:
    - Send one PATCH request with the supplied properties.
output:
  human: Labeled fields of the updated record.
pagination: not-applicable
failures:
  - INVALID_ARGUMENT
  - AUTHENTICATION_FAILED
  - PERMISSION_DENIED
  - NOT_FOUND
  - CONFLICT
  - CONFIRMATION_REQUIRED
retry:
  automatic: false
  reason: A repeated mutation may duplicate effects.
examples:
  - hubspot objects update 12345 --type deals --property amount=1000000 --dry-run
  - hubspot objects update 12345 --type deals --property amount=1000000 --yes
compatibility:
  deprecated-aliases: []
exceptions: []
~~~

## References

The numbered rules define this tool's contract. The human default, the JSON envelope, and
exit-code assignments are deliberate choices, not universal Unix requirements.

- [Command Line Interface Guidelines](https://clig.dev/)
- [GNU argument syntax conventions](https://sourceware.org/glibc/manual/2.33/html_node/Argument-Syntax.html)

## Tool notes

- Transport: first-class commands send REST requests with a bearer token to the configured base URL, `https://api.hubapi.com` by default. The registry in `src/registry.ts` holds each path, query, and body, and `src/provider.ts` holds authentication, pagination, and error mapping. Shared parsing, help, output, errors, confirmation, configuration, and HTTP machinery (`CLI-ARCH-1`) is vendored in `src/core/` and never edited in this repository.
- Scope: dynamic object types use `--type OBJECT_TYPE`, pipeline scope uses `--pipeline-id PIPELINE_ID`, and association commands take `--from-type`, `--from-id`, `--to-type`, and `--to-id`. Every scope option is required (`CLI-GRAM-6`).
- Identifiers: positional IDs and scope options are rejected when empty, `.`, `..`, or when they contain control characters, and each one is passed through `encodeURIComponent` as a single path segment. `api request` rejects `.` and `..` path segments.
- Input: `--file PATH` reads the complete JSON input, and `-` reads stdin (`CLI-IN-3`). The tool never expands `@filename`. `--file` conflicts with `--property` (`CLI-IN-4`). `--property NAME=VALUE` (`objects create` and `update`) is repeatable and sets literal string values, including an explicit empty string. HubSpot can treat an empty string as clearing the property (`CLI-IN-6`); omitted properties keep their values. `--query KEY=VALUE` is repeatable and sends exact HubSpot query parameter names. Paginated commands reject `limit` and `after`; use `--page-size` and `--cursor`. `objects search` and the batch commands take their complete input from `--file` (`CLI-IN-8`): the body must be a JSON object that holds only the documented top-level fields, a batch body needs a nonempty `inputs` array whose items hold the fields that command requires, and IDs are nonempty strings. A search body must not hold `limit` or `after`. A file larger than HubSpot's per-request limit (100 inputs for object batches, 1,000 for `associations batch-get`, 2,000 for the other association batches) fails before any request.
- Dates: this tool has no date options. Query parameters and request bodies keep HubSpot's provider contract (`CLI-IN-7`).
- Updates: `objects update`, `objects batch-update`, `properties update`, `pipelines update`, `stages update`, and `schemas update` preserve omitted fields.
- API version: first-class commands use the HubSpot API version from the selected profile, and `2026-03` when the profile sets none. `--api-version` only stores the value in a profile on `setup` and `profiles create|update`. The version is an endpoint field, so it appears on `setup` and `profiles` and is stored in the profile.
- Cursors: HubSpot `paging.next.after` values pass through unchanged as strings. A numeric `after` is read as a decimal string.
- Partial results: a repeated cursor or an oversized page on the first page is `INVALID_RESPONSE`. On a later page, the error is `PARTIAL_FAILURE` with `details.cause` set to `INVALID_RESPONSE` and `partial` holding the completed pages. Every first-class mutation sends one request; the tool starts no asynchronous jobs (`CLI-SAFE-8`). Single-record mutations are atomic from the CLI's point of view, but batch commands are not (`CLI-SAFE-7`): HubSpot can apply some items and reject others in one response, and nothing is rolled back.
- Secret handling: the access token is replaced with `[redacted]` in HubSpot messages, codes, and request IDs before anything prints. Base URL and `PATH` errors echo the received value with only URL credentials redacted.
- Identity: `auth verify` sends `GET /account-info/VERSION/details`, where `VERSION` is the configured API version. Success proves that HubSpot accepted the access token for that request and identifies the account. It does not prove complete permission coverage (`CLI-CFG-6`).
- Search: `objects search` is a read (`CLI-SAFE-5`), so it needs no confirmation and has no `--dry-run`. It sends the page size and cursor in the request body, and the cursor is a decimal offset. HubSpot serves at most 10,000 results per query, so a read that reaches the limit reports `has_more: true` with a null `next_cursor` (`CLI-PAGE-3`, `CLI-OUT-4`).
- Batches: `batch-get` reads and needs no confirmation. The batch writes (`batch-create`, `batch-update`, `batch-upsert`, `batch-archive`, `associations batch-create`, `batch-create-default`, and `batch-delete`) need confirmation and support `--dry-run`. They have no `--all`, because every target is explicit in the file (`CLI-SAFE-6`). A response that lists item errors fails with `PARTIAL_FAILURE` and exit 8 (`CLI-BATCH-1`, `CLI-ERR-4`). `error.partial.completed` holds the completed items, `error.partial.failed` holds each rejected item, named by the ID or trace ID HubSpot reports, with an error code mapped from the HubSpot category, and `error.partial.not_attempted` is empty because HubSpot attempts every item. `error.provider` holds the HTTP status and correlation ID, and item messages are scrubbed of secret values from the request. A batch is never retried automatically after a failure that may have applied it (`CLI-RETRY-1`), and `batch-get` retries like any read. A result of `associations batch-get` can carry `paging.next.after`; the tool does not follow it, and the caller resubmits that record with `after` set (`CLI-PAGE-3`).
