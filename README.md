# supervisor-standalone

Standalone Supervisor project — extracted from the pi monorepo, modernized with a Rust-based toolchain.

## Packages

- `packages/supervisor` — SQLite-backed multi-session agent runtime
- `packages/supervisor-web-ui` — Vue 3 + Vite web UI

## Toolchain

This project uses a Rust-based toolchain:

- **Package manager**: [nub](https://github.com/nubjs/nub) — Rust all-in-one Node.js toolkit (pnpm-compatible CLI)
- **Linter**: [oxlint](https://oxc.rs/) — ESLint-compatible, 50-100x faster
- **Formatter**: [oxfmt](https://oxc.rs/) — Prettier-compatible, 30x faster
- **Builder**: [tsdown](https://tsdown.dev/) — Rust-based TypeScript bundler for the supervisor package; Vite remains for the web UI

## Prerequisites

Install `nub` (Windows PowerShell):

```powershell
irm https://nubjs.com/install.ps1 | iex
```

Or via npm:

```sh
npm install -g --ignore-scripts=false @nubjs/nub
```

`nub` reads the workspace config (pnpm-workspace.yaml) and is flag-for-flag compatible with pnpm.

## Install

```sh
nub install
```

## Common scripts

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `nub run build`        | Build the supervisor package                 |
| `nub run dev`          | Start the web UI dev server (Vite, :5173)    |
| `nub run dev:supervisor` | Watch-build the supervisor package         |
| `nub run lint`         | Lint with oxlint                             |
| `nub run lint:fix`     | Apply safe lint fixes via oxlint            |
| `nub run format`       | Format source with oxfmt                     |
| `nub run format:check` | Check formatting without writing            |
| `nub run check`        | Run lint + format check + per-package check |
| `nub run test`         | Run tests across all packages               |
| `nub run serve`        | Launch the supervisor server on :3030       |
| `nub run docs:dev`     | Start VitePress docs dev server (:5173)      |
| `nub run docs:build`   | Build VitePress docs to `docs/.vitepress/dist` |
| `nub run docs:preview` | Preview built docs                          |

You can also use `pnpm` directly as a fallback since `nub` is pnpm-compatible.

## Documentation

Full documentation lives under [`docs/`](docs/). Run `pnpm docs:dev` to start the VitePress dev server, or read:

- [快速开始](docs/guide/getting-started.md)
- [架构总览](docs/guide/architecture.md)
- [Supervisor 后端](docs/supervisor/overview.md)
- [Web UI 前端](docs/web-ui/overview.md)
- [Supervisor 已知未实装功能](docs/supervisor/known-gaps.md)
- [Web UI 已知未实装功能](docs/web-ui/known-gaps.md)

## Architecture

See `packages/supervisor/SUPERVISOR.md` for the supervisor architecture overview. The web UI is a Vue 3 + Vite + Pinia app that connects to the supervisor server's HTTP API.

## Project Layout

```
supervisor-standalone/
├── packages/
│   ├── supervisor/         (@earendil-works/pi-supervisor)
│   └── supervisor-web-ui/ (@earendil-works/pi-supervisor-ui)
├── docs/                  VitePress documentation
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── oxlint.json
├── .oxfmtrc.json
├── AGENTS.md
├── LICENSE
└── README.md
```

## Notes

- Internal pi dependencies (`@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`) are pulled from the npm registry at version `^0.74.0`.
- `@earendil-works/pi-supervisor` is consumed by the web UI as a `workspace:*` dependency.
- The supervisor package's build script is `tsdown`; it compiles `src/**/*.ts` to `dist/`. See `packages/supervisor/tsdown.config.ts`.
- The web UI keeps its Vite + vue-tsc toolchain unchanged.
