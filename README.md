# HubSpot CLI

A command-line client for HubSpot CRM. This unofficial package owns the `hubspot` executable.

## Install

Install from npm with Node 22 or newer, or with Bun:

```bash
npm install -g @zakiaziz/hubspot-cli
bun add -g @zakiaziz/hubspot-cli
```

To work on the CLI, build and link a checkout with `bun install`, `bun run build`, and `bun link`.

## Output

Operational commands write one compact JSON document to stdout by default, even
in a terminal. First-class commands return `{"data":...,"meta":...}`; collections
use an array in `data`. Provider fields inside results are preserved. Raw
`api request` returns the provider response without the envelope.

```bash
hubspot objects list --type contacts
hubspot objects list --type contacts --format pretty
hubspot objects list --type contacts --format human
hubspot objects list --type contacts --format pretty --color never
```

`--format pretty` uses two-space indentation and GitHub Dark syntax colors.
Automatic color applies only to terminal streams without a nonempty `NO_COLOR`.
`--color always` explicitly overrides that policy for pretty/human presentation;
`--format json` is always uncolored. Human output uses tables and labeled fields.
Errors follow the selected format on stderr. Progress and diagnostics never
appear in result stdout. Help, version, and completion output are text.

## Configuration

```bash
export HUBSPOT_ACCESS_TOKEN="your-token"
hubspot setup work --from-env
hubspot auth verify
```

Setup is noninteractive and uses the same profile storage as `profiles create`
and `profiles use`. Existing profile names require `profiles update`.
Credentials resolve from explicit options, `HUBSPOT_ACCESS_TOKEN`, then the
selected profile. Profile selection uses `--profile`, `HUBSPOT_PROFILE`, then
the active profile. An explicitly missing profile fails even when an environment
token is present.

Configuration lives in `$XDG_CONFIG_HOME/hubspot` when that variable is absolute,
otherwise `~/.config/hubspot`. Credential files use mode `0600`; tool directories
use `0700`. Inspection redacts credentials. Prefer environment credentials over
token options that can appear in shell history.

Non-secret settings resolve from explicit options, `HUBSPOT_BASE_URL` and
`HUBSPOT_API_VERSION`, profile values, then configuration/defaults. Defaults are
`https://api.hubapi.com` and API version `2026-03`. OAuth tokens are not refreshed.
`auth verify` checks account-detail access, not every endpoint permission.

## Input and confirmation

Commands use plural resources and explicit actions. The primary ID is positional;
scope uses `--type`, `--pipeline-id`, or association scope options. Unknown,
duplicate scalar, irrelevant, and conflicting flags fail before requests.
Options accept both `--name value` and `--name=value`; `--` ends option parsing.

```bash
hubspot objects update 123 --type deals --property amount=1000000 --dry-run
hubspot objects update 123 --type deals --property amount=1000000 --yes
hubspot objects batch-get --type contacts --file ids.json
hubspot api request PATCH /crm/objects/2026-03/contacts/123 --file request.json --yes
```

`--file PATH` reads a complete JSON body; `--file -` reads stdin. It conflicts
with `--set` and `--property`. `--property NAME=VALUE` preserves strings,
including empty strings. `--set PATH=VALUE` parses booleans, numbers, null, arrays,
and objects. Omitted fields remain unchanged; null and empty strings remain
distinct and must be supported by the provider field. Do not assume empty means
clear for every provider property. `--query NAME=VALUE` sends exact provider
query names and preserves repeated parameters. No implicit @file expansion occurs.

Search pagination flags can augment an input body only when it lacks the same
`after` or `limit` field; conflicts fail. Batch input requires an explicit,
nonempty `inputs` array. Destructive batches never infer targets from `--all`.

Remote mutations prompt with profile, target, and effects in a terminal unless
`--yes` is supplied. `--no-input`, nonterminal stdin, stdin request content, and
CI mode prohibit prompts; missing confirmation exits `9`. CI mode means a
nonempty `CI` other than `0` or `false`, ignoring case. `--dry-run` validates
locally and prints a redacted plan without requests or writes. It is not a
guarantee that a later mutation succeeds. `--force` is not supported.

First-class POST searches and batch reads need no confirmation. Raw non-GET
requests require confirmation. Raw requests accept JSON bodies and JSON/text
responses; multipart and binary content are unsupported. Paths cannot change
origin, and redirects are not followed.

## Pagination and failures

Paginated commands fetch one page by default. `--all` traverses continuation;
`--max-items N` requires `--all` and bounds total output. Without `--page-size`,
each request is capped at 100 items. Page sizes shrink to the remaining capacity, preserving `meta.next_cursor` without discarding unread
items. Resume with `--cursor`. `meta.has_more` describes provider continuation,
not an assurance that the service exposes every historical record.

