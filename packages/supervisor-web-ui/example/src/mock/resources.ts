export type ResourceKind = "skills" | "extensions" | "prompts";
export type ResourceLayer = "global" | "agent";

export interface MockSkillFile {
  id: string;
  fileName: string;
  content: string;
}

export interface MockResourceItemBase {
  id: string;
  kind: ResourceKind;
  layer: ResourceLayer;
  name: string;
  description: string;
  agentIds?: string[];
}

export interface MockSkillItem extends MockResourceItemBase {
  kind: "skills";
  /** Skill directory path (shown for global resources). */
  rootPath?: string;
  files: MockSkillFile[];
}

export interface MockFileItem extends MockResourceItemBase {
  kind: "extensions" | "prompts";
  fileName: string;
  /** Full file path (shown for global resources). */
  path: string;
  content: string;
}

export type MockResourceItem = MockSkillItem | MockFileItem;

export const mockGlobalResources: MockResourceItem[] = [
  // Global resources now use supervisor paths only, not coding-agent's ~/.pi/agent/
  // Skills/extensions/prompts are loaded from ~/.pi/supervisor/ or cwd/.pi/supervisor/
];

export const mockAgentResources: Record<string, MockResourceItem[]> = {
  "frontend-dev": [
    {
      id: "a-fe-vue3",
      kind: "skills",
      layer: "agent",
      name: "vue3-composition",
      description: "Vue 3 Composition API patterns",
      rootPath: "~/.pi/supervisor/agents/frontend-dev/skills/vue3-composition",
      files: [
        {
          id: "a-fe-vue3-skill",
          fileName: "SKILL.md",
          content: `# vue3-composition

Prefer \`<script setup lang="ts">\`.

## State

\`\`\`ts
const count = ref(0)
const doubled = computed(() => count.value * 2)
\`\`\`

## Props

Use \`defineProps<{ id: string }>()\` — no runtime props object.
`,
        },
        {
          id: "a-fe-vue3-patterns",
          fileName: "patterns/composables.md",
          content: `# composables

- One concern per composable file
- Return readonly refs when exposing state
- Name files \`useFoo.ts\`
`,
        },
        {
          id: "a-fe-vue3-scaffold",
          fileName: "scripts/scaffold.ts",
          content: `export function scaffoldComponent(name: string): string {
  return \`<script setup lang="ts">
// \${name}
</script>

<template>
  <div class="\${name.toLowerCase()}"></div>
</template>
\`
}
`,
        },
      ],
      agentIds: ["frontend-dev"],
    },
    {
      id: "a-fe-vue-helper",
      kind: "extensions",
      layer: "agent",
      name: "vue-helper",
      description: "Component scaffold tool for this agent only",
      fileName: "index.ts",
      path: "~/.pi/supervisor/agents/frontend-dev/extensions/vue-helper/index.ts",
      content: `const factory = (pi) => {
  pi.registerTool({
    name: "scaffold_vue",
    label: "scaffold vue",
    description: "Create a .vue SFC with script setup",
    execute: async () => ({ content: [{ type: "text", text: "Created Component.vue" }] }),
  });
};
export default factory;
`,
      agentIds: ["frontend-dev"],
    },
  ],
  "css-specialist": [
    {
      id: "a-css-tailwind",
      kind: "skills",
      layer: "agent",
      name: "tailwind-patterns",
      description: "Tailwind layout and spacing conventions",
      rootPath: "~/.pi/supervisor/agents/css-specialist/skills/tailwind-patterns",
      files: [
        {
          id: "a-css-tailwind-skill",
          fileName: "SKILL.md",
          content: `# tailwind-patterns

- Spacing scale: \`gap-3\`, \`p-4\`, avoid arbitrary values unless matching design tokens.
- Layout: \`flex min-w-0\` on rows with truncation.
- Desktop: use \`md:\` breakpoints; mobile-first defaults.
`,
        },
        {
          id: "a-css-tailwind-tokens",
          fileName: "tokens/spacing.md",
          content: `# spacing tokens

| Token | px |
|-------|-----|
| gap-3 | 12px |
| p-4   | 16px |
`,
        },
      ],
      agentIds: ["css-specialist"],
    },
  ],
  "test-runner": [
    {
      id: "a-qa-vitest",
      kind: "skills",
      layer: "agent",
      name: "vitest-fix",
      description: "Minimal fix patterns for failing vitest suites",
      rootPath: "~/.pi/supervisor/agents/test-runner/skills/vitest-fix",
      files: [
        {
          id: "a-qa-vitest-skill",
          fileName: "SKILL.md",
          content: `# vitest-fix

1. Run single file: \`npx vitest --run path/to.test.ts\`
2. Fix assertion first; avoid widening mocks without reason.
3. Prefer \`vi.mocked(fn)\` over \`as any\`.
`,
        },
        {
          id: "a-qa-vitest-recipes",
          fileName: "recipes/mock-reset.md",
          content: `# mock reset

Use \`vi.clearAllMocks()\` in \`beforeEach\` when tests share module mocks.
`,
        },
      ],
      agentIds: ["test-runner"],
    },
  ],
};

export {
  mockStore,
  getGlobalResources,
  getResourcesByKind,
  getResourceById,
  getLinkedResourcesForAgent,
  updateResource,
  updateResourceContent,
  updateSkillFileContent,
} from "./store";

export {
  getResourceEntryLabel,
  getResourcePreviewContent,
  getFileBaseName,
  isSkillItem,
  isFileItem,
} from "./resource-utils";
