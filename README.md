# @lucasschirm/aify

A tiny CLI to sync ServiceNow application metadata to local files, with a merge/conflict structure so you can edit records on disk and push changes back to your instance.

`aify` connects to a ServiceNow instance using basic authentication and the [Table API](https://docs.servicenow.com/), tracks scoped applications locally, and keeps your files and the instance in sync.

## Install

Install globally from npm:

```bash
npm install @lucasschirm/aify -g
```

This exposes the `aify` command on your `PATH`. Node.js `>=22` is required.

## Docs

### Getting started

```bash
# 1. Add a ServiceNow connection (prompts for anything you omit)
aify auth add --alias dev --instance https://dev12345.service-now.com --username admin

# 2. Track a scoped application by its scope name (or sys_id)
aify app init x_2095413_test

# 3. Pull metadata for all tracked scopes
aify sync
```

### Managing connections

Credentials are stored securely in your OS keychain; the active connection is used by all other commands.

```bash
aify auth add        # Add a connection and set it as current
aify auth list       # List saved connections
aify auth use <alias>    # Switch the current connection
aify auth verify     # Test the current connection (or --alias <alias>)
aify auth update <alias> # Update a connection's username and/or password
aify auth remove <alias> # Remove a connection and its stored password
```

`aify auth add` accepts `--alias`, `--instance`, and `--username` flags; the password is always prompted (never passed as a flag). A ServiceNow share URL containing `user_name`/`user_password` query params is also accepted as `--instance` — those values prefill the prompts. Use `--force` to overwrite an existing alias.

### Tracking applications

```bash
aify app init <scope|sys_id>   # Track an existing scoped application locally
aify app init x_2095413_test --yes   # Non-interactive (skip the sync prompt)
```

Tracked scopes are recorded in `.aify.config.json` at your project root:

```json
{
  "project": {
    "scopes": [
      { "sysId": "dac34cdb970a0b101de8f84de053aff5", "scope": "x_2095413_test" }
    ]
  }
}
```

### Syncing

```bash
aify sync                    # Sync all tracked scopes with the current instance
aify sync --scope <scope>    # Sync only one scope
aify sync --hot              # Watch local files and the instance, syncing continuously
aify sync --force-pull       # Download everything; skip comparison
aify sync --force-push       # Upload everything; skip comparison
aify sync --yes              # Skip the instance confirmation prompt
```

### Help

```bash
aify --help          # Top-level command list
aify <command> --help    # Help for a specific command
aify --version       # Print the installed version
```
