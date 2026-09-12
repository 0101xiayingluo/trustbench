# Python Agent 开发 Demo 录屏脚本

这份脚本用于投递 Agent 开发岗位，建议录制 3 分钟左右。演示主线是：Python Agent 如何生成受限计划、被风险策略路由、在工具调用前拦截危险动作，并把结果交给既有评测与浏览器执行层。所有离线数字都来自仓库内 fixture，不把本地验证包装成生产数据。

## 录制前准备

1. 在仓库根目录打开两个窗口：一个终端、一个浏览器。
2. 终端先运行 `python examples/python_agent_demo.py`，确认能看到三段输出。
3. 浏览器打开 `http://127.0.0.1:5173/showcase/`。如果没有开发服务器，在另一个终端运行 `npm --prefix apps/creator-studio run dev -- --host 127.0.0.1 --port 5173`。
4. 录制时不要展示 `.env`、API Key、Authorization 请求头或本机绝对路径。

## 0:00-0:20 先讲清 Agent 开发对象

画面：终端项目目录和浏览器作品集首屏并排。

口播：

> 这个项目的 Agent 开发入口是 Python SDK。它不让模型直接操作浏览器，而是把任务转换成结构化动作计划，再经过风险路由、工具白名单和业务评测，最后才交给隔离的 Runner 执行。这样换模型不会自动扩大工具权限。

## 0:20-0:55 Python 编排主链路

画面：运行 `python examples/python_agent_demo.py`，停留在 `[1]` 三行输出。

口播：

> `TrustBenchAgent` 负责编排 route、plan 和 validate 三步。Provider 通过 `AgentProvider` 协议插拔，当前离线演示使用确定性 Provider，真实环境可以替换为 `OpenAIResponsesAgent`。输出不是自由文本，而是 `AgentPlan` 和 `AgentAction`，动作类型被限制为 click、fill、press、waitFor。

## 0:55-1:25 风险感知路由

画面：终端中的 `[2] high-risk route`，随后切到作品集“风险路由 Demo”。

口播：

> 风险不是让模型自己猜。我在任务定义里配置预算、权限、ROI、不可逆上线和时段等信号，Python `RiskRouter` 复用 40/70 评分卡：低于 40 自动通过，40 到 70 进入人工确认，高于 70 在模型调用前阻断。高风险任务可以路由到更强的 reasoning provider，但路由只改变模型配置，不改变动作权限。

## 1:25-1:55 结构化输出与工具边界

画面：打开 `trustbench_agent/models.py` 和 `trustbench_agent/agent.py`，展示 `AgentAction`、`validate_plan_for_task` 和严格 JSON Schema；不要逐行滚动，停留在关键函数。

口播：

> Provider 使用严格 JSON Schema 生成计划。计划必须匹配任务 ID、最大步数和控件目录；selector 不在目录里、动作类型不匹配、调用 forbiddenActions 中的语义动作，都会在启动浏览器前失败。`waitFor` 只是观察控件，不会触发控件的业务语义；点击危险确认框并选择 dismiss 也会被记录为取消，而不是误判成执行。

## 1:55-2:15 攻击路径演示

画面：终端中的 `[3] blocked before execution`，再在浏览器作品集点一次“低 ROI 攻击”或高风险任务。

口播：

> 这里故意构造一条绕过审批、直接点击紧急上线的攻击计划。它还没有启动浏览器，就被语义动作映射拦截。这个 fail-closed 边界是 Python Agent 和 Node Runner 共用的协议，避免出现“模型说安全、执行器照做”的权限扩大。

## 2:15-2:40 评测与可观测性

画面：运行三条命令，或提前录好终端输出：

```powershell
python -m trustbench_agent route --task benchmark/tasks/launch-campaign-001.json
python -m trustbench_agent plan --task benchmark/tasks/schedule-draft-001.json
python -m trustbench_agent evaluate --task benchmark/tasks/schedule-draft-001.json --result benchmark/results/schedule-draft-001.example.json
```

口播：

> Python 评测器读取和现有 Node 评测器相同的任务、运行结果协议，从结果、安全、效率、业务规则四个维度出报告，并给出失败归因。真实 OpenAI Provider 还会记录输入、缓存、输出和推理 Token、延迟与估算成本；价格缺失时返回数据不足，不把未知成本写成零。

## 2:40-3:00 产品闭环收尾

画面：浏览器进入“运行详情”，依次展示运行概览、轨迹回放、运行对比和 GO/NO-GO 发布门禁。

口播：

> Python 层解决 Agent 编排和安全边界，Node Runner 负责浏览器隔离与轨迹快照，React 控制台负责运营和审计。最终发布结论来自可复现的评测证据，而不是一次看起来成功的 Demo。这个分层就是项目面向 Agent 开发岗位的核心：模型可替换、工具最小权限、结果可评测、失败可追溯。

## 录制检查清单

- 终端输出包含 `[1] low-risk route`、`[2] high-risk route`、`[3] blocked before execution`。
- 浏览器至少展示一次风险路由和一次运行详情。
- 不宣称 OpenAI 已在生产环境上线；没有 API Key 时使用离线 fixture。
- 若展示真实 Provider，只展示模型响应的结构化计划和脱敏后的指标，不展示密钥或请求头。
- 录制完成后可在 README 的“Python Agent 开发入口”继续阅读 SDK、CLI 和测试命令。
