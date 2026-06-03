# ZaoWu Error Codes

The source of truth is `packages/core/src/error-codes.ts`. This document explains
the stable user-facing error codes by area.

## AI

| Code                           | Meaning                                         |
| ------------------------------ | ----------------------------------------------- |
| `AI_INPUT_FILE_READ_FAILED`    | The file passed to `zw ai ask --file` failed.   |
| `AI_PROMPT_REQUIRED`           | No prompt or readable file input was provided.  |
| `AI_PROVIDER_CONFIG_MISSING`   | Required provider environment config is absent. |
| `AI_PROVIDER_NOT_FOUND`        | The requested AI provider is not registered.    |
| `AI_PROVIDER_REQUEST_FAILED`   | A provider network request failed.              |
| `AI_PROVIDER_RESPONSE_INVALID` | A provider response could not be parsed.        |

## CLI

| Code                      | Meaning                                        |
| ------------------------- | ---------------------------------------------- |
| `COMMAND_HANDLER_MISSING` | A known command has no registered handler.     |
| `COMMAND_NOT_IMPLEMENTED` | A planned command is not runnable yet.         |
| `TARGET_REQUIRED`         | A command target or second argument is absent. |
| `UNKNOWN_COMMAND`         | The root command is unknown.                   |
| `UNKNOWN_DOMAIN_ACTION`   | The domain exists but the action is unknown.   |
| `INTERNAL_ERROR`          | An unexpected internal failure occurred.       |

## Config

| Code                            | Meaning                                      |
| ------------------------------- | -------------------------------------------- |
| `CONFIG_ALREADY_EXISTS`         | `zw init --yes` would overwrite config.      |
| `CONFIG_FORMAT_UNSUPPORTED`     | The config file extension is unsupported.    |
| `CONFIG_KEY_UNSUPPORTED`        | The requested config key is not supported.   |
| `CONFIG_NOT_FOUND`              | No `zw.yml`, `zw.yaml`, or `zw.json` exists. |
| `CONFIG_PARSE_FAILED`           | Config content could not be parsed.          |
| `CONFIG_SECRET_KEY_NOT_ALLOWED` | A secret-like key was rejected.              |
| `CONFIG_VALUE_INVALID`          | A config value failed validation.            |
| `CONFIG_VERSION_UNSUPPORTED`    | The config version is unsupported.           |
| `CONFIG_WRITE_FAILED`           | A config write failed.                       |

## Data

| Code                      | Meaning                                    |
| ------------------------- | ------------------------------------------ |
| `DATA_FORMAT_UNSUPPORTED` | The data file extension is unsupported.    |
| `DATA_READ_FAILED`        | The supported data file could not be read. |

## Documents

| Code                               | Meaning                                    |
| ---------------------------------- | ------------------------------------------ |
| `DOCUMENT_FORMAT_UNSUPPORTED`      | The document extension is unsupported.     |
| `DOCUMENT_READ_FAILED`             | The supported document could not be read.  |
| `DOCUMENT_SEARCH_KEYWORD_REQUIRED` | `zw doc search` received an empty keyword. |

## Developer Workflows

| Code                   | Meaning                                   |
| ---------------------- | ----------------------------------------- |
| `GIT_COMMAND_FAILED`   | A Git command failed.                     |
| `NO_CHANGES_TO_REVIEW` | No staged or worktree changes were found. |
| `NO_STAGED_CHANGES`    | `zw dev commit` found no staged changes.  |

## Plugins

| Code                        | Meaning                                  |
| --------------------------- | ---------------------------------------- |
| `PLUGIN_ID_INVALID`         | A plugin id failed validation.           |
| `PLUGIN_SOURCE_ID_MISMATCH` | Source manifest id differs from target.  |
| `PLUGIN_SOURCE_INVALID`     | A plugin source path or manifest failed. |

## Teaching, Web, And Automation

| Code                    | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `TEACH_INPUT_REQUIRED`  | A teaching topic or input is required.   |
| `WEB_FETCH_UNAVAILABLE` | The runtime cannot perform web requests. |
| `WEB_URL_INVALID`       | The target URL is invalid.               |
| `WORKFLOW_PARSE_FAILED` | A workflow file could not be parsed.     |
| `WORKFLOW_READ_FAILED`  | A workflow file could not be read.       |
