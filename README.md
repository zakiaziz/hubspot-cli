# hubspot-cli

An agent-friendly command-line interface for the HubSpot API.

This project owns the `hubspot` binary. It is not the official HubSpot CLI. It focuses on common Customer Relationship Management (CRM) operations and provides `api request` for other bearer-authenticated JSON endpoints.

## Install

Install the versioned package from GitHub Releases:

```bash
bun add --global \
  '@zakiaziz/hubspot-cli@https://github.com/zakiaziz/hubspot-cli/releases/download/v0.2.0/hubspot-cli-0.2.0.tgz'
```

For local development:

```bash
bun install
bun run build
bun test
bun link
```

## Set up authentication

Setup is noninteractive. Supply `--access-token`, or use `--from-env` with `HUBSPOT_ACCESS_TOKEN`. Missing credentials produce a JSON error and exit status 1.

HubSpot accepts static auth access tokens, service keys, and OAuth access tokens as bearer tokens. For a single-account command-line workflow, create a static auth access token or service key with only the scopes you need.

```bash
hubspot setup work \
  --access-token "$HUBSPOT_ACCESS_TOKEN" \
  --api-version 2026-03
hubspot auth verify
```

To read configuration from the environment:

```bash
export HUBSPOT_ACCESS_TOKEN="pat-na1-..."
export HUBSPOT_API_VERSION="2026-03"
hubspot setup work --from-env
```

Profiles live in `~/.config/hubspot`, or under `$XDG_CONFIG_HOME/hubspot` when that variable is set. Credential files use mode `0600`; configuration directories use mode `0700`.

The CLI resolves credentials in this order:

1. `--access-token`
2. `HUBSPOT_ACCESS_TOKEN`
3. The profile selected by `--profile`
4. The active profile

The default API root is `https://api.hubapi.com`. First-class commands default to API version `2026-03`. Override these values with `--base-url`, `HUBSPOT_BASE_URL`, `--api-version`, or `HUBSPOT_API_VERSION`.

The CLI sends OAuth access tokens but does not refresh them. If you use OAuth, provide a current access token.

## Output contract

Operational commands write one valid JSON document to `stdout`. HubSpot JSON responses retain their original shape, while plain-text API responses become JSON strings. `hubspot --version` returns a JSON object.

Failures use a nonzero exit status and write structured JSON to `stderr`:

```json
{
  "error": {
    "code": "HUBSPOT_API_ERROR",
    "message": "Invalid property",
    "status": 400,
    "statusText": "Bad Request",
    "category": "VALIDATION_ERROR",
    "correlationId": "abc-123"
  }
}
```

Client-side validation and configuration failures use `CLI_ERROR`. HubSpot API failures use `HUBSPOT_API_ERROR` and include available response metadata.

`hubspot --help` and shell completion commands intentionally print text. There is no `--json` flag because JSON is the default for every operational command.

## Command conventions

Commands that change HubSpot state require `--yes`. Use `--dry-run` to inspect a redacted request without sending it.

```bash
hubspot objects create contacts \
  --property email=zaki@example.com \
  --property firstname=Zaki \
  --dry-run

hubspot objects create contacts \
  --property email=zaki@example.com \
  --property firstname=Zaki \
  --yes
```

First-class POST commands that only read data, such as `objects search`, `objects batch-read`, and `associations batch-read`, do not require mutation confirmation. Raw `api request` calls conservatively treat every non-GET method as a mutation.

Use `--all` with paginated list and search commands. The CLI follows `paging.next.after` and combines each page's `results` array.

### Request values

Use repeatable `--property name=value` options with `objects create` and `objects update`. CRM property values remain strings, matching HubSpot's object API contract.

```bash
hubspot objects update deals 123 \
  --property amount=1000000 \
  --property dealstage=contractsent \
  --dry-run
```

Use `--body <json|@file>` for an exact JSON request. Use repeatable `--set path=value` options for typed body fields. Values that look like booleans, numbers, null, arrays, or objects are parsed as JSON-compatible values.

```bash
hubspot objects search deals \
  --set query=Atlas \
  --set limit=200 \
  --set 'sorts=[{"propertyName":"createdate","direction":"DESCENDING"}]' \
  --all
```

Use repeatable `--query name=value` options for query parameters. Use `--set` for generated JSON body fields. The CLI rejects unknown options so a typo cannot silently change a request.

