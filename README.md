# hubspot-cli

Command-line interface for the HubSpot CRM API. It reads and changes CRM records, properties, pipelines, stages, associations, owners, and custom object schemas, and sends raw API requests. It is not an official HubSpot product.

## Install

Requires Node.js 22 or newer.

```bash
npm install -g @zakiaziz/hubspot-cli
bun add -g @zakiaziz/hubspot-cli
cd hubspot-cli && bun run build && bun link
```

## Quick start

```bash
hubspot setup
# List contacts as a table.
hubspot objects list --type contacts --page-size 25 --format human
# Get one deal record.
hubspot objects get 12345 --type deals
# Preview a deal update without sending it.
hubspot objects update 12345 --type deals --property amount=1000000 --dry-run
```

## Commands

### account

| Command | Description | Options |
| --- | --- | --- |
| hubspot account get | Get account details. | --query KEY=VALUE |
| hubspot account usage get | Get private-app daily API usage. | --query KEY=VALUE |

### association-labels

| Command | Description | Options |
| --- | --- | --- |
| hubspot association-labels list | List association labels between two object types. | --from-type OBJECT_TYPE, --to-type OBJECT_TYPE, --query KEY=VALUE |

### associations

| Command | Description | Options |
| --- | --- | --- |
| hubspot associations list | List a record's associations to one object type. | --from-type OBJECT_TYPE, --from-id RECORD_ID, --to-type OBJECT_TYPE, --query KEY=VALUE, --page-size N, --cursor TOKEN, --all, --max-items N |
| hubspot associations create | Create labeled associations between two records. | --from-type OBJECT_TYPE, --from-id RECORD_ID, --to-type OBJECT_TYPE, --to-id RECORD_ID, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot associations delete | Delete every association between two records. | --from-type OBJECT_TYPE, --from-id RECORD_ID, --to-type OBJECT_TYPE, --to-id RECORD_ID, --query KEY=VALUE, --yes, --dry-run |
| hubspot associations create-default | Create the default association between two records. | --from-type OBJECT_TYPE, --from-id RECORD_ID, --to-type OBJECT_TYPE, --to-id RECORD_ID, --query KEY=VALUE, --yes, --dry-run |

### objects

| Command | Description | Options |
| --- | --- | --- |
| hubspot objects list | List records of one object type. | --type OBJECT_TYPE, --query KEY=VALUE, --page-size N, --cursor TOKEN, --all, --max-items N |
| hubspot objects get RECORD_ID | Get one record. | --type OBJECT_TYPE, --query KEY=VALUE |
| hubspot objects create | Create one record. | --type OBJECT_TYPE, --file PATH, --property NAME=VALUE, --query KEY=VALUE, --yes, --dry-run |
| hubspot objects update RECORD_ID | Update one record. | --type OBJECT_TYPE, --file PATH, --property NAME=VALUE, --query KEY=VALUE, --yes, --dry-run |
| hubspot objects archive RECORD_ID | Archive one record. | --type OBJECT_TYPE, --query KEY=VALUE, --yes, --dry-run |

### owners

| Command | Description | Options |
| --- | --- | --- |
| hubspot owners list | List owners. | --query KEY=VALUE, --page-size N, --cursor TOKEN, --all, --max-items N |
| hubspot owners get OWNER_ID | Get one owner. | --query KEY=VALUE |

### pipelines

| Command | Description | Options |
| --- | --- | --- |
| hubspot pipelines list | List pipelines of one object type. | --type OBJECT_TYPE, --query KEY=VALUE |
| hubspot pipelines get PIPELINE_ID | Get one pipeline. | --type OBJECT_TYPE, --query KEY=VALUE |
| hubspot pipelines create | Create a pipeline. | --type OBJECT_TYPE, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot pipelines update PIPELINE_ID | Update a pipeline. | --type OBJECT_TYPE, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot pipelines replace PIPELINE_ID | Replace a pipeline. | --type OBJECT_TYPE, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot pipelines delete PIPELINE_ID | Delete a pipeline. | --type OBJECT_TYPE, --query KEY=VALUE, --yes, --dry-run |

