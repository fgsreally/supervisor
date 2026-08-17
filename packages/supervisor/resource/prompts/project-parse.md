Complete project analysis and initialization in this order:

1. Verify git is installed and run `git init` if necessary without changing remotes.
2. Inspect README, manifests, CI, checks, existing Agent instructions, and project structure.
3. Create or rewrite AGENTS.md with project purpose, directories, commands, conventions, and boundaries.
4. Keep exactly one {{localServicesHeading}} section in AGENTS.md with Install, Start, Stop, and Destroy commands. Do not write ports or paths there. If AGENTS.md already exists, refactor it to match the project.
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
- Use consecutive ${PORT1}, ${PORT2}, ... placeholders instead of fixed ports.
- Every view.service must reference a definition, view.port must reference a placeholder used by that service, and paths begin with /.
- Return empty definitions and views when no local development service exists.

Project name: {{projectName}}
Path: {{projectPath}}
