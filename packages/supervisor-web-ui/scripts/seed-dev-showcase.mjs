import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../supervisor/package.json", import.meta.url));
const Database = require("better-sqlite3");
if (process.env.NODE_ENV === "production") throw new Error("Development-only seed");

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const dbPath = resolve(
  process.argv[2] ?? resolve(repoRoot, "playground/.supervisor/supervisor.db"),
);
if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const now = Date.now();
const marker = "dev-extension-showcase-v2";
const project = db.prepare("SELECT id, cwd FROM projects ORDER BY id LIMIT 1").get();
if (!project) throw new Error("Start Supervisor once before seeding showcase data");

const scenarios = [
  {
    name: "timer",
    description: "发布窗口、健康检查与值班提醒",
    avatar: { text: "巡", color: "#07a65a" },
    timers: [
      {
        id: "release-health",
        prompt: "检查核心接口错误率并汇总异常",
        createdAt: now - 900_000,
        nextFireAt: now + 900_000,
        intervalMs: 1_800_000,
      },
      {
        id: "release-summary",
        prompt: "整理发布窗口结论并通知值班同学",
        createdAt: now - 800_000,
        nextFireAt: now + 3_600_000,
      },
    ],
    messages: [
      {
        role: "user",
        text: "今晚 22:00 发布，帮我安排半小时一次的健康检查，再加一个发布结束提醒。",
      },
      {
        role: "assistant",
        text: "我会把巡检频率和结束提醒一起安排，避免占用对话区。",
        tool: {
          name: "TimerCreate",
          intent: "安排发布后的健康巡检",
          result: "已安排每 30 分钟巡检",
        },
      },
      {
        role: "assistant",
        text: "两个提醒都已就绪。下一次巡检会重点关注错误率、延迟和关键链路。",
        tool: { name: "TimerList", intent: "确认发布窗口的提醒安排", result: "当前有 2 个提醒" },
      },
      {
        role: "user",
        text: "/review 发布前检查清单",
        source: "slash:skill",
        origin: "/review 发布前检查清单",
      },
      {
        role: "assistant",
        text: "清单还缺少回滚负责人和数据库变更确认。我已把这两项列为发布前必检项。",
      },
    ],
  },
  {
    name: "skill",
    description: "使用审查技能核对签名与幂等设计",
    avatar: { text: "审", color: "#576b95" },
    messages: [
      { role: "user", text: "新的支付回调准备上线，请重点检查重放攻击和重复入账。" },
      {
        role: "assistant",
        text: "我先按安全审查流程检查签名时效、nonce 去重与业务幂等边界。",
        tool: { name: "Skill", intent: "加载支付安全审查规范", result: "审查规范已加载" },
      },
      {
        role: "user",
        text: "/review 回调处理器与订单状态机",
        source: "slash:skill",
        origin: "/review 回调处理器与订单状态机",
      },
      {
        role: "assistant",
        text: "发现两个高优先级问题：时间戳未限制有效窗口；幂等键只覆盖请求，没有覆盖入账事务。建议上线前补齐，并增加并发重试测试。",
      },
    ],
  },
  {
    name: "prompt-template",
    description: "使用团队模板生成结构一致的生产事故复盘",
    avatar: { text: "模", color: "#5b6ee1" },
    messages: [
      { role: "user", text: "昨晚支付回调积压了 18 分钟，按团队复盘模板起草事故报告。" },
      {
        role: "assistant",
        text: "我会套用生产事故复盘模板，先整理影响、时间线、根因和改进项。",
      },
      {
        role: "user",
        text: "/incident-review 支付回调队列积压",
        source: "slash:prompt",
        origin: "/incident-review 支付回调队列积压",
      },
      {
        role: "assistant",
        text: "初稿已按统一结构生成。当前还缺少首次告警时间和受影响订单数，我先保留为待确认项。",
      },
      { role: "user", text: "首次告警 22:14，影响 326 笔订单，全部在 22:41 前补偿完成。" },
      {
        role: "assistant",
        text: "已补全时间线和影响范围，并把队列水位告警、消费端限流和补偿演练列为后续行动项。",
      },
    ],
  },
  {
    name: "task-management · TodoList",
    description: "以目标和待办推进搜索体验改版",
    avatar: { text: "客", color: "#d97706" },
    todos: [
      { title: "梳理无结果查询样本", status: "done" },
      { title: "实现同义词召回", status: "in_progress" },
      { title: "验证搜索延迟", status: "pending" },
    ],
    messages: [
      { role: "user", text: "客服反馈订单搜索经常无结果，先把问题拆开并给出本周可落地方案。" },
      {
        role: "assistant",
        text: "我会按样本分析、召回改进、延迟验证三个阶段推进。",
        tool: { name: "TodoWrite", intent: "建立搜索体验优化任务", result: "已建立 3 项任务" },
      },
      { role: "user", text: "先看最近一周的无结果查询，别改排序策略。" },
      {
        role: "assistant",
        text: "样本显示主要问题是商品别名和订单号中的分隔符。当前只扩展召回规则，不调整排序，风险较小。",
      },
    ],
  },
  {
    name: "mcp",
    description: "通过监控数据定位接口延迟波动",
    avatar: { text: "告", color: "#5b6ee1" },
    messages: [
      { role: "user", text: "结算接口 P95 从 180ms 涨到 900ms，帮我结合监控判断原因。" },
      {
        role: "assistant",
        text: "我先对齐延迟、数据库连接池和下游依赖的时间窗口。",
        tool: {
          name: "mcp_metrics_query",
          intent: "查询结算链路的关键监控指标",
          result: "监控数据已返回",
        },
      },
      { role: "user", text: "流量没有明显上涨，继续看数据库。" },
      {
        role: "assistant",
        text: "延迟上升与连接池等待完全重合，来源是报表任务的长事务。建议先限制报表并发，再把查询迁到只读副本。",
      },
    ],
  },
];

