# Supervisor source layout

The runtime is organized into four top-level layers:

- `src/db`: database connection, schema, migrations, and persistence adapters.
- `src/http`: HTTP and WebSocket transport, route registration, and protocol adapters.
- `src/core`: runtime concepts such as Session, Agent, Project, Jobs, Watson, and resource loading logic.
- `resource`: packaged resources themselves, including prompts, built-in Agent definitions, Skills, Extensions, policies, tools, and MCP definitions.

`src/core/resource` contains loaders and resolution/binding logic only. A prompt, Skill,
Extension, or built-in Agent definition must not be placed there; the actual resource belongs
under `resource/`.

Prompts are English resources. Runtime logs are translated through the existing log i18n
catalog, and the web UI uses the locale service for user-facing text.
