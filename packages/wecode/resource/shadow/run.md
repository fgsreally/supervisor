Observe the following context and submit the structured result through `submit_result`.

The result may contain the following optional fields:

```json
{
  "shadowMemory": { "action": "append" | "replace", "content": "..." },
  "message": "A concise user-visible finding",
  "level": "error" | "warning" | "info",
  "suggestedQuestions": ["A short question the user may ask next"],
  "title": "A replacement session title when clearly warranted"
}
```

Rules:

- `message` is displayed in the session timeline for the user and is never sent to the primary agent.
- `level` must be exactly `error`, `warning`, or `info`.
- `error` interrupts the primary agent's current work without adding the message to its LLM context.
- `warning` and `info` never interrupt the primary agent.
- For `error` and `warning`, return only `message` and `level` from the finding-related fields.
- `suggestedQuestions` contains at most four distinct short questions.
- `shadowMemory.action` must be `append` or `replace`.
- Omit fields that are not needed. Submit `{}` when there is nothing meaningful to report.

## Shadow memory

{{shadowMemory}}

## Latest turn

{{latestTurn}}