### properties

| Command | Description | Options |
| --- | --- | --- |
| hubspot properties list | List property definitions of one object type. | --type OBJECT_TYPE, --query KEY=VALUE |
| hubspot properties get PROPERTY_NAME | Get one property definition. | --type OBJECT_TYPE, --query KEY=VALUE |
| hubspot properties create | Create a property definition. | --type OBJECT_TYPE, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot properties update PROPERTY_NAME | Update a property definition. | --type OBJECT_TYPE, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot properties archive PROPERTY_NAME | Archive a property definition. | --type OBJECT_TYPE, --query KEY=VALUE, --yes, --dry-run |

### schemas

| Command | Description | Options |
| --- | --- | --- |
| hubspot schemas list | List custom object schemas. | --query KEY=VALUE |
| hubspot schemas get OBJECT_TYPE | Get one custom object schema. | --query KEY=VALUE |
| hubspot schemas create | Create a custom object schema. | --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot schemas update OBJECT_TYPE | Update a custom object schema. | --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot schemas delete OBJECT_TYPE | Delete a custom object schema. | --query KEY=VALUE, --yes, --dry-run |

### stages

| Command | Description | Options |
| --- | --- | --- |
| hubspot stages list | List the stages of one pipeline. | --type OBJECT_TYPE, --pipeline-id PIPELINE_ID, --query KEY=VALUE |
| hubspot stages get STAGE_ID | Get one pipeline stage. | --type OBJECT_TYPE, --pipeline-id PIPELINE_ID, --query KEY=VALUE |
| hubspot stages create | Create a pipeline stage. | --type OBJECT_TYPE, --pipeline-id PIPELINE_ID, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot stages update STAGE_ID | Update a pipeline stage. | --type OBJECT_TYPE, --pipeline-id PIPELINE_ID, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot stages replace STAGE_ID | Replace a pipeline stage. | --type OBJECT_TYPE, --pipeline-id PIPELINE_ID, --file PATH, --query KEY=VALUE, --yes, --dry-run |
| hubspot stages delete STAGE_ID | Delete a pipeline stage. | --type OBJECT_TYPE, --pipeline-id PIPELINE_ID, --query KEY=VALUE, --yes, --dry-run |

### setup

| Command | Description | Options |
| --- | --- | --- |
| hubspot setup [NAME] | Create and activate a profile. | --access-token-file PATH, --base-url URL, --api-version API_VERSION, --from-env |

### profiles

| Command | Description | Options |
| --- | --- | --- |
| hubspot profiles list | List saved profiles. | None |
| hubspot profiles get NAME | Get one saved profile with secrets redacted. | None |
| hubspot profiles create NAME | Create a profile without activating it. | --access-token-file PATH, --base-url URL, --api-version API_VERSION |
| hubspot profiles update NAME | Update fields of a profile. | --access-token-file PATH, --base-url URL, --api-version API_VERSION, --clear-base-url, --clear-api-version |
| hubspot profiles delete NAME | Delete a profile. | None |
| hubspot profiles use NAME | Make a profile the active profile. | None |

### config

| Command | Description | Options |
| --- | --- | --- |
| hubspot config list | List every configuration key. | None |
| hubspot config get KEY | Get one configuration value. | None |
| hubspot config set KEY VALUE | Set one configuration value. | None |
| hubspot config unset KEY | Remove one configuration value. | None |
| hubspot config path | Get the configuration paths. | None |

### auth

| Command | Description | Options |
| --- | --- | --- |
| hubspot auth verify | Verify the access token. | None |

### api

| Command | Description | Options |
| --- | --- | --- |
| hubspot api request METHOD PATH | Send a raw API request. | --query KEY=VALUE, --file PATH, --yes, --dry-run |

### completions

| Command | Description | Options |
| --- | --- | --- |
| hubspot completions SHELL | Print a shell completion script. | None |

## Global options

