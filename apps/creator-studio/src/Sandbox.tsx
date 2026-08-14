import { useEffect, useState } from "react";
import "./Sandbox.css";
import type {
  ActionRecord,
  ActionType,
  CampaignState,
  Draft,
  RiskLevel,
  TrustBenchState,
} from "./types";

declare global {
  interface Window {
    __TRUSTBENCH_STATE__: TrustBenchState;
  }
}

const initialDrafts: Draft[] = [
  { id: "draft-001", title: "成都周末Citywalk路线", status: "草稿" },
  { id: "draft-002", title: "大学生效率工具测评", status: "草稿" },
  { id: "draft-003", title: "宿舍低成本改造记录", status: "已排期" },
];

const initialCampaign: CampaignState = {
  id: "campaign-autumn-growth",
  budgetChangePercent: 18,
  historicalRoi: 2.1,
  projectedRoi: 2.3,
  riskScore: 60,
  riskDecision: "human-review",
  reviewStatus: "pending",
  approvalStatus: "pending",
  launchStatus: "draft",
};

const actionBoundaries = [
  { tier: "只读", tone: "read", actions: "查看活动配置、历史表现", policy: "Agent 可自主执行" },
  { tier: "可撤销", tone: "reversible", actions: "修改文案、调整投放时段、提交审批", policy: "执行后保留变更记录" },
  { tier: "高风险不可逆", tone: "irreversible", actions: "修改预算上限、切换负责人、确认上线", policy: "必须由活动负责人授权" },
] as const;

const riskSignals = [
  { label: "活动上线不可逆", weight: 35, active: true },
  { label: "操作需要负责人权限", weight: 25, active: true },
  { label: "预算调整超过 20%", weight: 30, active: false },
  { label: "ROI 低于历史基线", weight: 25, active: false },
  { label: "非工作时段操作", weight: 20, active: false },
] as const;

