import { useEffect, useMemo, useState } from "react";
import "./Portfolio.css";

type Decision = "auto-approve" | "human-review" | "block";
type DemoStatus = "idle" | "running" | "complete";

const signals = [
  { id: "budget-change", label: "预算调整超过策略阈值", detail: "配置变更超出 20%", weight: 30 },
  { id: "roi-gap", label: "预期 ROI 低于历史基线", detail: "业务收益存在下行风险", weight: 25 },
  { id: "permission", label: "需要负责人权限", detail: "执行角色发生权限升级", weight: 25 },
  { id: "irreversible", label: "动作不可逆", detail: "包含正式上线或负责人切换", weight: 35 },
  { id: "off-hours", label: "非工作时段操作", detail: "命中异常操作时段", weight: 20 },
] as const;

const presets = [
  { id: "inspect", label: "只读巡检", signalIds: [] },
  { id: "launch", label: "审批上线", signalIds: ["permission", "irreversible"] },
  { id: "attack", label: "低 ROI 攻击", signalIds: ["roi-gap", "permission", "irreversible"] },
] as const;

const decisionCopy: Record<Decision, { label: string; code: string; note: string }> = {
  "auto-approve": { label: "自动通过", code: "AUTO-APPROVE", note: "成本优先模型，可执行白名单动作" },
  "human-review": { label: "人工确认", code: "HUMAN-REVIEW", note: "推理模型生成计划，等待负责人授权" },
  block: { label: "强制拦截", code: "RISK_POLICY_BLOCKED", note: "模型未调用，浏览器未启动" },
};

function decisionForScore(score: number): Decision {
  if (score < 40) return "auto-approve";
  if (score > 70) return "block";
  return "human-review";
}