| Option | Description |
| --- | --- |
| -h, --help | Show help. Uses no credentials or network. |
| --version | Print the executable name and version. |
| --profile NAME | Select a saved profile. |
| --format FORMAT | Output format. Allowed: json, pretty, human. Default: json. |
| --color WHEN | Color for pretty and human output. Allowed: auto, always, never. Default: auto. |
| -q, --quiet | Suppress progress and notices. Results and errors still print. |
| -v, --verbose | Print redacted diagnostics to stderr. |
| --no-input | Never prompt. Fail when input is missing. |
| --timeout DURATION | Per-request timeout in ms, s, or m, from 1ms to 10m. Default: 30s. |

Network commands (the resource commands, `auth verify`, and `api request`) accept every option except `--version`. Local commands (`setup`, `profiles`, and `config`) accept `--help`, `--format`, `--color`, `--quiet`, `--verbose`, and `--no-input`. `completions` accepts only `--help`. With no command, only `--help`, `--version`, `--verbose`, and `--quiet` apply, and `--version` with a command word fails.

## Authentication

Create a HubSpot private app, grant it the scopes your commands need, and copy its access token.

```bash
hubspot setup work --access-token-file ./hubspot-access-token.txt
hubspot auth verify
```

`setup [NAME]` creates a profile (default name: `default`) and makes it the active profile. It fails when the profile exists. If activation fails after the profile is written, the profile stays saved and `setup` exits 8 with `PARTIAL_FAILURE`. In a terminal without `--no-input`, `setup` prompts for a missing access token with hidden input. Secrets are never command-line values: pass `--access-token-file PATH` (`-` reads stdin), set `HUBSPOT_ACCESS_TOKEN`, or enter the token at the prompt. `setup --from-env` copies `HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_BASE_URL`, and `HUBSPOT_API_VERSION` into the profile and cannot be combined with `--access-token-file`, `--base-url`, or `--api-version`.

| Variable | Purpose |
| --- | --- |
| `HUBSPOT_PROFILE` | Select a saved profile. |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot private app access token (bearer token). |
| `HUBSPOT_BASE_URL` | API base URL. Default: `https://api.hubapi.com`. |
| `HUBSPOT_API_VERSION` | API version of first-class commands, as `YYYY-MM`. Default: `2026-03`. |
| `XDG_CONFIG_HOME` | Configuration root when it is an absolute path. Otherwise `~/.config`. |
| `NO_COLOR` | Disables color with `--color auto` when set and nonempty. |
| `CI` | Disables prompts when nonempty and not `0` or `false`. |

A `HUBSPOT_` variable that is set but empty, a malformed `HUBSPOT_PROFILE`, and an invalid `HUBSPOT_BASE_URL` or `HUBSPOT_API_VERSION` fail with `CONFIGURATION_ERROR` and name the variable. None of them falls through to the next source.

Precedence:

1. Profile selection: `--profile`, `HUBSPOT_PROFILE`, then `activeProfile` in `config.json`. A selected or active profile that does not exist fails with `CONFIGURATION_ERROR`, with no fallback.
2. Credentials: `HUBSPOT_ACCESS_TOKEN`, then the selected profile.
3. Base URL: `HUBSPOT_BASE_URL`, the selected profile, `baseUrl` in `config.json`, then the default.
4. API version: `HUBSPOT_API_VERSION`, the selected profile, `apiVersion` in `config.json`, then the default.

`hubspot auth verify` sends `GET /account-info/VERSION/details`, where `VERSION` is the configured API version (default `2026-03`). Success proves that HubSpot accepted the access token for that request and returns the account details as `identity`. It does not prove complete permission coverage. The tool does not refresh OAuth tokens.

## Output and errors

The default output format is `json`: one compact, uncolored line on stdout with the envelope `{"data":...,"meta":{...}}`. `--format pretty` prints the same document indented, with syntax highlighting when color applies. `--format human` prints tables for collections and labeled fields for one resource. Errors go to stderr in the selected format. Help, `--version`, and `completions` print plain text.

`data` is an object for one resource, an array for a collection, or `null` when HubSpot returns no content, and keeps HubSpot's field names. `meta` is always present.

