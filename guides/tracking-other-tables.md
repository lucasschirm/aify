# Tracking other tables and columns

This guide explains how `aify` decides *which* ServiceNow tables and columns it
pulls to your machine, and how to change that with the `aify tracker` commands.

## What "tracking" is

`aify sync` downloads records from your ServiceNow instance into local files.
It does not download every column of every table — that would be enormous and
mostly noise. Instead, `aify` keeps a **tracked-tables configuration**: a list of
tables, and for each table the specific **columns** worth pulling (usually the
script/HTML/CSS/JSON fields you actually edit).

Every tracked column has a **column type** (the field's ServiceNow
`internal_type`, e.g. `server_script`, `html`, `css`). A column type maps to how
the value is written locally:

| Field | Meaning |
|-------|---------|
| `file_name` | The local file name. Supports the `${column_name}` placeholder, which expands to the column's name. |
| `extension` | The file extension (e.g. `server.js`, `html`, `css`). This is what gives you syntax highlighting and the right editor behavior. |
| `behavior` | How `aify` treats the content (e.g. `javascript`, `text`). |

So tracking is two connected ideas: **which columns** to pull, and **what type**
each column is so `aify` knows how to store it.

## The three configuration layers

The tracked-tables configuration is resolved by merging three layers. Later
layers win on a per-column and per-type basis:

1. **package** — the defaults shipped inside `aify`. These are the built-in
   tables/columns every install starts with. They are **read-only**: you cannot
   currently edit or remove them.
2. **global** — your machine-wide overrides in `~/.aify/track_tables.json`.
   Applies to every project on your machine.
3. **project** — the current project's `.aify.config.json`. Applies only to that
   project and wins over global and package.

Precedence is **project > global > package**. When a column is defined in more
than one layer, the highest layer "wins" and is the column's **source**. A column
that comes only from the package layer is considered **already tracked** and
**locked** — it shows up as read-only in the interactive prompts.

## `aify tracker tables add`

Interactively track a table's columns.

```
aify tracker tables add            # writes to the project (or prompts, see below)
aify tracker tables add --global   # writes to the global config
```

The flow:

1. **Table name** — you are prompted for the table (e.g. `sys_script_include`).
2. **Column checkbox** — `aify` fetches the live schema for that table and shows
   every column as a checkbox. Each column reflects its current tracking state:
   - Columns **already tracked** (in any layer) are **pre-checked**, and the label
     shows the source, e.g. `script — server_script (tracked — package)`.
   - Columns tracked at the **package** layer are **disabled** (greyed out and
     read-only). You cannot uncheck them — package defaults can't be removed yet.
   - Untracked columns are unchecked and free to select.
3. **Selecting new columns** — check any additional columns you want tracked.
   Only columns that are *genuinely new* (not already tracked in any layer) are
   written; already-tracked columns are never re-saved, so your config stays clean
   with no duplicate entries.
4. **Missing column types** — if a newly selected column's type isn't configured
   yet, `aify` prompts you to configure it inline (file name, extension, behavior)
   before saving — the same prompts as `aify tracker types add` (below).
5. **Stopping tracking (unchecking)** — if you *uncheck* a column that was tracked
   at the **global** or **project** layer, `aify` asks:
   `Are you sure you want to stop tracking the column <col> from the table <table>?`
   If you confirm, the column is removed from wherever it currently lives — a
   project-tracked column is removed from `.aify.config.json`, a global-tracked one
   from `~/.aify/track_tables.json` — regardless of which target you ran the command
   with. If removing it leaves the table with no tracked columns, the whole table
   entry is dropped. If you decline, nothing changes. **Package** columns are never
   offered for removal.

If you select no new columns, `aify` prints
`No new columns selected; nothing to track.` (any confirmed removals still apply).

## `aify tracker types add`

Configure a **column type** directly, without going through a table's checkbox.
Useful when you want to define how a type is stored ahead of time.

```
aify tracker types add
aify tracker types add --global
aify tracker types add --table sys_script_include
```

- With **no `--table`**, you are prompted for the type name (its ServiceNow
  `internal_type`) to configure.
- With **`--table <table>`**, `aify` reads that table's live schema and lets you
  **pick an `internal_type` from a list** instead of typing it (types already
  configured are marked `(tracked)`), which avoids typos.

Then you are prompted for the three fields:

- **`file_name`** — defaults to the placeholder `${column_name}`, which expands to
  the column's name at sync time. Keep the placeholder unless you want a fixed name.
- **`extension`** — e.g. `server.js`, `html`, `css`.
- **`behavior`** — e.g. `javascript`, `text`.

## Target resolution (shared by both commands)

Both commands decide *where* to write using the same rule:

- **Default (no `--global`)** — if you run the command **inside an aify project**
  (a directory with `.aify.config.json` in it or a parent), it writes to that
  project's config.
- **`--global`** — forces writing to `~/.aify/track_tables.json`.
- **Outside a project, without `--global`** — `aify` can't tell where you meant, so
  it **confirms** before writing globally
  (`Are you sure you want to add a new table/type to the global configuration?`).
  Decline to abort; run from inside your project to target the project instead.

Note that **removals** always follow the column's actual source layer, not the
target flag: unchecking a global-tracked column removes it from the global config
even if you invoked the command without `--global`.

## Worked example

Suppose you want to track more of `sys_script_include` in your project.

`sys_script_include` ships in the **package** defaults with one column already
tracked:

```json
{
  "name": "sys_script_include",
  "columns": [{ "name": "script", "type": "server_script" }]
}
```

and the `server_script` type maps to:

```json
{ "file_name": "${column_name}", "extension": "server.js", "behavior": "javascript" }
```

Run:

```
aify tracker tables add
```

1. Enter the table name: `sys_script_include`.
2. The checkbox appears. `script` shows as
   `script — server_script (tracked — package)` — **checked and disabled**; you
   can't touch it because it's a package default. Other columns (e.g. `access`,
   `description`, `active`) are unchecked.
3. Check `description`. If its type (say `string`) isn't configured yet, `aify`
   prompts for `file_name` (accept the `${column_name}` default), `extension`
   (e.g. `txt`), and `behavior` (e.g. `text`).
4. `aify` writes only the new column to your project `.aify.config.json`:

   ```json
   {
     "tables": [
       { "name": "sys_script_include", "columns": [{ "name": "description", "type": "string" }] }
     ],
     "column_types": {
       "string": { "file_name": "${column_name}", "extension": "txt", "behavior": "text" }
     }
   }
   ```

   The package `script` column is **not** copied in — it's still tracked via the
   package layer, and at sync time the merged view is `script` (package) +
   `description` (project).

Later, if you re-run `aify tracker tables add` for `sys_script_include` and
uncheck `description`, `aify` confirms and removes it from the project config —
dropping the `sys_script_include` entry entirely since it has no other
project-tracked columns. The package `script` column remains untouched.