function PortfolioDemo() {
  const [activeSignals, setActiveSignals] = useState<string[]>(["permission", "irreversible"]);
  const [status, setStatus] = useState<DemoStatus>("idle");
  const [completedStages, setCompletedStages] = useState(0);
  const score = Math.min(100, signals.reduce(
    (total, signal) => total + (activeSignals.includes(signal.id) ? signal.weight : 0),
    0,
  ));
  const decision = decisionForScore(score);
  const copy = decisionCopy[decision];
  const stages = useMemo(() => {
    if (decision === "block") return ["信号评分", "策略前置拦截", "模型未调用", "浏览器未启动"];
    if (decision === "human-review") return ["信号评分", "推理模型规划", "负责人确认", "白名单执行", "四维评测"];
    return ["信号评分", "成本优先模型", "白名单执行", "四维评测"];
  }, [decision]);

  useEffect(() => {
    if (status !== "running") return;
    if (completedStages >= stages.length) {
      setStatus("complete");
      return;
    }
    const timer = window.setTimeout(() => setCompletedStages((current) => current + 1), 420);
    return () => window.clearTimeout(timer);
  }, [completedStages, stages.length, status]);

  function selectPreset(signalIds: readonly string[]) {
    setActiveSignals([...signalIds]);
    setStatus("idle");
    setCompletedStages(0);
  }

  function toggleSignal(id: string) {
    setActiveSignals((current) => current.includes(id)
      ? current.filter((signalId) => signalId !== id)
      : [...current, id]);
    setStatus("idle");
    setCompletedStages(0);
  }

  function runDemo() {
    setCompletedStages(0);
    setStatus("running");
  }

  return (
    <div className="portfolio-demo" data-testid="portfolio-demo">
      <div className="demo-toolbar">
        <div>
          <span className="portfolio-kicker">INTERACTIVE POLICY LAB</span>
          <h3>风险路由 Demo</h3>
        </div>
        <div className="demo-presets" role="group" aria-label="演示场景">
          {presets.map((preset) => {
            const active = preset.signalIds.length === activeSignals.length
              && preset.signalIds.every((id) => activeSignals.includes(id));
            return (
              <button
                type="button"
                className={active ? "demo-preset demo-preset-active" : "demo-preset"}
                data-testid={`demo-preset-${preset.id}`}
                key={preset.id}
                onClick={() => selectPreset(preset.signalIds)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="demo-workspace">
        <fieldset className="demo-signals">
          <legend>风险信号</legend>
          {signals.map((signal) => (
            <label className={activeSignals.includes(signal.id) ? "demo-signal demo-signal-active" : "demo-signal"} key={signal.id}>
              <input
                type="checkbox"
                checked={activeSignals.includes(signal.id)}
                data-testid={`risk-signal-${signal.id}`}
                onChange={() => toggleSignal(signal.id)}
              />
              <span><strong>{signal.label}</strong><small>{signal.detail}</small></span>
              <b>+{signal.weight}</b>
            </label>
          ))}
        </fieldset>

        <section className={`demo-decision demo-decision-${decision}`} aria-live="polite" data-testid="demo-decision">
          <div className="demo-score-heading">
            <div><span>实时风险分</span><strong>{score}</strong><small>/ 100</small></div>
            <span className="demo-decision-label">{copy.label}</span>
          </div>
          <div className="demo-score-track" aria-hidden="true">
            <span className="demo-score-fill" style={{ width: `${score}%` }} />
            <i className="demo-threshold demo-threshold-review" />
            <i className="demo-threshold demo-threshold-block" />
          </div>
          <div className="demo-bands"><span>&lt;40 自动</span><span>40-70 人审</span><span>&gt;70 拦截</span></div>
          <div className="demo-result">
            <code>{copy.code}</code>
            <p>{copy.note}</p>
          </div>
          <button className="demo-run" type="button" data-testid="run-policy-demo" onClick={runDemo} disabled={status === "running"}>
            {status === "running" ? "评测运行中" : status === "complete" ? "重新运行评测" : "运行评测"}
          </button>
        </section>
      </div>

      <ol className="demo-pipeline" aria-label="演示执行链路">
        {stages.map((stage, index) => {
          const complete = index < completedStages;
          const active = status === "running" && index === completedStages;
          return (
            <li className={complete ? "demo-stage demo-stage-complete" : active ? "demo-stage demo-stage-active" : "demo-stage"} key={stage}>
              <span>{complete ? "OK" : String(index + 1).padStart(2, "0")}</span>
              <strong>{stage}</strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function Portfolio() {
  return (
    <main className="portfolio-page" data-testid="portfolio-page">
      <header className="portfolio-nav">
        <a className="portfolio-wordmark" href="#top"><span>TB</span><strong>TrustBench</strong></a>
        <nav aria-label="作品集导航">
          <a href="#case">产品案例</a>
          <a href="#demo">交互 Demo</a>
          <a href="/">控制台</a>
        </nav>
        <a className="portfolio-nav-cta" href="/sandbox/">进入仿真环境</a>
      </header>

      <section className="portfolio-hero" id="top">
        <div className="portfolio-hero-copy">
          <p className="portfolio-kicker">AI PRODUCT CASE STUDY · 2026</p>
          <h1>TrustBench</h1>
          <p className="portfolio-hero-lead">让 Computer-use Agent 的每一次业务决策，都可评测、可解释、可追溯。</p>
          <div className="portfolio-hero-actions">
            <a className="portfolio-primary-action" href="#demo">体验风险路由 Demo</a>
            <a className="portfolio-secondary-action" href="/">打开评测控制台</a>
          </div>
        </div>
        <dl className="portfolio-proof-rail" aria-label="项目验证数据">
          <div><dt>5</dt><dd>正向业务流程</dd></div>
          <div><dt>3</dt><dd>对抗攻击路径</dd></div>
          <div><dt>4D</dt><dd>确定性评测</dd></div>
          <div><dt>35 + 5</dt><dd>单元测试与 E2E</dd></div>
        </dl>
        <figure className="portfolio-product-shot">
          <img src="/trustbench-console.png" alt="TrustBench 发布决策控制台，展示风险路由、发布门禁和运行指标" />
          <figcaption><span>LIVE PRODUCT SURFACE</span><strong>发布决策中心</strong><a href="/">进入控制台</a></figcaption>
        </figure>
      </section>

      <section className="portfolio-case" id="case">
        <div className="portfolio-section-heading">
          <p className="portfolio-kicker">01 · PRODUCT THESIS</p>
          <h2>Agent 完成任务，不等于业务可以信任它。</h2>
        </div>
        <div className="portfolio-case-grid">
          <div className="portfolio-case-story">
            <p>同样到达“活动已上线”的最终状态，一条路径经过风险预检与负责人授权，另一条路径可能绕过审批。传统成功率看不出这个差异。</p>
            <p>TrustBench 把最终结果、执行轨迹、安全动作和业务规则放进同一评测协议，再用成本与延迟决定 Agent 是否具备发布条件。</p>
          </div>
          <dl className="portfolio-case-facts">
            <div><dt>目标用户</dt><dd>AI 产品经理、Agent 工程团队、业务风控负责人</dd></div>
            <div><dt>核心场景</dt><dd>增长活动配置、审批与上线治理</dd></div>
            <div><dt>产品角色</dt><dd>从 0 到 1 产品定义、风险策略、全栈实现与验收</dd></div>
          </dl>
        </div>
      </section>

      <section className="portfolio-system">
        <div className="portfolio-section-heading">
          <p className="portfolio-kicker">02 · SYSTEM DESIGN</p>
          <h2>把模型能力收进可治理的业务闭环。</h2>
        </div>
        <ol className="portfolio-flow">
          <li><span>01</span><strong>结构化任务</strong><p>目标状态、禁止动作、审批要求与业务阈值</p></li>
          <li><span>02</span><strong>风险评分</strong><p>预算、ROI、权限、可逆性、异常时段</p></li>
          <li><span>03</span><strong>受限执行</strong><p>真实 LLM 规划，只允许白名单浏览器动作</p></li>
          <li><span>04</span><strong>自动评测</strong><p>结果 × 安全 × 效率 × 业务规则</p></li>
          <li><span>05</span><strong>发布决策</strong><p>质量、Token、成本和延迟汇总为 GO / NO-GO</p></li>
        </ol>
      </section>

      <section className="portfolio-decisions">
        <div className="portfolio-section-heading">
          <p className="portfolio-kicker">03 · KEY PM DECISIONS</p>
          <h2>三个能在面试中讲清楚的产品判断。</h2>
        </div>
        <div className="portfolio-decision-list">
          <article><span>动作边界</span><h3>按可逆性定义 Agent 权限</h3><p>只读动作自动执行；文案与时段变更可撤销；预算上限、负责人切换和正式上线必须明确授权。</p></article>
          <article><span>路由规则</span><h3>评分卡优先于模型直觉</h3><p>分数低于 40 自动通过，40-70 进入人工确认，高于 70 在模型调用及浏览器执行前强制拦截。</p></article>
          <article><span>评测可信度</span><h3>主动攻击，而不是等待零违规</h3><p>越权删除、审批绕过和低 ROI 上线三条攻击路径，只有命中指定失败码才计为评测通过。</p></article>
        </div>
      </section>

      <section className="portfolio-demo-section" id="demo">
        <div className="portfolio-section-heading portfolio-section-heading-light">
          <p className="portfolio-kicker">04 · WORKING DEMO</p>
          <h2>改变业务信号，观察 Agent 的动作空间如何变化。</h2>
        </div>
        <PortfolioDemo />
      </section>

      <section className="portfolio-evidence">
        <div className="portfolio-section-heading">
          <p className="portfolio-kicker">05 · DELIVERY EVIDENCE</p>
          <h2>不是概念稿，是可运行、可回归的本地产品。</h2>
        </div>
        <div className="portfolio-evidence-grid">
          <div><strong>5 / 5</strong><span>正向发布回归</span><small>Release decision: GO</small></div>
          <div><strong>3 / 3</strong><span>攻击路径识别</span><small>越权、绕审批、低 ROI</small></div>
          <div><strong>35 / 35</strong><span>单元测试</span><small>含 39 / 40 / 70 / 71 边界</small></div>
          <div><strong>5 / 5</strong><span>浏览器 E2E</span><small>真实页面动作与状态采集</small></div>
        </div>
        <div className="portfolio-final-actions">
          <div><p className="portfolio-kicker">EXPLORE THE PRODUCT</p><h2>从案例叙事进入真实运行现场。</h2></div>
          <div><a className="portfolio-primary-action" href="/">打开控制台</a><a className="portfolio-secondary-action" href="/sandbox/">操作仿真环境</a></div>
        </div>
      </section>

      <footer className="portfolio-footer"><strong>TrustBench</strong><span>AI Agent Evaluation & Governance</span><a href="https://github.com/0101xiayingluo/trustbench">GitHub</a></footer>
    </main>
  );
}
