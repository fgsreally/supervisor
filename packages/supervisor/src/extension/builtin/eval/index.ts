import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { Type } from "typebox";
import type { ExtensionDefinition } from "../../types.js";

type Language = "js" | "py";
type KernelReply = { id: number; output: string; value?: unknown; error?: string };

const JS_RUNNER = String.raw`
const vm = require("node:vm"), { parentPort } = require("node:worker_threads");
let context;
function reset(){ const lines=[]; context=vm.createContext({ Buffer, URL, URLSearchParams, fetch, setTimeout, clearTimeout, console:{log:(...x)=>lines.push(x.map(v=>typeof v==="string"?v:JSON.stringify(v)).join(" ")),error:(...x)=>lines.push(x.join(" "))}, __lines:lines }); }
reset();
parentPort.on("message", async m => { try { if(m.reset) reset(); context.__lines.length=0; let value=await new vm.Script(m.code,{filename:"eval.js"}).runInContext(context,{timeout:m.timeout}); try { value=value===undefined?undefined:JSON.parse(JSON.stringify(value)); } catch { value=String(value); } parentPort.postMessage({id:m.id,output:context.__lines.join("\n"),value}); } catch(e){ parentPort.postMessage({id:m?.id??-1,output:context?.__lines?.join("\n")??"",error:e?.stack||String(e)}); } });`;

const PY_RUNNER = String.raw`
import sys,json,io,traceback,contextlib
ns={}
for line in sys.stdin:
 try:
  m=json.loads(line); ns={} if m.get('reset') else ns; out=io.StringIO()
  with contextlib.redirect_stdout(out),contextlib.redirect_stderr(out): exec(compile(m['code'],'eval.py','exec'),ns,ns)
  sys.__stdout__.write(json.dumps({'id':m['id'],'output':out.getvalue().rstrip()},default=str)+'\n');sys.__stdout__.flush()
 except Exception:
  sys.__stdout__.write(json.dumps({'id':m.get('id',-1),'output':out.getvalue().rstrip() if 'out' in locals() else '', 'error':traceback.format_exc()})+'\n');sys.__stdout__.flush()
`;

interface EvalKernel {
  execute(code: string, timeoutSeconds: number, reset: boolean): Promise<KernelReply>;
  dispose(): void;
}

class JsEvalKernel implements EvalKernel {
  private worker?: Worker;
  private sequence = 0;
  private pending = new Map<number, (reply: KernelReply) => void>();

  private start(): void {
    if (this.worker) return;
    const worker = new Worker(JS_RUNNER, { eval: true });
    this.worker = worker;
    worker.on("message", (reply: KernelReply) => {
      this.pending.get(reply.id)?.(reply);
      this.pending.delete(reply.id);
    });
    worker.once("error", (error) => this.fail(`JavaScript eval worker failed: ${error.message}`));
    worker.once("exit", (code) => {
      if (this.worker === worker) this.fail(`JavaScript eval worker exited with code ${code}`);
    });
  }

  private fail(error: string): void {
    this.worker = undefined;
    for (const [id, resolve] of this.pending) resolve({ id, output: "", error });
    this.pending.clear();
  }

  async execute(code: string, timeoutSeconds: number, reset: boolean): Promise<KernelReply> {
    this.start();
    const id = ++this.sequence;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.dispose();
        resolve({ id, output: "", error: `Eval timed out after ${timeoutSeconds}s` });
      }, timeoutSeconds * 1000);
      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      this.worker!.postMessage({ id, code, reset, timeout: timeoutSeconds * 1000 });
    });
  }

  dispose(): void {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) void worker.terminate();
  }
}

class PythonEvalKernel implements EvalKernel {
  private process?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, (reply: KernelReply) => void>();
  private buffer = "";

  constructor(private cwd: string) {}

  private start(): void {
    if (this.process) return;
    const command = process.platform === "win32" ? "python" : "python3";
    const args = ["-u", "-c", PY_RUNNER];
    const child = spawn(command, args, { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.process = child;
    child.stdout.on("data", (chunk) => {
      this.buffer += String(chunk);
      for (;;) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        try {
          const reply = JSON.parse(line) as KernelReply;
          this.pending.get(reply.id)?.(reply);
          this.pending.delete(reply.id);
        } catch {}
      }
    });
    child.once("exit", () => {
      this.process = undefined;
      for (const [id, resolve] of this.pending)
        resolve({ id, output: "", error: "Eval kernel exited" });
      this.pending.clear();
    });
    child.once("error", (error) => {
      this.process = undefined;
      for (const [id, resolve] of this.pending) {
        resolve({ id, output: "", error: `Cannot start Python eval kernel: ${error.message}` });
      }
      this.pending.clear();
    });
  }

  async execute(code: string, timeoutSeconds: number, reset: boolean): Promise<KernelReply> {
    this.start();
    const id = ++this.sequence;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.dispose();
        resolve({ id, output: "", error: `Eval timed out after ${timeoutSeconds}s` });
      }, timeoutSeconds * 1000);
      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      this.process!.stdin.write(
        `${JSON.stringify({ id, code, reset, timeout: timeoutSeconds * 1000 })}\n`,
      );
    });
  }

  dispose(): void {
    this.process?.kill();
    this.process = undefined;
  }
}

const evalExtension: ExtensionDefinition = {
  name: "eval",
  async setup(ctx) {
    const runtimeDir = join(ctx.session.dir, "eval");
    await mkdir(runtimeDir, { recursive: true });
    const kernels = new Map<Language, EvalKernel>();
    let queue = Promise.resolve();
    ctx.agent.registerTool({
      name: "eval",
      description:
        "Run ad-hoc JavaScript or Python in a persistent Session-owned runtime without creating scripts in the project workspace. State persists per language until reset.",
      parameters: Type.Object({
        language: Type.Union([Type.Literal("js"), Type.Literal("py")]),
        code: Type.String(),
        timeout: Type.Optional(Type.Integer({ minimum: 1, maximum: 300 })),
        reset: Type.Optional(Type.Boolean()),
      }),
      async execute(params: {
        language: Language;
        code: string;
        timeout?: number;
        reset?: boolean;
      }) {
        let release!: () => void;
        const previous = queue;
        queue = new Promise<void>((done) => (release = done));
        await previous;
        try {
          let kernel = kernels.get(params.language);
          if (!kernel) {
            kernel =
              params.language === "js" ? new JsEvalKernel() : new PythonEvalKernel(runtimeDir);
            kernels.set(params.language, kernel);
          }
          const reply = await kernel.execute(
            params.code,
            params.timeout ?? 30,
            params.reset ?? false,
          );
          const text = [
            reply.output,
            reply.value === undefined ? "" : JSON.stringify(reply.value, null, 2),
            reply.error ?? "",
          ]
            .filter(Boolean)
            .join("\n");
          return {
            content: [{ type: "text", text: text || "(no output)" }],
            isError: Boolean(reply.error),
            details: { language: params.language, runtimeDir, reset: params.reset ?? false },
          };
        } finally {
          release();
        }
      },
    });
    return () => {
      for (const kernel of kernels.values()) kernel.dispose();
      kernels.clear();
    };
  },
};

export default evalExtension;
