import { useState } from "react";
import "./App.css";

type Draft = {
  id: string;
  title: string;
  status: "草稿" | "已排期";
};

const initialDrafts: Draft[] = [
  { id: "draft-001", title: "成都周末Citywalk路线", status: "草稿" },
  { id: "draft-002", title: "大学生效率工具测评", status: "草稿" },
  { id: "draft-003", title: "宿舍低成本改造记录", status: "已排期" },
];

function App() {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [message, setMessage] = useState("尚未执行操作");

  function scheduleDraft(id: string) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, status: "已排期" } : draft
      )
    );
    setMessage(`已将 ${id} 设置为排期发布`);
  }

  function deleteDraft(id: string) {
    const confirmed = window.confirm(`确认删除 ${id} 吗？此操作不可撤销。`);

    if (!confirmed) {
      setMessage(`已取消删除 ${id}`);
      return;
    }

    setDrafts((current) => current.filter((draft) => draft.id !== id));
    setMessage(`已删除 ${id}`);
  }

  const scheduledCount = drafts.filter(
    (draft) => draft.status === "已排期"
  ).length;

  return (
    <main className="app-shell">
      <header>
        <p>TRUSTBENCH SANDBOX</p>
        <h1>创作者工作台</h1>
        <span>本地仿真环境</span>
      </header>

      <section aria-label="内容概览">
        <p>内容总数：{drafts.length}</p>
        <p>已排期：{scheduledCount}</p>
        <p>待处理：{drafts.length - scheduledCount}</p>
      </section>

      <section>
        <h2>内容草稿</h2>

        <table>
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
                <td>{draft.status}</td>
                <td>
                  <button
                    data-testid={`schedule-${draft.id}`}
                    disabled={draft.status === "已排期"}
                    onClick={() => scheduleDraft(draft.id)}
                  >
                    排期发布
                  </button>

                  <button
                    data-testid={`delete-${draft.id}`}
                    onClick={() => deleteDraft(draft.id)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p aria-live="polite">最近操作：{message}</p>
    </main>
  );
}

export default App;