```bash
hubspot objects list --type contacts --all --page-size 50 --max-items 100
hubspot objects list --type contacts --cursor CURSOR
```

Unsupported pagination flags fail. Provider-specific limits and search caps
still apply. Repeated cursors and invalid page shapes fail rather than looping.
Automatic retries are deliberately disabled; see the documented `CLI-RETRY-1`
exception in `docs/commands.json`. A failed mutation can have an unknown outcome.
Batch partial failures exit `8` and include provider results/errors under
`error.partial`; they do not imply rollback. An asynchronous provider response
retains its operation ID/status without polling.

| Exit | Meaning |
| --- | --- |
| 0 | Success, including empty collections |
| 1 | Unexpected or provider failure not otherwise classified |
| 2 | Invalid command or input |
| 3 | Configuration or authentication failure |
| 4 | Permission denied |
| 5 | Missing resource |
| 6 | Conflict or unmet precondition |
| 7 | Transient service/network failure |
| 8 | Partial completion |
| 9 | Confirmation required or declined |
| 130 | Interrupted |

Errors include a stable code, actionable message, and available provider status,
code, and request ID. JSON mode emits one structured error document on stderr.

## Command reference

Command help and completions use the same registry as this reference. Run a
command with `--help` for its scoped options and examples.

| Command | Description |
| --- | --- |
| `hubspot setup [profile] [--from-env]` | Create and activate a profile; existing profiles require profiles update. |
| `hubspot profiles list` | List saved profile names and the active profile. |
| `hubspot profiles get <name>` | Read a profile with secrets redacted. |
| `hubspot profiles create <name>` | Create a saved profile. |
| `hubspot profiles update <name>` | Update supplied profile fields. |
| `hubspot profiles delete <name>` | Delete a local profile and clear its active selection. |
| `hubspot profiles use <name>` | Select a saved profile. |
| `hubspot config list` | Read global configuration. |
| `hubspot config path` | Print configuration paths. |
| `hubspot config get <key>` | Read a configuration value. |
| `hubspot config set <key> <value>` | Set baseUrl or apiVersion. |
| `hubspot config unset <key>` | Remove baseUrl or apiVersion. |
| `hubspot auth verify` | Verify access to account details; this does not prove all endpoint permissions. |
| `hubspot api request <GET\|POST\|PUT\|PATCH\|DELETE> <path>` | Send a raw same-origin JSON API request. |
| `hubspot completions bash` | Print Bash completion code. |
| `hubspot completions zsh` | Print Zsh completion code. |
| `hubspot completions fish` | Print Fish completion code. |
| `hubspot objects list --type <type>` | List records for any standard or custom object type. |
| `hubspot objects get <recordId> --type <type>` | Get one record. |
| `hubspot objects search --type <type>` | Search records. |
| `hubspot objects create --type <type>` | Create one record. |
| `hubspot objects update <recordId> --type <type>` | Update one record. |
| `hubspot objects archive <recordId> --type <type>` | Move one record to HubSpot's recycling bin. |
| `hubspot objects batch-get --type <type>` | Read a batch of records. |
| `hubspot objects batch-create --type <type>` | Create a batch of records. |
| `hubspot objects batch-update --type <type>` | Update a batch of records. |
| `hubspot objects batch-upsert --type <type>` | Create or update a batch of records. |
| `hubspot objects batch-archive --type <type>` | Archive a batch of records. |
| `hubspot properties list --type <type>` | List property definitions for an object type. |
| `hubspot properties get <propertyName> --type <type>` | Get one property definition. |
| `hubspot properties create --type <type>` | Create a property definition. |
| `hubspot properties update <propertyName> --type <type>` | Update a property definition. |
| `hubspot properties archive <propertyName> --type <type>` | Archive a property definition. |
| `hubspot owners list` | List owners. |
| `hubspot owners get <ownerId>` | Get one owner. |
| `hubspot pipelines list --type <type>` | List pipelines for an object type. |
| `hubspot pipelines get <pipelineId> --type <type>` | Get one pipeline. |
| `hubspot pipelines create --type <type>` | Create a pipeline. |
| `hubspot pipelines replace <pipelineId> --type <type>` | Replace a pipeline. |
| `hubspot pipelines update <pipelineId> --type <type>` | Update a pipeline. |
| `hubspot pipelines delete <pipelineId> --type <type>` | Delete a pipeline. |
| `hubspot stages list --type <type> --pipeline-id <pipeline-id>` | List pipeline stages. |
| `hubspot stages get <stageId> --type <type> --pipeline-id <pipeline-id>` | Get one pipeline stage. |
| `hubspot stages create --type <type> --pipeline-id <pipeline-id>` | Create a pipeline stage. |
| `hubspot stages replace <stageId> --type <type> --pipeline-id <pipeline-id>` | Replace a pipeline stage. |
| `hubspot stages update <stageId> --type <type> --pipeline-id <pipeline-id>` | Update a pipeline stage. |
| `hubspot stages delete <stageId> --type <type> --pipeline-id <pipeline-id>` | Delete a pipeline stage. |
| `hubspot associations list --from-type <from-type> --from-id <from-id> --to-type <to-type>` | List a record's associations to one object type. |
| `hubspot associations create-default --from-type <from-type> --from-id <from-id> --to-type <to-type> --to-id <to-id>` | Create a default association. |
| `hubspot associations create --from-type <from-type> --from-id <from-id> --to-type <to-type> --to-id <to-id>` | Create labeled associations. |
| `hubspot associations delete --from-type <from-type> --from-id <from-id> --to-type <to-type> --to-id <to-id>` | Remove every association between two records. |
| `hubspot associations batch-get --from-type <from-type> --to-type <to-type>` | Read associations for a batch of records. |
| `hubspot associations batch-create --from-type <from-type> --to-type <to-type>` | Create labeled associations for record pairs. |
| `hubspot associations batch-create-default --from-type <from-type> --to-type <to-type>` | Create default associations for record pairs. |
| `hubspot associations batch-delete --from-type <from-type> --to-type <to-type>` | Remove associations for record pairs. |
| `hubspot association-labels list --from-type <from-type> --to-type <to-type>` | List association labels. |
| `hubspot schemas list` | List custom object schemas. |
| `hubspot schemas get <objectType>` | Get one custom object schema. |
| `hubspot schemas create` | Create a custom object schema. |
| `hubspot schemas update <objectType>` | Update a custom object schema. |
| `hubspot schemas delete <objectType>` | Delete a custom object schema. |
| `hubspot account get` | Get account details. |
| `hubspot account usage get` | Get private-app daily API usage. |

