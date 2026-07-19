export type SessionTodoStatus = "pending" | "in_progress" | "done";

export interface SessionTodo {
  title: string;
  status: SessionTodoStatus;
}

export function parseSessionTodos(value: unknown): SessionTodo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = "title" in item && typeof item.title === "string" ? item.title.trim() : "";
    const status = "status" in item ? item.status : undefined;
    if (!title || (status !== "pending" && status !== "in_progress" && status !== "done")) {
      return [];
    }
    return [{ title, status }];
  });
}

export function renderSessionTodos(todos: SessionTodo[]): string {
  if (todos.length === 0) return "Todo list is empty.";
  return ["Current todo list:", ...todos.map((todo) => `- [${todo.status}] ${todo.title}`)].join(
    "\n",
  );
}