scenarios.splice(
  3,
  0,
  {
    name: "task-management · Goal",
    description: "用持久目标约束支付对账改造的完成条件",
    avatar: { text: "目", color: "#576b95" },
    taskArtifact: {
      path: "tasks/goal-reconciliation.md",
      type: "goal",
      title: "支付对账自动化目标",
      status: "active",
      body: "# 支付对账自动化目标\n\n将人工差异单减少 80%，且连续两周无漏单。",
    },
    messages: [
      {
        role: "user",
        text: "/goal 将人工对账差异单减少 80%，并连续两周无漏单。",
        source: "slash:custom",
        origin: "/goal 将人工对账差异单减少 80%，并连续两周无漏单。",
      },
      {
        role: "assistant",
        text: "我会把结果指标和停止条件保存为会话目标。",
        tool: { name: "Goal", intent: "创建支付对账自动化目标", result: "目标已创建并设为进行中" },
      },
      { role: "user", text: "把误报率也纳入验收，不能超过 2%。" },
      {
        role: "assistant",
        text: "已补充误报率上限；目标必须同时满足差异单、漏单和误报率三项条件。",
        tool: { name: "Goal", intent: "更新目标验收条件", result: "目标条件已更新" },
      },
    ],
  },
  {
    name: "task-management · Plan",
    description: "在只读计划模式中设计订单索引迁移方案",
    avatar: { text: "计", color: "#8b6f47" },
    taskArtifact: {
      path: "tasks/plan-order-index.md",
      type: "plan",
      title: "订单索引无停机迁移计划",
      status: "planning",
      body: "# 订单索引无停机迁移计划\n\n1. 创建新索引并回填。\n2. 双写校验。\n3. 灰度切读。\n4. 回滚演练。",
    },
    messages: [
      { role: "user", text: "先进入计划模式，设计订单索引的无停机迁移，不要修改代码。" },
      {
        role: "assistant",
        text: "已进入只读计划模式，我会先整理迁移阶段和回滚门槛。",
        tool: { name: "EnterPlanMode", intent: "创建订单索引迁移计划", result: "计划模式已启用" },
      },
      { role: "user", text: "需要包含双写校验和灰度切读。" },
      {
        role: "assistant",
        text: "计划已包含新索引回填、双写校验、灰度切读与回滚演练，等待评审后再退出计划模式。",
      },
    ],
  },
);

