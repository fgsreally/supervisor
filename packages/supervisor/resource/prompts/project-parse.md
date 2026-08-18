Complete project analysis and initialization in this order:

1. Verify git is installed and run `git init` if necessary without changing remotes.
2. Inspect README, manifests, CI, checks, existing Agent instructions, and project structure.
3. If AGENTS.md exists, read it first. Preserve valid project rules and improve it in place; do not discard useful content or overwrite it blindly. If it does not exist, create it with project purpose, directories, commands, conventions, and boundaries.
4. Keep exactly one {{localServicesHeading}} section in AGENTS.md with Install, Start, Stop, and Destroy commands. Do not write ports or paths there.
5. Do not commit or push. Call submit_result when finished.

Return:
{
"description": "A Chinese project description of 200-600 characters",
"services": {
"installCommand": "optional command",
"stopCommand": "optional command",
"destroyCommand": "optional command",
"definitions": [{"name": "api", "startCommand": "long-running command using ${PORT1}"}],
"views": [{"name": "API", "service": "api", "port": "PORT1", "path": "/"}]
}
}

Constraints:

- Do not invent commands or write secrets.
- A service is a process started by a command. A view is a browser-accessible entry point; one service may expose multiple views.
- The returned startCommand is the actual command Supervisor will execute. Do not copy the ordinary README or AGENTS.md Start command unchanged when it lacks a dynamic port.
- For every long-running HTTP service, inspect the manifest scripts and the tool's command-line options/configuration to find how its port is injected. Return a startCommand that passes the consecutive ${PORT1}, ${PORT2}, ... placeholders to that real start script or executable.
- Do not assume a framework, language, package manager, or command syntax. Inspect the project's own manifests, scripts, configuration, and command help to determine how its process accepts a port.
- Never use a fixed port, an implicit default port, or an environment variable that Supervisor cannot substitute. If a service cannot accept an injected port after inspecting its files and command help, do not register it as a browser-accessible service.
- Every view.service must reference a definition, view.port must reference a placeholder used by that service, and paths begin with /.
- Return empty definitions and views when no local development service exists.

Project name: {{projectName}}
Path: {{projectPath}}
