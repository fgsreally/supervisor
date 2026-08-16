import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";

const app = new Elysia()
  .use(openapi({ path: "/openapi" }))
  .post("/items/:id", ({ body, params }) => ({ id: params.id, name: body.name }), {
    params: t.Object({ id: t.String() }),
    body: t.Object({ name: t.String() }),
    response: t.Object({ id: t.String(), name: t.String() }),
    detail: { operationId: "updateItem" },
  });

const response = await app.handle(new Request("http://localhost/openapi/json"));
const document = (await response.json()) as { paths?: Record<string, unknown> };
if (!document.paths?.["/items/{id}"]) throw new Error("Elysia OpenAPI route extraction failed");
console.log("elysia-openapi-ok");
