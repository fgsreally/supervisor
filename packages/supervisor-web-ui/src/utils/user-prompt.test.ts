import { describe, expect, it } from "vitest";
import {
  buildOptimisticUserParts,
  makeAttachmentToken,
  makePastedTextToken,
  parseUserPrompt,
} from "./user-prompt";

describe("user prompt pasted text", () => {
  it("parses escaped inline and attachment XML parts", () => {
    const parts = parseUserPrompt(
      '<user_prompt><text>before &lt;ok&gt;</text><pasted_text id="p1" chars="120" mode="inline">a&amp;b</pasted_text><pasted_text id="p2" chars="201" mode="attachment" path="@/attachments/p2.txt" /></user_prompt>',
    );

    expect(parts).toEqual([
      { type: "text", text: "before <ok>" },
      { type: "pasted_text", id: "p1", chars: 120, mode: "inline", text: "a&b" },
      {
        type: "pasted_text",
        id: "p2",
        chars: 201,
        mode: "attachment",
        path: "@/attachments/p2.txt",
      },
    ]);
  });

  it("keeps ordinary text outside of XML part tags", () => {
    expect(
      parseUserPrompt(
        '<user_prompt>before &lt;ok&gt;<attachment id="a1" name="report.pdf" mimeType="application/pdf" size="12" path="@/attachments/report.pdf" />after</user_prompt>',
      ),
    ).toEqual([
      { type: "text", text: "before <ok>" },
      {
        type: "attachment",
        id: "a1",
        name: "report.pdf",
        mimeType: "application/pdf",
        size: 12,
        path: "@/attachments/report.pdf",
      },
      { type: "text", text: "after" },
    ]);
  });

  it("builds optimistic parts from editor tokens", () => {
    const token = makePastedTextToken("p1");
    expect(
      buildOptimisticUserParts(`left ${token} right`, [{ id: "p1", text: "long", chars: 101 }]),
    ).toEqual([
      { type: "text", text: "left " },
      { type: "pasted_text", id: "p1", chars: 101, mode: "inline", text: "long" },
      { type: "text", text: " right" },
    ]);
  });

  it("parses and renders attachment tags", () => {
    const attachment = {
      id: "a1",
      name: "report.pdf",
      path: "@/attachments/attachment-a1-report.pdf",
      mimeType: "application/pdf",
      size: 1234,
    };
    expect(
      parseUserPrompt(
        '<user_prompt><attachment id="a1" name="report.pdf" mimeType="application/pdf" size="1234" path="@/attachments/attachment-a1-report.pdf" /></user_prompt>',
      ),
    ).toEqual([{ type: "attachment", ...attachment }]);
    expect(buildOptimisticUserParts(`查看 ${makeAttachmentToken("a1")}`, [], [attachment])).toEqual(
      [
        { type: "text", text: "查看 " },
        { type: "attachment", ...attachment },
      ],
    );
  });
});
