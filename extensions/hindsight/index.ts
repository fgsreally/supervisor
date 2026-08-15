import { defineAgentExtension } from "pi-supervisor";
import { computeBankScope } from "./bank.js";
import { createHindsightClient } from "./client.js";
import { isHindsightApiConfigured, loadHindsightConfig, resolveMemoryMode } from "./config.js";
import { entriesToHindsightMessages, harnessMessagesToHindsight } from "./messages.js";
import { registerHindsightTool } from "./register-tool.js";
import { HindsightSessionState } from "./state.js";
import { createRecallTool } from "./tools/recall.js";
import { createReflectTool } from "./tools/reflect.js";
import { createRetainTool } from "./tools/retain.js";

const banksSet = new Set<string>();

export default defineAgentExtension({
  name: "supervisor-hindsight",
  scope: "agent",
  setup(ctx) {
    const config = loadHindsightConfig();
    const mode = resolveMemoryMode(config);

    if (mode === "disabled") {
      ctx.log(
        "info",
        "hindsight: disabled (set HINDSIGHT_API_URL or HINDSIGHT_LOCAL_FALLBACK=true)",
      );
      return;
    }

    ctx.agent.on("session.setup", async (session) => {
      const bankScope = computeBankScope(config, session.cwd);
      let state: HindsightSessionState | undefined;

      const createState = (): HindsightSessionState => {
        const client = isHindsightApiConfigured(config)
          ? createHindsightClient({ ...config, hindsightApiUrl: config.hindsightApiUrl! })
          : undefined;
        return new HindsightSessionState({
          sessionId: String(session.id),
          projectDir: session.project.dir,
          mode,
          client,
          bankId: bankScope.bankId,
          retainTags: bankScope.retainTags,
          recallTags: bankScope.recallTags,
          recallTagsMatch: bankScope.recallTagsMatch,
          config,
          banksSet,
          getMessages: async () => {
            const entries = await session.messages.currentBranch();
            return entriesToHindsightMessages(entries);
          },
          injectRecall: (block) => {
            session.inject.reattach("hindsight", block, { priority: 20, dedupeAfterTurns: 0 });
          },
          log: (level, message, meta) => ctx.log(level, message, meta),
        });
      };

      const getState = () => state;

      for (const tool of [
        createRetainTool(getState),
        createRecallTool(getState),
        createReflectTool(getState),
      ]) {
        registerHindsightTool(ctx, tool);
      }

      state = createState();
      await state.maybeRecallOnSessionStart();

      session.on("message.user", async (event) => {
        if (!state) state = createState();
        await state.maybeRecallForUserMessage(event.text);
      });

      session.on("agent.end", async (event) => {
        if (!state) return;
        const messages = harnessMessagesToHindsight(event.messages ?? []);
        await state.maybeRetainOnAgentEnd(messages);
        await state.flushRetainQueue();
      });

      session.on("session.end", async () => {
        if (!state) return;
        await state.flushRetainQueue();
        state.dispose();
        state = undefined;
      });

      ctx.log(
        "info",
        `hindsight: registered retain/recall/reflect (${mode} mode, bank=${bankScope.bankId})`,
      );

      return () => {
        state?.dispose();
        state = undefined;
      };
    });
  },
});
