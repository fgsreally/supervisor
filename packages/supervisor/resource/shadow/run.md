Observe the following context and submit the structured result through `submit_result`.

The result may contain the following optional fields:

```json
{
  "shadowMemory": { "action": "append" | "replace", "content": "..." },
  "alert": "A concrete issue that requires the primary agent to react immediately",
  "analysis": "A useful observation shown to the user but hidden from the primary agent",
  "suggestedQuestions": ["A short question the user may ask next"],
  "title": "A replacement session title when clearly warranted",
  "commitMessage": "A checkpoint commit message when a stable intermediate milestone exists"
}
```

Rules:

- `alert` and `analysis` are mutually exclusive. Provide at most one of them.
- `alert` interrupts the primary agent and becomes part of its next LLM context. Use it only for an urgent, concrete problem.
- `analysis` is displayed in the session timeline for the user and is never sent to the primary agent.
- `suggestedQuestions` contains at most four distinct short questions.
- `shadowMemory.action` must be `append` or `replace`.
- Omit fields that are not needed. Submit `{}` when there is nothing meaningful to report.

## Shadow memory

{{shadowMemory}}

## Latest turn

{{latestTurn}}
