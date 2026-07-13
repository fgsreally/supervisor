import { defineExtension } from "@earendil-works/pi-supervisor";
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

export default defineExtension({
  name: "supervisor-hindsight",
  setup(ctx) {
    const config = loadHindsightConfig();
    const mode = resolveMemoryMode(config);

    if (mode === "disabled") {
      ctx.runtime.log(
        "info",
        "hindsight: disabled (set HINDSIGHT_API_URL or HINDSIGHT_LOCAL_FALLBACK=true)",
      );
      return;
    }

    const bankScope = computeBankScope(config, ctx.cwd);
    let state: HindsightSessionState | undefined;

    const createState = (): HindsightSessionState => {
      const client = isHindsightApiConfigured(config) ? createHindsightClient(config) : undefined;
      return new HindsightSessionState({
        sessionId: String(ctx.sessionId),
        projectDir: ctx.projectDir,
        mode,
        client,
        bankId: bankScope.bankId,
        retainTags: bankScope.retainTags,
        recallTags: bankScope.recallTags,
        recallTagsMatch: bankScope.recallTagsMatch,
        config,
        banksSet,
        getMessages: async () => {
          const entries = await ctx.session.messages.currentBranch();
          return entriesToHindsightMessages(entries);
        },
        injectRecall: (block) => {
          ctx.inject.reattach("hindsight", block, { priority: 20, dedupeAfterTurns: 0 });
        },
        log: (level, message, meta) => ctx.runtime.log(level, message, meta),
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

    const offStart = ctx.runtime.on("session.start", async () => {
      state = createState();
      await state.maybeRecallOnSessionStart();
    });

    const offUser = ctx.runtime.on("message.user", async (event) => {
      if (!state) state = createState();
      await state.maybeRecallForUserMessage(event.text);
    });

    const offAgentEnd = ctx.runtime.on("agent.end", async (event) => {
      if (!state) return;
      const messages = harnessMessagesToHindsight(event.messages ?? []);
      await state.maybeRetainOnAgentEnd(messages);
      await state.flushRetainQueue();
    });

    const offEnd = ctx.runtime.on("session.end", async () => {
      if (!state) return;
      await state.flushRetainQueue();
      state.dispose();
      state = undefined;
    });

    ctx.runtime.log(
      "info",
      `hindsight: registered retain/recall/reflect (${mode} mode, bank=${bankScope.bankId})`,
    );

    return () => {
      offStart();
      offUser();
      offAgentEnd();
      offEnd();
      state?.dispose();
      state = undefined;
    };
  },
});
