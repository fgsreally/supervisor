export type SessionTodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface SessionTodo {
  id?: string;
  title: string;
  status: SessionTodoStatus;
  dependsOn?: string[];
  sessionId?: number;
}

export function parseSessionTodos(value: unknown): SessionTodo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = "title" in item && typeof item.title === "string" ? item.title.trim() : "";
    const status = "status" in item ? item.status : undefined;
    if (
      !title ||
      (status !== "pending" &&
        status !== "in_progress" &&
        status !== "completed" &&
        status !== "cancelled")
    ) {
      return [];
    }
    const id = "id" in item && typeof item.id === "string" ? item.id.trim() : undefined;
    const dependsOn =
      "dependsOn" in item && Array.isArray(item.dependsOn)
        ? item.dependsOn.filter((value: unknown): value is string => typeof value === "string")
        : undefined;
    const sessionId =
      "sessionId" in item && Number.isSafeInteger(item.sessionId)
        ? (item.sessionId as number)
        : undefined;
    return [{ id, title, status, dependsOn, sessionId }];
  });
}

export function renderSessionTodos(todos: SessionTodo[]): string {
  if (todos.length === 0) return "Todo list is empty.";
  return [
    "Current todo list:",
    ...todos.map(
      (todo) =>
        `- ${todo.id ? `${todo.id} ` : ""}[${todo.status}] ${todo.title}${todo.dependsOn?.length ? ` (depends on: ${todo.dependsOn.join(", ")})` : ""}${todo.sessionId ? ` (session: ${todo.sessionId})` : ""}`,
    ),
  ].join("\n");
}
