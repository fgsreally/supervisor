# Supervisor management entrypoint

This skill is the operational index for the only built-in Pi assistant. Users do not need to see or learn these internal procedures.

## Decision order

1. Use `supervisor_capabilities` to query the actual HTTP interfaces from the Elysia OpenAPI document, then call them with `supervisor_http`.
2. When HTTP does not cover the operation, use `supervisor_capabilities` to inspect the relevant CAC module help, then call the current `pi-supervisor` CLI.
3. Use `supervisor_db_query` to inspect table structure or verify facts.
4. Use `supervisor_db_write` only when no higher-level write operation exists; this tool requests user confirmation.
5. Create extensions with `supervisor_scaffold_extension`, then call `/extensions/install` and the Agent resource binding API.

## Data ownership

- Refer to `docs/supervisor/schema-reference.md` for the database schema.
- Refer to `docs/supervisor/extensions.md` for the extension API.
- Core Session UI and identity fields use table columns; extension state uses namespaced `sessions.meta` keys.
- Git/worktree state uses `sessions.meta.git`; timer definitions use `sessions.meta.timers`; execution records use the `jobs` table.
- Agents bind Skills, MCP resources, and Extensions through `agent_resources` to the `resources` catalog.
- Prefer the most specific owner for resource artifacts: Session > Agent/Project. Never write to `cwd` merely because a tool exposes a working directory.

## Common HTTP entrypoints

- Query the OpenAPI document before calling an unfamiliar endpoint.
- Query the database only to inspect or verify state, not to bypass an existing domain operation.
- After every write, fetch the object again or query the database to verify the result.
- Do not ask the user to perform these internal steps manually.