```bash
hubspot objects list contacts \
  --query properties=email,firstname,lastname \
  --query limit=100 \
  --all

hubspot objects get contacts zaki@example.com \
  --query idProperty=email
```

## Configuration commands

| Command | Description |
| --- | --- |
| `hubspot setup [profile] [options]` | Create and activate a profile. |
| `hubspot profiles list` | List profiles and the active profile. |
| `hubspot profiles show <name>` | Show a profile with its token redacted. |
| `hubspot profiles create <name> [options]` | Create a profile. |
| `hubspot profiles update <name> [options]` | Update a profile. |
| `hubspot profiles delete <name>` | Delete a profile. |
| `hubspot profiles use <name>` | Activate a profile. |
| `hubspot config path` | Show configuration paths. |
| `hubspot config show` | Show global configuration. |
| `hubspot config get <key>` | Read a configuration key. |
| `hubspot config set <key> <value>` | Set `baseUrl` or `apiVersion`. |
| `hubspot config unset <key>` | Remove `baseUrl` or `apiVersion`. |
| `hubspot auth verify` | Verify the token and return HubSpot account details. |
| `hubspot completions bash` | Print Bash completions. |
| `hubspot completions zsh` | Print Z shell completions. |
| `hubspot completions fish` | Print fish completions. |

Profile create and update accept `--access-token`, `--base-url`, and `--api-version`.

## Object commands

Object commands accept standard object names such as `contacts`, `companies`, `deals`, and `tickets`. They also accept custom object type IDs such as `2-12345`.

| Command | Access | Description |
| --- | --- | --- |
| `hubspot objects list <objectType>` | Read | List records. Supports `--all`. |
| `hubspot objects get <objectType> <recordId>` | Read | Get one record. |
| `hubspot objects search <objectType>` | Read | Search records. Supports `--all`. |
| `hubspot objects create <objectType>` | Mutation | Create one record. |
| `hubspot objects update <objectType> <recordId>` | Mutation | Update one record. |
| `hubspot objects archive <objectType> <recordId>` | Mutation | Move one record to the recycling bin. |
| `hubspot objects batch-read <objectType>` | Read | Read a batch of records. |
| `hubspot objects batch-create <objectType>` | Mutation | Create records in a batch. |
| `hubspot objects batch-update <objectType>` | Mutation | Update records in a batch. |
| `hubspot objects batch-upsert <objectType>` | Mutation | Create or update records in a batch. |
| `hubspot objects batch-archive <objectType>` | Mutation | Move records to the recycling bin in a batch. |

Batch commands accept HubSpot's exact request body:

```bash
hubspot objects batch-read contacts \
  --body @contacts-to-read.json

hubspot objects batch-upsert contacts \
  --body @contacts-to-upsert.json \
  --dry-run
```

## Property commands

| Command | Access | Description |
| --- | --- | --- |
| `hubspot properties list <objectType>` | Read | List property definitions. |
| `hubspot properties get <objectType> <propertyName>` | Read | Get one property definition. |
| `hubspot properties create <objectType>` | Mutation | Create a property definition. |
| `hubspot properties update <objectType> <propertyName>` | Mutation | Update a property definition. |
| `hubspot properties archive <objectType> <propertyName>` | Mutation | Archive a property definition. |

## Owner commands

| Command | Access | Description |
| --- | --- | --- |
| `hubspot owners list` | Read | List owners. Supports `--all`. |
| `hubspot owners get <ownerId>` | Read | Get one owner. |

## Pipeline and stage commands

| Command | Access | Description |
| --- | --- | --- |
| `hubspot pipelines list <objectType>` | Read | List pipelines. |
| `hubspot pipelines get <objectType> <pipelineId>` | Read | Get one pipeline. |
| `hubspot pipelines create <objectType>` | Mutation | Create a pipeline. |
| `hubspot pipelines replace <objectType> <pipelineId>` | Mutation | Replace a pipeline. |
| `hubspot pipelines update <objectType> <pipelineId>` | Mutation | Update a pipeline. |
| `hubspot pipelines delete <objectType> <pipelineId>` | Mutation | Delete a pipeline. |
| `hubspot stages list <objectType> <pipelineId>` | Read | List stages. |
| `hubspot stages get <objectType> <pipelineId> <stageId>` | Read | Get one stage. |
| `hubspot stages create <objectType> <pipelineId>` | Mutation | Create a stage. |
| `hubspot stages replace <objectType> <pipelineId> <stageId>` | Mutation | Replace a stage. |
| `hubspot stages update <objectType> <pipelineId> <stageId>` | Mutation | Update a stage. |
| `hubspot stages delete <objectType> <pipelineId> <stageId>` | Mutation | Delete a stage. |