## Options

Only options shown by the selected command are accepted.

| Option | Contract |
| --- | --- |
| `--profile` | NAME; saved profile, otherwise HUBSPOT_PROFILE or active profile |
| `--format` | json\|pretty\|human; default json, compact and uncolored |
| `--color` | auto\|always\|never; default auto, presentation formats only |
| `--quiet` | Alias -q. Suppress notices; preserve results and errors |
| `--verbose` | Alias -v. Redacted request diagnostics on stderr |
| `--no-input` | Never prompt; automatically enforced in CI or nonterminal input |
| `--timeout` | DURATION; default 30s, positive ms/s/m, maximum 2147483647ms |
| `--access-token` | TOKEN; prefer HUBSPOT_ACCESS_TOKEN to avoid shell history |
| `--base-url` | URL; default https://api.hubapi.com, no cross-origin paths or redirects |
| `--api-version` | YYYY-MM; default 2026-03 |
| `--type` | OBJECT_TYPE; required, standard name or custom type ID |
| `--pipeline-id` | PIPELINE_ID; required pipeline scope |
| `--from-type` | OBJECT_TYPE; required source type |
| `--from-id` | ID; required source record |
| `--to-type` | OBJECT_TYPE; required destination type |
| `--to-id` | ID; required destination record |
| `--file` | PATH; complete provider JSON body; - reads stdin; conflicts with --set/--property |
| `--set` | PATH=VALUE; repeatable typed JSON fields; null and empty strings remain distinct |
| `--property` | NAME=VALUE; repeatable CRM strings, including an explicit empty string |
| `--query` | NAME=VALUE; repeatable exact provider query parameters |
| `--all` | Follow all pages; default one page |
| `--cursor` | TOKEN; opaque continuation from meta.next_cursor |
| `--page-size` | N; positive provider page size; defaults to an implicit bounded size of 100 |
| `--max-items` | N; total bound; requires --all; continuation remains resumable |
| `--yes` | Supply remote mutation confirmation |
| `--dry-run` | Local validation and redacted preview; no requests or writes |
| `--from-env` | Read setup values from HUBSPOT_* environment variables |

## Development

Use the existing Bun toolchain:

```bash
bun --bun run check
bun test
bun --bun run build
```

Requires Node 22 or newer, or Bun. No runtime dependencies. Package releases are separate
from source changes. The command specifications and output schemas live in
`docs/commands.json`. Rule IDs such as `CLI-RETRY-1` refer to
`docs/cli-conventions.md`.

## API references

- [HubSpot API documentation](https://developers.hubspot.com/docs/api-reference/overview)
- [HubSpot authentication](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview)

### Date filters

This CLI has no normalized date-filter options. Raw query parameters and search-body filters retain HubSpot's provider contract. CRM date/datetime property filters use the provider's documented representations, commonly Unix epoch milliseconds supplied as strings. The CLI does not interpret date-only strings or assign them a timezone. Search comparison operators such as GT/GTE and LT/LTE explicitly select exclusive/inclusive bounds. Consult the endpoint and property schema before supplying another representation.
