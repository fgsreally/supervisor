import { describe, expect, it } from "vitest";

import { getExampleComposerState, getExampleSessionProps } from "./index";

describe("composer stack example", () => {
  it("exposes every composer-top surface", () => {
    const id = "example:composer:all";
    const session = getExampleSessionProps(id);
    const composer = getExampleComposerState(id);

    expect(composer.queuedInputs).toHaveLength(2);
    expect(composer.suggestions).toHaveLength(3);
    expect(session?.meta.changedFiles).toHaveLength(3);
    expect((session?.meta.git as { pendingUpdate?: unknown }).pendingUpdate).toBeTruthy();
  });
});
