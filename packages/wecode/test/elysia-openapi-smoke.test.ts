import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";
import { describe, expect, it } from "vitest";

describe("Elysia OpenAPI spike", () => {
  it("extracts route, params, query, body, and response schemas", async () => {
    const app = new Elysia().use(openapi({ path: "/openapi" })).post(
      "/modules/:module/actions",
      ({ body, params, query }) => ({
        module: params.module,
        action: body.action,
        dryRun: query.dryRun,
      }),
      {
        params: t.Object({ module: t.String() }),
        query: t.Object({ dryRun: t.Optional(t.Boolean()) }),
        body: t.Object({ action: t.String(), payload: t.Optional(t.Unknown()) }),
        response: t.Object({
          module: t.String(),
          action: t.String(),
          dryRun: t.Optional(t.Boolean()),
        }),
        detail: {
          operationId: "runModuleAction",
          tags: ["Capabilities"],
          summary: "Run a module action",
        },
      },
    );

    const response = await app.handle(new Request("http://localhost/openapi/json"));
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      paths: Record<string, Record<string, any>>;
    };
    const operation = document.paths["/modules/{module}/actions"]?.post;
    expect(operation).toMatchObject({
      operationId: "runModuleAction",
      tags: ["Capabilities"],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["action"],
            },
          },
        },
      },
    });
    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "module", in: "path", required: true }),
        expect.objectContaining({ name: "dryRun", in: "query", required: false }),
      ]),
    );
    expect(operation.responses[200].content["application/json"].schema).toMatchObject({
      type: "object",
      required: ["module", "action"],
    });
  });
});
