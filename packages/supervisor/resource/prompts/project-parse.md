Complete project analysis and initialization quickly and in as few rounds as possible. Batch independent reads into one round. Never re-read a file you have already read. Do not start servers, run installs, or invoke `--help`. Ignore the `.supervisor` directory (Supervisor platform data), `node_modules`, and other dependency/build output. Do not inspect CI configuration.

1. Check whether the project root is already a Git repository (one `git status`); run `git init` only when it is not, without changing remotes.
2. Read the project-root `.gitignore`. If absent, create it; otherwise preserve valid rules and improve them in place. Derive ignore rules from this project's actual dependency directories, build/cache output, local runtime data, generated artifacts, and platform-specific files. Do not use a generic fixed template.
3. Read the manifest(s), entry files, and AGENTS.md (if present) to understand the project.
4. If AGENTS.md exists, preserve valid rules and improve it in place; do not discard useful content. If it does not exist, create it with project purpose, directories, commands, conventions, and boundaries.
5. Keep exactly one {{localServicesHeading}} section in AGENTS.md documenting only the Start command(s) for local development services. Install, stop, and destroy are managed by Supervisor; do not write them. Do not write ports or paths there.
6. Do not commit or push. Only after all filesystem tasks are complete, call submit_result exactly once.

Return:
{
"description": "A Chinese project description of 80-300 characters",
"services": {
"definitions": [{"name": "web", "startCommand": "long-running command using ${PORT1}"}],
"views": [{"name": "Home", "service": "web", "port": "PORT1", "path": "/"}]
}
}

Constraints:

- Do not invent commands or write secrets.
- A service is a long-running process started by a command. A view is a browser-accessible entry point; one service may expose multiple views.
- Views are mandatory whenever anything is browser-accessible: unless the project has no browser-accessible entry at all, return at least one view. Every directly accessible HTML page must be its own view — for example, multiple root-level `.html` files served by a dev server become one view each (`/`, `/foo.html`, `/bar.html`).
- The returned startCommand is the actual command Supervisor will execute. Do not copy the ordinary README or AGENTS.md Start command unchanged when it lacks a dynamic port.
- For every long-running HTTP service, inspect the manifest scripts and the tool's command-line options/configuration to find how its port is injected. Return a startCommand that passes the consecutive ${PORT1}, ${PORT2}, ... placeholders to that real start script or executable.
- Do not assume a framework, language, package manager, or command syntax. Inspect the project's own manifests, scripts, and configuration to determine how its process accepts a port.
- Never use a fixed port, an implicit default port, or an environment variable that Supervisor cannot substitute. If a service cannot accept an injected port after inspecting its files, do not register it as a browser-accessible service.
- Every view.service must reference a definition, view.port must reference a placeholder used by that service, and paths begin with /.
- Return empty definitions and views only when no local development service exists.

Project name: {{projectName}}
Path: {{projectPath}}
