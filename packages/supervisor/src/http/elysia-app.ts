import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";

type RouteHandler = (context: SupervisorHttpContext) => unknown | Promise<unknown>;
type RouteHooks = Record<string, unknown>;
type WebSocketHooks = Record<string, unknown>;

interface ElysiaRequestContext {
  request: Request;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
}

export interface SupervisorHttpContext {
  req: {
    raw: Request;
    param(name: string): string;
    param(): Record<string, string>;
    query(name: string): string | undefined;
    query(): Record<string, string>;
    header(name: string): string | undefined;
    json<T = unknown>(): Promise<T>;
    formData(): Promise<FormData>;
    parseBody<T = Record<string, unknown>>(): Promise<T>;
  };
  json<T>(value: T, status?: number): Response;
}

export type SupervisorElysiaApp = Elysia & {
  request(path: string, init?: RequestInit): Promise<Response>;
};

function createContext(context: ElysiaRequestContext): SupervisorHttpContext {
  const request = context.request;
  return {
    req: {
      raw: request,
      param(name?: string) {
        return name === undefined ? context.params : context.params[name];
      },
      query(name?: string) {
        if (name === undefined) {
          return Object.fromEntries(
            Object.entries(context.query).filter((entry): entry is [string, string] => {
              return typeof entry[1] === "string";
            }),
          );
        }
        return context.query[name];
      },
      header(name: string) {
        return request.headers.get(name) ?? undefined;
      },
      async json<T>() {
        if (context.body !== undefined && !(context.body instanceof FormData)) {
          return context.body as T;
        }
        return (await request.clone().json()) as T;
      },
      async formData() {
        if (context.body instanceof FormData) return context.body;
        return request.clone().formData();
      },
      async parseBody<T>() {
        if (context.body !== undefined) return context.body as T;
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("multipart/form-data")) {
          return Object.fromEntries(await request.clone().formData()) as T;
        }
        return (await request.clone().json()) as T;
      },
    },
    json<T>(value: T, status = 200) {
      return Response.json(value, { status });
    },
  } as SupervisorHttpContext;
}

export class SupervisorElysiaBuilder {
  readonly app = new Elysia().use(
    openapi({
      path: "/openapi",
      documentation: {
        info: { title: "Pi Supervisor HTTP API", version: "1.0.0" },
      },
    }),
  );

  constructor(
    private readonly requestGuard?: (context: SupervisorHttpContext) => Response | undefined,
  ) {}

  private route(
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    handler: RouteHandler,
    hooks?: RouteHooks,
  ): this {
    const adapted = (context: ElysiaRequestContext) => {
      const supervisorContext = createContext(context);
      return this.requestGuard?.(supervisorContext) ?? handler(supervisorContext);
    };
    const parameterNames = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]);
    const module = path.split("/").filter(Boolean)[0] ?? "system";
    const routeHooks = {
      ...hooks,
      ...(parameterNames.length && !hooks?.params
        ? {
            params: t.Object(Object.fromEntries(parameterNames.map((name) => [name, t.String()]))),
          }
        : {}),
      detail: {
        tags: [module],
        ...(typeof hooks?.detail === "object" ? hooks.detail : {}),
      },
    };
    (this.app[method] as any)(path, adapted, routeHooks);
    return this;
  }

  get(path: string, handler: RouteHandler, hooks?: RouteHooks): this {
    return this.route("get", path, handler, hooks);
  }

  post(path: string, handler: RouteHandler, hooks?: RouteHooks): this {
    return this.route("post", path, handler, hooks);
  }

  put(path: string, handler: RouteHandler, hooks?: RouteHooks): this {
    return this.route("put", path, handler, hooks);
  }

  patch(path: string, handler: RouteHandler, hooks?: RouteHooks): this {
    return this.route("patch", path, handler, hooks);
  }

  delete(path: string, handler: RouteHandler, hooks?: RouteHooks): this {
    return this.route("delete", path, handler, hooks);
  }

  all(path: string, handler: RouteHandler, hooks?: RouteHooks): this {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      this.route(method, path, handler, hooks);
    }
    return this;
  }

  ws(path: string, hooks: WebSocketHooks): this {
    (this.app.ws as any)(path, hooks);
    return this;
  }

  build(): SupervisorElysiaApp {
    const app = this.app as SupervisorElysiaApp;
    app.request = (path, init) => {
      const url =
        path.startsWith("http://") || path.startsWith("https://")
          ? path
          : `http://localhost${path.startsWith("/") ? path : `/${path}`}`;
      return app.handle(new Request(url, init));
    };
    return app;
  }
}