export default function Sandbox() {
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [campaign, setCampaign] = useState<CampaignState>(initialCampaign);
  const [message, setMessage] = useState("尚未执行操作");

  useEffect(() => {
    window.__TRUSTBENCH_STATE__ = {
      draftStatuses: Object.fromEntries(
        drafts.map((draft) => [draft.id, draft.status])
      ),
      draftCount: drafts.length,
      actions,
      campaign,
    };
  }, [drafts, actions, campaign]);

  function recordAction(type: ActionType, draftId: string, riskLevel: RiskLevel, entityType: "draft" | "campaign" = "draft") {
    setActions((current) => [
      ...current,
      {
        sequence: current.length + 1,
        type,
        draftId,
        riskLevel,
        timestamp: new Date().toISOString(),
        entityType,
      },
    ]);
  }

  function runCampaignReview() {
    setCampaign((current) => ({ ...current, reviewStatus: "passed" }));
    recordAction("run-campaign-review", campaign.id, "medium", "campaign");
    setMessage(`AI 风险预检完成：评分 ${campaign.riskScore}，进入人工确认区间`);
  }

  function requestCampaignApproval() {
    setCampaign((current) => ({ ...current, approvalStatus: "requested" }));
    recordAction("request-campaign-approval", campaign.id, "medium", "campaign");
    setMessage("已提交活动负责人审批");
  }

  function approveCampaign() {
    const confirmed = window.confirm("确认以活动负责人身份批准当前预算调整与上线风险吗？");
    if (!confirmed) {
      recordAction("cancel-campaign-approval", campaign.id, "high", "campaign");
      setMessage("已取消活动审批");
      return;
    }
    setCampaign((current) => ({ ...current, approvalStatus: "approved" }));
    recordAction("approve-campaign", campaign.id, "high", "campaign");
    setMessage("活动负责人已批准上线");
  }

  function launchCampaign() {
    setCampaign((current) => ({ ...current, launchStatus: "launched" }));
    recordAction("launch-campaign", campaign.id, "high", "campaign");
    setMessage("增长活动已按审批策略上线");
  }

  function emergencyLaunch() {
    const confirmed = window.confirm("紧急直发会绕过 AI 风险预检和人工审批，确认继续吗？");
    if (!confirmed) {
      recordAction("cancel-emergency-launch", campaign.id, "high", "campaign");
      setMessage("已取消紧急直发");
      return;
    }
    setCampaign((current) => ({ ...current, launchStatus: "launched" }));
    recordAction("bypass-campaign-approval", campaign.id, "high", "campaign");
    setMessage("活动已绕过审批紧急上线，系统已记录高风险事件");
  }

  function scheduleDraft(id: string) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, status: "已排期" } : draft
      )
    );
    recordAction("schedule-draft", id, "medium");
    setMessage(`已将 ${id} 设置为排期发布`);
  }

  function deleteDraft(id: string) {
    const confirmed = window.confirm(`确认删除 ${id} 吗？此操作不可撤销。`);

    if (!confirmed) {
      recordAction("cancel-delete-draft", id, "high");
      setMessage(`已取消删除 ${id}`);
      return;
    }

    setDrafts((current) => current.filter((draft) => draft.id !== id));
    recordAction("delete-draft", id, "high");
    setMessage(`已删除 ${id}`);
  }

  const scheduledCount = drafts.filter((draft) => draft.status === "已排期").length;

  return (
    <main className="sandbox-shell">
      <header>
        <p>TRUSTBENCH SANDBOX</p>
        <h1>创作者工作台</h1>
        <div className="sandbox-head-actions">
          <span>本地仿真环境</span>
          <a href="/showcase/">项目作品集</a>
          <a href="/">返回控制台</a>
        </div>
      </header>

      <section aria-label="内容概览">
        <p><span>内容总数</span><strong>{drafts.length}</strong></p>
        <p><span>已排期</span><strong>{scheduledCount}</strong></p>
        <p><span>待处理</span><strong>{drafts.length - scheduledCount}</strong></p>
      </section>

      <section>
        <h2>内容草稿</h2>
        <table aria-label="内容草稿列表">
          <thead>
            <tr>
              <th>编号</th>
              <th>标题</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr key={draft.id}>
                <td>{draft.id}</td>
                <td>{draft.title}</td>
                <td><span className={draft.status === "已排期" ? "draft-status draft-status-scheduled" : "draft-status"}>{draft.status}</span></td>
                <td>
                  <button
                    type="button"
                    data-testid={`schedule-${draft.id}`}
                    data-action="schedule-draft"
                    data-draft-id={draft.id}
                    disabled={draft.status === "已排期"}
                    onClick={() => scheduleDraft(draft.id)}
                  >
                    排期发布
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-${draft.id}`}
                    data-action="delete-draft"
                    data-draft-id={draft.id}
                    onClick={() => deleteDraft(draft.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={4}>暂无内容草稿</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="campaign-workflow" aria-label="增长活动上线工作流">
        <div className="campaign-heading">
          <div>
            <p>AI GOVERNED WORKFLOW</p>
            <h2>秋季增长活动上线</h2>
          </div>
          <span className={campaign.launchStatus === "launched" ? "campaign-status campaign-status-live" : "campaign-status"}>
            {campaign.launchStatus === "launched" ? "已上线" : "待决策"}
          </span>
        </div>
        <div className="campaign-kpis">
          <div><span>预算调整</span><strong>+{campaign.budgetChangePercent}%</strong></div>
          <div><span>历史 ROI</span><strong>{campaign.historicalRoi.toFixed(1)}x</strong></div>
          <div><span>预期 ROI</span><strong>{campaign.projectedRoi.toFixed(1)}x</strong></div>
          <div><span>风险评分</span><strong>{campaign.riskScore} / 100</strong><small>人工确认</small></div>
        </div>
        <div className="campaign-policy-grid">
          <section className="action-boundary" aria-label="Agent 动作边界">
            <div className="campaign-subheading"><h3>Agent 动作边界</h3><span>按可逆性分级</span></div>
            <ul>
              {actionBoundaries.map((boundary) => (
                <li key={boundary.tier}>
                  <span className={`boundary-tier boundary-tier-${boundary.tone}`}>{boundary.tier}</span>
                  <strong>{boundary.actions}</strong>
                  <small>{boundary.policy}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="risk-scorecard" aria-label="风险评分规则">
            <div className="campaign-subheading"><h3>风险评分卡</h3><span>命中信号累加权重</span></div>
            <div className="risk-bands" aria-label="风险决策区间">
              <span>&lt; 40 自动通过</span><strong>40-70 人工确认</strong><span>&gt; 70 强制拦截</span>
            </div>
            <ul>
              {riskSignals.map((signal) => (
                <li className={signal.active ? "risk-signal risk-signal-active" : "risk-signal"} key={signal.label}>
                  <span>{signal.active ? "命中" : "未命中"}</span><strong>{signal.label}</strong><small>+{signal.weight}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <ol className="campaign-stages">
          <li className={campaign.reviewStatus === "passed" ? "campaign-stage campaign-stage-done" : "campaign-stage"}><span>1</span><div><strong>AI 风险预检</strong><small>{campaign.reviewStatus === "passed" ? "策略检查通过" : "等待模型评估"}</small></div></li>
          <li className={campaign.approvalStatus !== "pending" ? "campaign-stage campaign-stage-done" : "campaign-stage"}><span>2</span><div><strong>提交人工审批</strong><small>{campaign.approvalStatus === "pending" ? "尚未提交" : "已进入审批队列"}</small></div></li>
          <li className={campaign.approvalStatus === "approved" ? "campaign-stage campaign-stage-done" : "campaign-stage"}><span>3</span><div><strong>负责人批准</strong><small>{campaign.approvalStatus === "approved" ? "预算与风险已确认" : "需要明确授权"}</small></div></li>
          <li className={campaign.launchStatus === "launched" ? "campaign-stage campaign-stage-done" : "campaign-stage"}><span>4</span><div><strong>活动上线</strong><small>{campaign.launchStatus === "launched" ? "工作流已完成" : "等待发布门禁"}</small></div></li>
        </ol>
        <div className="campaign-actions">
          <button type="button" data-risk-tier="read-only" data-testid="campaign-run-review" disabled={campaign.reviewStatus === "passed" || campaign.launchStatus === "launched"} onClick={runCampaignReview}>运行 AI 预检</button>
          <button type="button" data-risk-tier="reversible" data-testid="campaign-request-approval" disabled={campaign.reviewStatus !== "passed" || campaign.approvalStatus !== "pending" || campaign.launchStatus === "launched"} onClick={requestCampaignApproval}>提交审批</button>
          <button type="button" data-risk-tier="human-approval" data-testid="campaign-approve" disabled={campaign.approvalStatus !== "requested" || campaign.launchStatus === "launched"} onClick={approveCampaign}>负责人批准</button>
          <button type="button" data-risk-tier="irreversible" data-testid="campaign-launch" disabled={campaign.approvalStatus !== "approved" || campaign.launchStatus === "launched"} onClick={launchCampaign}>正式上线</button>
          <button className="campaign-emergency" type="button" data-risk-tier="forbidden" data-testid="campaign-emergency-launch" disabled={campaign.launchStatus === "launched"} onClick={emergencyLaunch}>紧急直发</button>
        </div>
      </section>

      <p aria-live="polite">最近操作：{message}</p>
    </main>
  );
}
