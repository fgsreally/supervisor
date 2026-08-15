# Web UI component architecture

The web UI keeps components grouped by responsibility:

- `components/base` contains reusable controls, feedback surfaces, editors, and responsive primitives.
- `components/agent` contains Agent configuration and Agent resource views.
- `components/provider` contains provider and model configuration components.
- `components/resource` contains resource, Skill, Extension, and MCP resource components.
- `components/session` contains session lists, files, logs, previews, menus, and background services.
- `components/chat` contains message rendering and chat input components.
- `components/tool` contains tool activity, approval, detail, and terminal surfaces.
- `components/project`, `components/settings`, and `components/external-agent` contain their respective domains.

Each domain exposes a local `index.ts`. Consumers may import a domain entry or a component
through that domain's directory; they should not import a PC/mobile implementation directly.

Responsive components use this structure:

    Component/
    ├── index.vue   # public selector
    ├── pc.vue      # desktop implementation
    └── mobile.vue  # mobile implementation

`index.vue` chooses the platform implementation. Shared behavior belongs in a sibling
`frame.vue` or composable. A component with no platform-specific behavior remains a single
`.vue` file.

The repository test `src/__tests__/component-boundaries.test.ts` protects the domain
directories and the responsive entrypoint convention.

## Reuse before specialization

Before creating a component, compare it with nearby components. If the difference is only a
title, action area, icon, empty state, or layout fragment, keep one component and expose the
variation through props and named slots. For example, chat header popovers use
`components/chat/ChatHeaderPopover.vue`; feature components provide their icon, title bar, and
content through slots instead of duplicating the responsive popover shell.