## Association commands

| Command | Access | Description |
| --- | --- | --- |
| `hubspot associations list <fromObjectType> <fromObjectId> <toObjectType>` | Read | List a record's associations. Supports `--all`. |
| `hubspot associations create-default <fromObjectType> <fromObjectId> <toObjectType> <toObjectId>` | Mutation | Create a default association. |
| `hubspot associations create <fromObjectType> <fromObjectId> <toObjectType> <toObjectId>` | Mutation | Create labeled associations from a JSON body. |
| `hubspot associations delete <fromObjectType> <fromObjectId> <toObjectType> <toObjectId>` | Mutation | Remove every association between two records. |
| `hubspot associations batch-read <fromObjectType> <toObjectType>` | Read | Read associations for a batch of records. |
| `hubspot associations batch-create <fromObjectType> <toObjectType>` | Mutation | Create labeled associations for record pairs. |
| `hubspot associations batch-create-default <fromObjectType> <toObjectType>` | Mutation | Create default associations for record pairs. |
| `hubspot associations batch-delete <fromObjectType> <toObjectType>` | Mutation | Remove associations for record pairs. |
| `hubspot associations labels <fromObjectType> <toObjectType>` | Read | List association labels and type IDs. |

## Custom schema commands

| Command | Access | Description |
| --- | --- | --- |
| `hubspot schemas list` | Read | List custom object schemas. |
| `hubspot schemas get <objectType>` | Read | Get one custom object schema. |
| `hubspot schemas create` | Mutation | Create a custom object schema. |
| `hubspot schemas update <objectType>` | Mutation | Update a custom object schema. |
| `hubspot schemas delete <objectType>` | Mutation | Delete a custom object schema. |

## Account commands

| Command | Description |
| --- | --- |
| `hubspot account details` | Get account details. |
| `hubspot account api-usage` | Get legacy private-app daily API usage. |

## Raw API access

Use raw access for bearer-authenticated JSON endpoints that do not have a first-class command. OAuth token exchange, multipart uploads, and other content types are outside this command's contract:

```bash
hubspot api request GET /crm/limits/2026-03/records
hubspot api request GET /crm/properties/2026-03/contacts \
  --query archived=false
hubspot api request PATCH /crm/objects/2026-03/contacts/123 \
  --set properties.firstname=Zaki \
  --dry-run
hubspot api request POST /crm/exports/2026-03/exports/async \
  --body @export.json \
  --yes
```

The complete form is `hubspot api request <GET|POST|PUT|PATCH|DELETE> <path>`.

## Global options

| Option | Purpose |
| --- | --- |
| `--profile <name>` | Select a profile. |
| `--access-token <token>` | Override the bearer access token. |
| `--base-url <url>` | Override the API root. |
| `--api-version <YYYY-MM>` | Override the date version in first-class paths. |
| `--body <json|@file>` | Supply an exact JSON body. |
| `--set <path=value>` | Set a typed body field. Repeatable. |
| `--property <name=value>` | Set a CRM property string. Repeatable. |
| `--query <name=value>` | Add an exact query parameter. Repeatable and duplicate-preserving. |
| `--all` | Follow every page for supported list and search commands. |
| `--dry-run` | Print a redacted request without sending it. |
| `--yes`, `-y` | Confirm a mutation. |
| `--help`, `-h` | Show help. |
| `--version`, `-v` | Show the version. |

## Development

```bash
bun install
bun run check
bun test
bun run build
```

The published CLI requires Bun 1.3 or newer and has no runtime dependencies.

## API references

- [HubSpot 2026-03 API overview](https://developers.hubspot.com/docs/api-reference/latest/overview)
- [Authentication overview](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview)
- [Using object APIs](https://developers.hubspot.com/docs/api-reference/latest/crm/using-object-apis)
- [CRM search API](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
- [Associations overview](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/overview)
- [API usage guidelines and limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)