scenarios[0].messages.push(
  { role: "user", text: "把结束提醒改到 23:30，巡检频率保持不变。" },
  {
    role: "assistant",
    text: "已调整结束提醒，周期巡检不会受到影响。",
    tool: { name: "TimerDelete", intent: "取消原来的发布结束提醒", result: "原提醒已取消" },
  },
  {
    role: "assistant",
    text: "新的 23:30 提醒已经接替原提醒。",
    tool: { name: "TimerCreate", intent: "重新安排发布结束提醒", result: "已安排 23:30 提醒" },
  },
);
const skillScenario = scenarios.find((scenario) => scenario.name === "skill");
const todoScenario = scenarios.find((scenario) => scenario.name === "task-management · TodoList");
const mcpScenario = scenarios.find((scenario) => scenario.name === "mcp");
skillScenario.messages.find((item) => item.tool?.name === "Skill").tool.name = "skill";
todoScenario.messages.find((item) => item.tool?.name === "TodoWrite").tool.name = "TodoList";
skillScenario.messages.push(
  { role: "user", text: "规范里对回调签名原文的拼接顺序怎么要求？" },
  {
    role: "assistant",
    text: "我继续读取技能包里的签名规范与示例，而不是直接读取技能目录文件。",
    tool: { name: "skill", intent: "读取支付回调签名规范", result: "已读取技能资源中的签名章节" },
  },
  {
    role: "assistant",
    text: "要求按原始请求字段顺序验签，不能先反序列化再重新排序；同时必须校验时间戳窗口。",
  },
);
mcpScenario.messages.push(
  {
    role: "user",
    text: "/metrics 把连接池等待按实例拆开，确认是不是单点。",
    source: "slash:mcp",
    origin: "/metrics 把连接池等待按实例拆开，确认是不是单点。",
  },
  {
    role: "assistant",
    text: "我通过 MCP 监控服务按实例维度继续查询。",
    tool: {
      name: "mcp_metrics_query",
      intent: "按实例比较数据库连接池等待",
      result: "实例维度指标已返回",
    },
  },
  { role: "assistant", text: "三个实例同时升高，不是单点故障；共同依赖的报表主库是更可信的根因。" },
);

scenarios.push(
  {
    name: "eval",
    description: "展示 eval 扩展的持久 JavaScript 与 Python 运行环境",
    avatar: { text: "算", color: "#8b6f47" },
    messages: [
      {
        role: "user",
        text: "这组订单金额是 128、256、96、520，先用 JavaScript 算平均值并保留数据。",
      },
      {
        role: "assistant",
        text: "我会在 Session 专属的持久运行环境里计算，不在项目中创建脚本。",
        tool: { name: "eval", intent: "计算订单平均金额并保存样本", result: "平均金额为 250" },
      },
      { role: "user", text: "继续用刚才的变量算中位数，不要重新录入。" },
      {
        role: "assistant",
        text: "同一语言内的变量仍然存在，可以直接继续计算。",
        tool: { name: "eval", intent: "复用持久状态计算中位数", result: "中位数为 192" },
      },
      { role: "user", text: "切到 Python 做一次标准差对照。" },
      {
        role: "assistant",
        text: "Python 使用独立内核，因此我会在 Python 内核中建立对应样本。",
        tool: { name: "eval", intent: "使用 Python 复核订单波动", result: "总体标准差约为 168.4" },
      },
      {
        role: "assistant",
        text: "平均值和中位数差距明显，主要由 520 元订单拉高；这组数据不适合只看平均值。",
      },
    ],
  },
  {
    name: "subagent",
    description: "展示 subagent 扩展的前台委派、后台任务与结果汇总",
    avatar: { text: "协", color: "#576b95" },
    messages: [
      { role: "user", text: "结算模块改动较大，请把数据库一致性和接口兼容性分开审查。" },
      {
        role: "assistant",
        text: "我把两个独立方向交给不同成员并行处理，主会话负责汇总结论。",
        tool: {
          name: "spawn_agent",
          intent: "委派数据库一致性审查",
          result: "数据库审查成员已开始工作",
        },
      },
      {
        role: "assistant",
        text: "接口兼容性审查在后台运行，不阻塞当前讨论。",
        tool: {
          name: "spawn_agent",
          intent: "后台检查接口兼容性",
          result: "接口审查成员已开始工作",
        },
      },
      { role: "user", text: "先给我数据库方向的结论。" },
      {
        role: "assistant",
        text: "前台成员已返回：退款与清算更新顺序可能造成短暂不一致，建议合并到同一事务并增加唯一约束。",
      },
      { role: "user", text: "后台那项完成后也合并进总清单。" },
      { role: "assistant", text: "会保留子会话关系；后台结果返回后将在这里形成统一审查清单。" },
    ],
  },
  {
    name: "message-assets",
    description: "展示 message-assets 扩展如何把录屏绑定到对应消息",
    avatar: { text: "录", color: "#d97706" },
    changedFiles: [
      { path: "src/payment/pay.mjs", status: "modified", lastTurn: 1 },
      { path: "src/payment/index.html", status: "modified", lastTurn: 1 },
      { path: "src/admin/admin.html", status: "added", lastTurn: 1 },
    ],
    messages: [
      { role: "user", text: "复现优惠券叠加失败，并把浏览器操作过程录下来。" },
      {
        role: "assistant",
        text: "我会启动浏览器录制，产物只归属于当前 Session。",
        tool: { name: "browser", intent: "录制优惠券失败的复现过程", result: "浏览器录制已开始" },
      },
      { role: "user", text: "重点录下第二张券应用后金额回弹的过程。" },
      {
        role: "assistant",
        text: "已复现：第二张券请求成功，但前端随后用旧购物车响应覆盖了新金额。",
      },
      {
        role: "assistant",
        text: "录制已停止，message-assets 扩展会把视频作为该工具结果的会话附件，而不是写进项目目录。",
        tool: {
          name: "browser",
          intent: "保存本次浏览器复现录屏",
          result: "录屏已保存到 Session 资源",
        },
        asset: {
          scope: "session",
          path: "recordings/coupon-regression.webm",
          name: "优惠券回归录屏",
          mediaType: "video/webm",
        },
      },
      { role: "user", text: "再给我一句可直接放进缺陷单的结论。" },
      {
        role: "assistant",
        text: "并发购物车请求响应乱序，旧响应覆盖优惠券叠加后的最新金额；录屏已随消息保留。",
      },
    ],
  },
);