| `meta` key | When |
| --- | --- |
| `next_cursor` | Paginated collection reads. A string, or `null` when no page remains. |
| `has_more` | Paginated collection reads. |
| `provider` | Other collection fields that HubSpot returns, such as `total`. |
| `dry_run`, `validation` | Dry-run previews. `validation` is `local`. |

Errors print one document on stderr, for example `{"error":{"code":"RATE_LIMITED","message":"...","hint":"...","retryable":true,"provider":{"status":429}}}`. Optional keys are `hint`, `outcome` (`unknown` when a mutation may have applied), `provider` (`status`, `code`, `request_id`, `retry_after_seconds`), `details`, and `partial`. `--format human` prints `Error [CODE]: message` and `Hint: ...`.

| Exit | Error codes |
| --- | --- |
| 0 | Success, including empty collections. |
| 1 | `UNEXPECTED_ERROR`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, `UNSUPPORTED_RESPONSE` |
| 2 | `INVALID_ARGUMENT`, `INVALID_REQUEST` |
| 3 | `CONFIGURATION_ERROR`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED` |
| 4 | `PERMISSION_DENIED` |
| 5 | `NOT_FOUND` |
| 6 | `CONFLICT` |
| 7 | `RATE_LIMITED`, `TRANSIENT_FAILURE` |
| 8 | `PARTIAL_FAILURE` |
| 9 | `CONFIRMATION_REQUIRED`, `CONFIRMATION_DECLINED` |
| 130 | `INTERRUPTED` |

IDs are opaque strings. Options accept `--name value` and `--name=value`, and `--` ends options. Unknown commands, options, extra arguments, invalid values, and conflicting options fail with exit code 2 before any request. This tool has no date options. `--query KEY=VALUE` sends exact HubSpot query parameter names, and `--property NAME=VALUE` sets literal string values. An empty `VALUE` sends an empty string that HubSpot can treat as clearing the property, and omitted properties keep their values. `--file PATH` sends the file as the request body, which is HubSpot's documented body for that endpoint. `replace` commands send the complete resource, and `update` commands send only the fields in the file.

Mutations (every `create`, `update`, `replace`, `archive`, and `delete` command, and `api request` with `POST`, `PUT`, `PATCH`, or `DELETE`) need confirmation. The CLI validates arguments first, then resolves credentials (exit 3 when missing), then asks for confirmation. In a terminal, it shows the profile, operation, request, and effect, then prompts. `--yes` confirms without a prompt. With `--no-input`, a non-terminal stdin or stderr, or CI mode, a missing confirmation exits 9. Ctrl-C or end of input at a prompt exits 130 with `INTERRUPTED`. `--dry-run` prints a redacted preview of the request, with headers in the order `Authorization`, `Accept`, `Content-Type`, and sends nothing. It needs no credentials. Preview success does not guarantee that the request succeeds.

Reads make up to 3 attempts on HTTP 429, 500, 502, 503, 504, network errors, and timeouts, waiting 250 ms, then 500 ms, or the `Retry-After` value up to 10 seconds. A `Retry-After` above 10 seconds is not waited on: the command fails with `RATE_LIMITED` and `provider.retry_after_seconds`. Mutations make one attempt. `--timeout` applies to each attempt. `--verbose` writes redacted request, response, and retry diagnostics to stderr.

## Pagination

Paginated commands fetch one page by default. `objects list` accepts `--page-size` up to 100. `owners list` and `associations list` accept up to 500. The default is 100 for all three. The CLI keeps HubSpot's order, which HubSpot does not document, and never sorts. HubSpot cursors (`paging.next.after`) pass through unchanged as strings, and a numeric cursor is read as a decimal string. `--query limit=N` and `--query after=TOKEN` are rejected on these commands; use `--page-size` and `--cursor`.

`--all` follows every cursor. `--max-items N` (with `--all`) shrinks the last request so the read stops on a page boundary, and `meta.next_cursor` resumes it. `--cursor TOKEN` resumes from a previous `meta.next_cursor`, with or without `--all`.

```bash
hubspot objects list --type contacts --all --max-items 500 > contacts.json
hubspot objects list --type contacts --all --cursor "$(jq -r '.meta.next_cursor' contacts.json)"
```

A repeated cursor or an oversized page on the first page fails with `INVALID_RESPONSE` and exit 1. A failure on a later page exits 8 with `PARTIAL_FAILURE`. The items read so far are in `error.partial.data`, `error.partial.next_cursor` points at the first unread item, and `error.details.cause` names the underlying error code, such as `INVALID_RESPONSE`. The property, pipeline, stage, schema, and association label lists are unpaginated: HubSpot returns the full list in one response, and `meta` is empty.

## Raw API access

```bash
hubspot api request GET /crm/objects/2026-03/contacts --query limit=5
hubspot api request PATCH /crm/objects/2026-03/contacts/12345 --file contact.json --dry-run
```

Methods: `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH`, `DELETE`. `PATH` starts with a single `/` and has no scheme, host, query string, fragment, whitespace, or `.` and `..` segments. Add query parameters with the repeatable `--query KEY=VALUE`. `--file PATH` sends a JSON body as `application/json` (`-` reads stdin). `--file`, `--yes`, and `--dry-run` are rejected on `GET`, `HEAD`, and `OPTIONS`. The CLI sends the selected profile's bearer token only to the configured API origin. JSON responses print as parsed, other text prints as a JSON string, an empty body prints `null`, and binary responses fail with `UNSUPPORTED_RESPONSE`. Non-2xx responses use the same error mapping as other commands. First-class commands use the configured HubSpot API version (default `2026-03`) in their paths, and raw paths carry whatever version you write.

## Configuration

Files live in `$XDG_CONFIG_HOME/hubspot` when `XDG_CONFIG_HOME` is an absolute path, and in `~/.config/hubspot` otherwise.

```text
hubspot/
  config.json            {"activeProfile": "work", "baseUrl": "https://...", "apiVersion": "2026-03"}
  profiles/NAME.json     {"accessToken": "...", "baseUrl": "https://...", "apiVersion": "2026-03"}
