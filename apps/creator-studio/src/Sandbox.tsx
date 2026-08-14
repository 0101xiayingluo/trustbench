import { useEffect, useState } from "react";
import "./Sandbox.css";
import type {
  ActionRecord,
  ActionType,
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

export default function Sandbox() {
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [message, setMessage] = useState("尚未执行操作");

  useEffect(() => {
    window.__TRUSTBENCH_STATE__ = {
      draftStatuses: Object.fromEntries(
        drafts.map((draft) => [draft.id, draft.status])
      ),
      draftCount: drafts.length,
      actions,
    };
  }, [drafts, actions]);

  function recordAction(type: ActionType, draftId: string, riskLevel: RiskLevel) {
    setActions((current) => [
      ...current,
      {
        sequence: current.length + 1,
        type,
        draftId,
        riskLevel,
        timestamp: new Date().toISOString(),
      },
    ]);
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

      <p aria-live="polite">最近操作：{message}</p>
    </main>
  );
}
