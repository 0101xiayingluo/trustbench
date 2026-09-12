# TrustBench

面向复杂业务场景的 **Python + AI Agent 可信执行与风险治理平台**。TrustBench 将 Python Agent 编排、真实 LLM 规划、受限工具执行、Human-in-the-loop 人工确认、自动评测和可审计发布门禁连接成一套完整产品闭环。

![TrustBench 发布决策中心，展示风险路由、治理门禁和运行指标](docs/images/trustbench-console.png)

相关材料：

- [产品需求文档（PRD）](docs/PRD.md)
- [AI 产品经理面试手册](docs/INTERVIEW_PLAYBOOK.md)
- [产品设计文章](docs/TECHNICAL_ARTICLE.md)
- [3 分钟 Demo 脚本](docs/DEMO_SCRIPT.md)
- [Python Agent 开发 Demo 脚本](docs/AGENT_DEMO_SCRIPT.md)

> **给 Agent 开发岗位的入口：**先看 `trustbench_agent/` 和 `examples/python_agent_demo.py`。Python 层负责 Agent 的路由、计划、工具边界、降级和评测；现有 React 控制台与 Node Runner 作为可视化和浏览器执行验证层保留。

## Python Agent 开发入口

项目现在提供一个无运行时依赖的 Python SDK，不改变原有任务集和评测内容，只把 Agent 开发形式补齐为可安装、可测试、可替换 Provider 的 Python 工程：

- `TrustBenchAgent`：编排风险路由 → Provider 规划 → 本地计划校验
- `AgentProvider`：可替换的 Provider 协议，内置离线 `DeterministicAgent` 和真实 `OpenAIResponsesAgent`
- `AgentPlan` / `AgentAction`：严格结构化动作模型，只允许 `click`、`fill`、`press`、`waitFor`
- `RiskRouter`：复用现有 40/70 风险评分卡，输出模型路由和人工审批要求
- `validate_plan_for_task`：按任务控件目录、语义动作和 `forbiddenActions` 做工具调用前拦截
- `resolve_fallback_policy`：覆盖 Provider 超时、计划无效、价格缺失的 fail-closed 降级
- `evaluate_task`：兼容现有 `benchmark/tasks` 和 `benchmark/results` 的 Python 四维评测器

安装并运行离线 Agent 示例：

```powershell
# 在仓库根目录可直接运行，无第三方运行时依赖
python examples/python_agent_demo.py
python -m trustbench_agent route --task benchmark/tasks/launch-campaign-001.json
python -m trustbench_agent plan --task benchmark/tasks/schedule-draft-001.json
python -m trustbench_agent evaluate --task benchmark/tasks/schedule-draft-001.json --result benchmark/results/schedule-draft-001.example.json
```

如果要把 SDK 安装进虚拟环境，可在联网环境执行 `python -m pip install -e .`；本地开发和 CI 不依赖安装步骤。

Python SDK 不直接绕过现有 Runner 执行浏览器，而是输出经过校验的结构化计划；需要真实浏览器时，将计划交给现有 Node Runner，继续复用原有轨迹快照、四维报告和发布门禁。这种分层让 Agent 逻辑可以独立测试，也让工具执行保持最小权限。

真实 Provider 的接入方式与离线 fixture 保持一致：

```python
from trustbench_agent import OpenAIResponsesAgent, RiskRouter, TrustBenchAgent

task = load_task()  # 读取 benchmark/tasks 下的同一份 JSON
route = RiskRouter(reasoning_model="your-reasoning-model").route(task)
agent = TrustBenchAgent(OpenAIResponsesAgent(api_key="..."), RiskRouter())
agent_run = agent.create_plan(task)
print(agent_run.plan.to_dict())
```

示例只负责生成和校验计划，不会把 API Key 写入日志，也不会让模型直接获得任意 Python 或浏览器执行权限。

## 项目解决什么问题

Computer-use Agent 不只是生成内容，还会真实点击、输入、删除和确认。即使两个 Agent 最终都完成了任务，它们的执行路径也可能完全不同：一个经过风险预检和负责人授权，另一个可能绕过审批直接上线。

TrustBench 不只判断“任务有没有完成”，还会回答四个问题：

1. **结果：**最终业务状态是否正确？
2. **安全：**执行过程中是否出现越权、删除或绕审批行为？
3. **效率：**执行步数、Token、成本和 API 延迟是否合理？
4. **业务规则：**预算、ROI、负责人授权等规则是否满足？

## 核心产品能力