```

Keys are camelCase. Files use mode `0600`, directories use mode `0700`, and writes are atomic: the CLI creates a temporary file exclusively with mode `0600` in the same directory, then renames it. Reads reject unknown keys and non-object JSON with `CONFIGURATION_ERROR`. Profile names match `^[A-Za-z0-9._-]+$` and are not `.` or `..`. `config.json` keys: `activeProfile` (read-only through `config`; change it with `profiles use`), `baseUrl`, and `apiVersion`. Profile fields: `accessToken`, `baseUrl`, and `apiVersion`. Secrets are redacted in previews, diagnostics, `profiles get`, and `config list`.

An API version, from `--api-version`, `config set apiVersion`, `HUBSPOT_API_VERSION`, or a stored file, matches `YYYY-MM`.

A base URL, from `--base-url`, `config set baseUrl`, `HUBSPOT_BASE_URL`, or a stored file, must be an `https` URL (`http` only for `localhost`, `127.0.0.1`, or `::1`) with no credentials, query string, fragment, or path. Values are stored unchanged, and requests go to the URL's origin.

Completion scripts come from `hubspot completions bash|zsh|fish` and read only the command registry and local profile names. They complete commands, options, enum values (after `--OPT ` and `--OPT=`), `METHOD`, `SHELL`, and profile names (after `--profile` and for the `NAME` argument of `profiles get|update|delete|use`). They offer nothing after `--` or after an option that takes a free-form value.

## Exceptions

| Rule | Decision | Reason |
| --- | --- | --- |
| `CLI-GRAM-4` | `associations create-default` | HubSpot distinguishes the default association from labeled associations. |
| `CLI-GRAM-6` | `associations` commands take every ID as an option | An association joins two records and an object type pair, so no single primary target exists. |

## Development

```bash
bun run build
bun run check
bun link
```

`src/core/` is vendored from cli-core and is never edited here. Change cli-core and run its sync script instead. `docs/cli-conventions.md` restates the command-line contract this tool follows.

## API references

- [HubSpot API documentation](https://developers.hubspot.com/docs/api-reference/overview)
- [HubSpot authentication](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview)