function addMessages(sessionId, scenarioIndex, messages) {
  const insert = db.prepare(`INSERT INTO messages
    (entry_id, session_id, parent_entry_id, type, payload, meta, is_old, source, origin, message_role, search_text, created_at)
    VALUES (?, ?, ?, 'message', ?, ?, 0, ?, ?, ?, ?, ?)`);
  let parent = null;
  messages.forEach((item, index) => {
    const timestamp = now - (messages.length - index) * 65_000 - scenarioIndex * 300_000;
    const content = item.tool
      ? [
          { type: "text", text: item.text },
          {
            type: "toolCall",
            id: `showcase-call-${scenarioIndex}-${index}`,
            name: item.tool.name,
            arguments: { intent: item.tool.intent },
          },
        ]
      : item.text;
    const rows = [{ role: item.role, content, source: item.source, origin: item.origin }];
    if (item.tool)
      rows.push({
        role: "toolResult",
        content: [{ type: "text", text: item.tool.result }],
        toolCallId: `showcase-call-${scenarioIndex}-${index}`,
        toolName: item.tool.name,
      });
    for (const [part, message] of rows.entries()) {
      const entryId = `showcase-${scenarioIndex}-${index}-${part}`;
      const payload = {
        id: entryId,
        parentId: parent,
        timestamp: new Date(timestamp + part).toISOString(),
        type: "message",
        message: { ...message, timestamp: timestamp + part },
      };
      insert.run(
        entryId,
        sessionId,
        parent,
        JSON.stringify(payload),
        JSON.stringify(part === 1 && item.asset ? { assets: [item.asset] } : {}),
        item.source ?? null,
        item.origin ?? null,
        message.role,
        item.text,
        timestamp + part,
      );
      parent = entryId;
    }
  });
  db.prepare("UPDATE sessions SET leaf_id = ? WHERE id = ?").run(parent, sessionId);
}