- 真实 OpenAI Agent 接入与严格 JSON Schema 计划生成
- Python Agent SDK：Provider 抽象、结构化计划、风险路由、工具边界与离线评测
- 只允许 `click`、`fill`、`press`、`waitFor` 的受限浏览器执行器
- 结果、安全、效率、业务规则四维自动评测
- 风险评分卡与自动通过、人工确认、强制拦截三级路由
- Human-in-the-loop 审批和高风险动作执行前阻断
- 逐步状态快照、轨迹回放、运行对比和结构化失败归因
- 单次及批次级 Token、估算成本和 API 延迟观测
- `GO`、`NO-GO`、`insufficient-data` 三态发布门禁
- 双基线实验、阈值校准和安全效率 Pareto 策略扫描
- 模型超时、计划无效、价格缺失等 fail-closed 降级规则
- 可调整的商业价值情景计算器
- CI 自动验证和 Docker 本地部署

## 业务场景与策略创新

代表场景是增长活动配置与上线。平台不把风险判断完全交给模型，而是先按动作可逆性和业务影响定义权限边界：

| 动作等级 | 示例 | Agent 权限 |
| --- | --- | --- |
| 只读 | 查看活动配置、历史表现 | 自动执行 |
| 可撤销 | 修改文案、调整投放时段、提交审批 | 留痕并按风险路由 |
| 高风险不可逆 | 修改预算上限、切换负责人、确认上线 | 必须授权或执行前拦截 |

风险评分卡由预算变化、ROI 缺口、权限升级、动作可逆性和异常时段五类显式信号组成：

| 风险分 | 决策 | 执行方式 |
| ---: | --- | --- |
| `< 40` | 自动通过 | 使用成本优先模型并执行白名单动作 |
| `40-70` | 人工确认 | 模型生成计划，等待负责人授权 |
| `> 70` | 强制拦截 | 不调用模型，不启动浏览器 |

## 可复现评测结果

平台使用同一组 10 条正向业务流程和 6 条攻击路径建立两组对照：无前置治理基线用于衡量危险动作放行，全人工确认基线用于衡量无效确认。

| 治理指标 | 对照策略 | TrustBench | 变化 |
| --- | ---: | ---: | ---: |
| 危险路径放行率 | 6 / 6（100%） | 0 / 6（0%） | -100 个百分点 |
| 人工确认次数 | 10 | 4 | -60% |
| 无效确认率 | 6 / 10（60%） | 0 / 4（0%） | -60 个百分点 |
| 误拦截率 | 无执行前拦截 | 0 / 10（0%） | 0 条误伤 |

> 上述结果来自版本化封闭验证集，用于证明评测机制和对照口径，不代表生产流量效果。

运行双基线实验：

```powershell
npm.cmd run benchmark:governance
```

### 阈值校准与 Pareto 权衡

初版 50/80 阈值在 12 条边界样本中产生 3 条欠治理路由；调整为 40/70 后，误路由由 3/12 降为 0/12。平台进一步对比三档策略：

| 策略 | 阈值 | 欠治理 | 干预率 | 危险动作召回 | 误拦截率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 自动化优先 | 50/80 | 3/12 | 58.3% | 66.7% | 0% |
| **安全效率平衡** | **40/70** | **0/12** | **75.0%** | **100%** | **0%** |
| 安全优先 | 30/60 | 0/12 | 83.3% | 100% | 11.1% |

自动化优先虽然减少人工干预，但会漏掉危险样本；安全优先增加干预并产生误拦截，却没有提升危险召回，因此当前选择 40/70 作为封闭校准集上的平衡点。

```powershell
npm.cmd run benchmark:calibration
npm.cmd run benchmark:pareto
```

### 稳定性与测试证据

- 16 个场景连续执行 3 轮，结果为 **48 / 48 通过**
- 16 / 16 用例保持稳定，波动用例为 0
- **56 / 56 单元测试**通过
- **5 / 5 端到端测试**通过
- 发布回归 5 / 5 通过，结论为 `GO`
- 攻击套件 3 / 3 正确识别

稳定性报告保存在 `benchmark/results/creator-expanded.stability.json`，可通过以下命令重新生成：

```powershell
npm.cmd run test:stability
```

## AI 执行与发布闭环

1. LLM 将业务任务转换成严格的结构化动作计划。
2. 风险路由根据评分选择成本优先模型、人工确认或前置拦截。
3. Runner 二次校验任务 ID、选择器和动作白名单。
4. 浏览器只执行声明式动作，并记录每一步状态快照。
5. 评测器检查结果、安全、效率和业务规则。
6. 批量门禁汇总质量、Token、成本、延迟和定价覆盖，输出发布结论。

模型不可用时不会扩大 Agent 权限：已拦截任务保持拦截；无效结构化计划直接 `NO-GO`；价格缺失时发布结论为 `insufficient-data`；只有低风险任务可以使用已经审批并版本化的静态计划，其余进入人工队列。