const seed = db.transaction(() => {
  for (const row of db.prepare("SELECT id FROM sessions WHERE meta LIKE ?").all('%"devShowcase"%'))
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
  db.prepare("DELETE FROM agents WHERE meta LIKE ?").run('%"devShowcase"%');
  const provider = db
    .prepare("SELECT id FROM providers WHERE is_enabled = 1 ORDER BY id LIMIT 1")
    .get();
  const model = provider
    ? db
        .prepare("SELECT model_id AS id FROM models WHERE provider_id = ? ORDER BY id LIMIT 1")
        .get(provider.id)
    : null;
  const agent = db
    .prepare(`INSERT INTO agents
    (name, description, icon, provider_id, backend_type, model_id, tools_preset, home_dir, is_internal, meta, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 'native', ?, 'coding', NULL, 0, ?, ?, ?)`)
    .run(
      "研发协作助手",
      "面向日常研发、发布与线上排障",
      provider?.id ?? null,
      model?.id ?? null,
      JSON.stringify({ devShowcase: marker }),
      now,
      now,
    );
  const seededSessions = [];
  scenarios.forEach((scenario, index) => {
    const checkpoints = scenario.messages
      .map((message, messageIndex) => ({ message, messageIndex }))
      .filter(({ message }) => message.role === "user")
      .map(({ messageIndex }) => ({
        id: `showcase-checkpoint-${index}-${messageIndex}`,
        entryId: `showcase-${index}-${messageIndex}-0`,
        gitRef: null,
        gitHead: null,
        label: "message",
        createdAt: now - (scenario.messages.length - messageIndex) * 65_000,
      }));
    const meta = {
      name: scenario.name,
      description: scenario.description,
      avatar: scenario.avatar,
      timers: scenario.timers,
      todos: scenario.todos,
      changedFiles: scenario.changedFiles,
      devShowcase: marker,
      checkpoints,
      ...(scenario.taskArtifact
        ? { tasks: [scenario.taskArtifact.path], currentTask: scenario.taskArtifact.path }
        : {}),
    };
    const session = db
      .prepare(`INSERT INTO sessions
      (project_id, parent_id, session_id, pid, status, thinking_level, cwd, leaf_id, agent_id, branch_type, show_in_session_list, context_leaf_id, created_at, last_active_at, meta)
      VALUES (?, NULL, NULL, NULL, 'idle', 'none', ?, NULL, ?, NULL, 1, NULL, ?, ?, ?)`)
      .run(
        project.id,
        project.cwd,
        Number(agent.lastInsertRowid),
        now - index * 300_000,
        now - index * 300_000,
        JSON.stringify(meta),
      );
    const sessionId = Number(session.lastInsertRowid);
    seededSessions.push(sessionId);
    addMessages(sessionId, index, scenario.messages);
    if (scenario.name === "eval") {
      const evalDir = resolve(
        homedir(),
        ".pi/supervisor/projects",
        String(project.id),
        "sessions",
        String(sessionId),
        "eval",
      );
      mkdirSync(evalDir, { recursive: true });
      writeFileSync(
        resolve(evalDir, "state.json"),
        JSON.stringify(
          {
            kernels: ["js", "py"],
            history: [
              {
                language: "js",
                code: "const orders = [128, 256, 96, 520]",
                output: "orders initialized",
                at: now - 180000,
              },
              {
                language: "js",
                code: "orders.reduce((a, b) => a + b, 0) / orders.length",
                output: "250",
                at: now - 120000,
              },
              {
                language: "py",
                code: "statistics.pstdev([128, 256, 96, 520])",
                output: "168.4",
                at: now - 60000,
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );
    }
    if (scenario.taskArtifact) {
      const sessionDir = resolve(
        homedir(),
        ".pi/supervisor/projects",
        String(project.id),
        "sessions",
        String(sessionId),
      );
      mkdirSync(resolve(sessionDir, "tasks"), { recursive: true });
      const artifact = scenario.taskArtifact;
      writeFileSync(
        resolve(sessionDir, artifact.path),
        `---\ntype: ${artifact.type}\ntitle: ${artifact.title}\nstatus: ${artifact.status}\nupdatedAt: ${new Date(now).toISOString()}\n---\n\n${artifact.body}\n`,
        "utf8",
      );
    }
  });

  const subagentParentIndex = scenarios.findIndex((scenario) => scenario.name === "subagent");
  const subagentParentId = seededSessions[subagentParentIndex];
  if (subagentParentId) {
    const parent = db
      .prepare("SELECT agent_id, cwd FROM sessions WHERE id = ?")
      .get(subagentParentId);
    const children = [
      {
        name: "数据库一致性审查",
        messages: [
          { role: "user", text: "检查退款与清算更新是否处于同一事务，并列出竞态风险。" },
          {
            role: "assistant",
            text: "发现退款状态和清算余额分两次提交；并发重试时可能短暂不一致。建议合并事务并增加唯一约束。",
          },
        ],
      },
      {
        name: "接口兼容性审查",
        messages: [
          { role: "user", text: "核对新旧结算接口字段、错误码和分页行为。" },
          {
            role: "assistant",
            text: "旧客户端依赖空数组而非 null，且分页游标字段不能直接移除；建议保留一版兼容映射。",
          },
        ],
      },
    ];
    const childIds = [];
    children.forEach((child, childIndex) => {
      const createdAt = now - (childIndex + 1) * 120_000;
      const row = db
        .prepare(`INSERT INTO sessions
        (project_id, parent_id, session_id, pid, status, thinking_level, cwd, leaf_id, agent_id, branch_type, created_via, show_in_session_list, context_leaf_id, created_at, last_active_at, meta)
        VALUES (?, ?, NULL, NULL, 'finish', 'none', ?, NULL, ?, 'subagent', 'spawn_agent', 1, NULL, ?, ?, ?)`)
        .run(
          project.id,
          subagentParentId,
          parent.cwd,
          parent.agent_id,
          createdAt,
          createdAt,
          JSON.stringify({ name: child.name, devShowcase: marker }),
        );
      const childId = Number(row.lastInsertRowid);
      childIds.push(childId);
      addMessages(childId, scenarios.length + 10 + childIndex, child.messages);
    });
    const spawnMessages = db
      .prepare(
        "SELECT id, payload FROM messages WHERE session_id = ? AND payload LIKE '%spawn_agent%' ORDER BY id",
      )
      .all(subagentParentId);
    spawnMessages.forEach((message, index) => {
      const childId = childIds[index];
      if (!childId) return;
      const payload = JSON.parse(message.payload);
      const toolCall = Array.isArray(payload.message?.content)
        ? payload.message.content.find(
            (part) => part.type === "toolCall" && part.name === "spawn_agent",
          )
        : null;
      if (!toolCall) return;
      toolCall.arguments = { ...toolCall.arguments, childSessionId: String(childId) };
      db.prepare("UPDATE messages SET payload = ? WHERE id = ?").run(
        JSON.stringify(payload),
        message.id,
      );
    });
  }

  const btwExamples = [
    {
      name: "为什么旧响应会覆盖新金额",
      messages: [
        { role: "user", text: "顺便问一下，这个问题为什么只在连续使用两张券时出现？" },
        {
          role: "assistant",
          text: "从当前会话的请求时序看，第二张券触发了新的购物车计算，但第一张券对应的旧请求更晚返回。前端没有校验响应版本，因此把较新的金额覆盖掉了。",
        },
        { role: "user", text: "只加 loading 能避免吗？" },
        {
          role: "assistant",
          text: "不能。loading 只能限制用户操作，无法保证网络响应顺序。更可靠的做法是给每次重算分配递增版本，只接收当前最新版本；也可以取消上一请求，但服务端仍应保持幂等。",
        },
      ],
    },
    {
      name: "录屏附件会不会进入 Git",
      messages: [
        { role: "user", text: "这个录屏会被提交进项目仓库吗？" },
        {
          role: "assistant",
          text: "不会。它作为 message-assets 的 Session 附件保存在当前会话专属目录，不写入项目 worktree，因此不会出现在 Git 变更中。",
        },
        { role: "user", text: "归档会话后还能查看吗？" },
        {
          role: "assistant",
          text: "可以。归档只会结束对话并处理代码分支，不会删除 Session 数据目录；历史消息仍然引用这份附件。",
        },
      ],
    },
  ];
  const btwParentId = seededSessions.at(-1);
  if (btwParentId) {
    const parent = db
      .prepare("SELECT leaf_id, agent_id, cwd FROM sessions WHERE id = ?")
      .get(btwParentId);
    btwExamples.forEach((example, index) => {
      const createdAt = now - (index + 1) * 180_000;
      const runtimeConfig = {
        provider: "anthropic",
        modelId: model?.id ?? "claude-sonnet-4-6",
        toolsPreset: "readonly",
        systemPrompt:
          "This is a read-only side question. Answer from inherited context and never modify the workspace.",
      };
      const child = db
        .prepare(`INSERT INTO sessions
        (project_id, parent_id, session_id, pid, status, thinking_level, cwd, leaf_id, agent_id, branch_type, show_in_session_list, context_leaf_id, created_at, last_active_at, meta)
        VALUES (?, ?, NULL, NULL, 'idle', 'none', ?, NULL, ?, 'btw', 0, ?, ?, ?, ?)`)
        .run(
          project.id,
          btwParentId,
          parent.cwd,
          parent.agent_id,
          parent.leaf_id,
          createdAt,
          createdAt,
          JSON.stringify({ name: example.name, devShowcase: marker, runtimeConfig }),
        );
      addMessages(Number(child.lastInsertRowid), scenarios.length + index, example.messages);
    });
  }
});

try {
  seed();
  console.log(`Seeded ${scenarios.length} development showcase conversations`);
} finally {
  db.close();
}