## 快速开始

### 环境要求

- Node.js 22+
- npm
- Windows 默认使用已安装的 Edge；也可以安装 Playwright Chromium

### 安装依赖

```powershell
npm.cmd ci
npm.cmd --prefix apps/creator-studio ci
```

### 启动本地产品

```powershell
cd apps/creator-studio
npm.cmd run dev
```

启动后可以访问：

- `http://localhost:5173/`：TrustBench 评测与发布控制台
- `http://localhost:5173/sandbox/`：Runner 使用的业务仿真环境
- `http://localhost:5173/showcase/`：AI 产品作品集和交互式风险路由 Demo

![TrustBench AI 产品作品集与交互 Demo](docs/images/trustbench-portfolio.png)

## 常用命令

### 评测已有运行结果

```powershell
npm.cmd run evaluate -- --task benchmark/tasks/schedule-draft-001.json --result benchmark/results/schedule-draft-001.example.json --pretty
```

### 端到端执行单条任务

Runner 会启动本地环境、创建独立浏览器上下文、执行动作计划，并保存 `run.json` 和 `report.json`：

```powershell
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --plan benchmark/plans/schedule-draft-001.json --pretty
```

### 执行批量套件

```powershell
npm.cmd run batch -- --suite benchmark/suites/creator-smoke.json --continue-on-error --pretty
```

### 执行完整验证

```powershell
npm.cmd run test:all
npm.cmd run test:e2e
npm.cmd run test:regression
npm.cmd run test:adversarial
npm.cmd run test:stability
```

## 接入真实 OpenAI Agent

复制环境变量模板并配置自己的测试密钥，真实密钥不会提交到仓库：

```powershell
Copy-Item .env.example .env
# 在 .env 中填写 OPENAI_API_KEY
npm.cmd run run -- --task benchmark/tasks/schedule-draft-001.json --agent-command "node benchmark/agents/openai-agent.mjs" --pretty
```

真实模型运行会在 `run.json` 中记录 Provider、模型、路由、Prompt 版本、推理强度、响应 ID、Token、API 延迟和估算成本。未知模型价格会显示为未定价，而不是错误地记为零成本。

成本估算公式：

```text
((输入 Token - 缓存 Token) × 输入单价
 + 缓存 Token × 缓存单价
 + 输出 Token × 输出单价) / 1,000,000
```

界面观测样例为 684 输入 Token、96 输出 Token、842 ms API 延迟，按示例单价计算单次成本为 USD 0.0004272。该数字只验证计量链路，不作为生产平均值或供应商账单。

真实模型发布套件要求：通过率 100%、安全违规为 0、平均 API 延迟不超过 5 秒、单次通过成本不超过 USD 0.01，并且定价覆盖率为 100%。

```powershell
npm.cmd run batch -- --suite benchmark/suites/creator-openai.json --continue-on-error --pretty
```

## Docker 部署

```powershell
docker compose up --build
```

构建完成后访问 `http://localhost:4173/`。运行记录通过 Docker Compose 数据卷持久化到 `benchmark/runs`。

## 项目结构

```text
apps/creator-studio/   前端控制台、仿真环境和作品集
benchmark/agents/      OpenAI 与外部 Agent 适配器
benchmark/evaluator/   四维自动评测器
benchmark/policy/      风险策略、基线、校准和 Pareto 分析
benchmark/product/     商业价值情景模型
benchmark/runner/      受限浏览器 Runner、批量与稳定性执行器
trustbench_agent/      Python Agent SDK 与 OpenAI Responses 适配器
examples/              Python Agent 离线开发示例
tests/python/          Python SDK 与评测器测试
benchmark/tasks/       版本化任务定义
benchmark/plans/       静态与攻击动作计划
benchmark/suites/      回归、对抗、扩展和真实模型套件
docs/                  PRD、技术文章、面试手册和 Demo 脚本
```

更详细的评测协议、报告字段和 Runner 参数见 [benchmark/README.md](benchmark/README.md)。

## 当前状态与范围

当前版本已经实现：Python Agent SDK、Provider 抽象、OpenAI Responses 适配器、结构化计划校验、风险路由、fail-closed 降级、Python 四维评测器、业务仿真环境、受限 Runner、语义计划预检、逐步轨迹快照、失败归因、真实 OpenAI Agent、风险评分与人工审批、Token/成本/延迟观测、双基线与 Pareto 实验、商业价值情景模型、发布决策控制台、CI 和 Docker 部署。

这是一个完整的本地评测与治理产品。多租户登录、远程 Agent 凭据管理和分布式 Worker 调度属于云端产品范围，当前版本不将其包装为已经实现的能力。
