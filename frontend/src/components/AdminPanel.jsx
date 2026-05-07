import { RefreshCw, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  fetchAdminMembers,
  fetchAdminPlans,
  fetchAdminQa,
  fetchSavedAnswers,
  saveAnswer,
  updateAdminPlan,
  updateMemberSubscription
} from "../api/client.js";

export default function AdminPanel({ open }) {
  const [qaRows, setQaRows] = useState([]);
  const [savedAnswers, setSavedAnswers] = useState([]);
  const [active, setActive] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("qa");
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const [qa, saved, memberRows, planRows] = await Promise.all([
        fetchAdminQa(),
        fetchSavedAnswers(),
        fetchAdminMembers(),
        fetchAdminPlans()
      ]);
      setQaRows(qa);
      setSavedAnswers(saved);
      setMembers(memberRows);
      setPlans(planRows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    if (!active) return;
    setSaving(true);
    setNotice("");
    setSaveError("");
    try {
      await saveAnswer({
        question,
        answer,
        sourceConversationId: active.conversationId || undefined,
        sourceMessageId: active.answerMessageId || undefined
      }, active.savedAnswerId);
      setNotice("Đã lưu câu hỏi và câu trả lời vào database. Lần hỏi tương tự sau sẽ ưu tiên dùng bản mới nhất.");
      await loadData();
    } catch (error) {
      setSaveError(error.response?.data?.error || error.message || "Không lưu được vào database.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePlanChange(plan, field, value) {
    const payload = { [field]: value };
    await updateAdminPlan(plan.id, payload);
    setPlans(await fetchAdminPlans());
  }

  async function handleMemberPlan(member, planId, billingCycle = "monthly") {
    await updateMemberSubscription(member.id, { planId, billingCycle });
    setMembers(await fetchAdminMembers());
  }

  return (
    <section className="flex h-full min-h-0 flex-1 bg-slate-50">
      <aside className="chat-scrollbar w-[420px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Admin Q&A</h2>
            <p className="text-xs text-slate-500">Xem câu hỏi, sửa câu trả lời, lưu vào database.</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab("qa")}
            className={`rounded px-3 py-2 text-sm font-semibold ${tab === "qa" ? "bg-white text-red-700 shadow-sm" : "text-slate-600"}`}
          >
            Q&A
          </button>
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`rounded px-3 py-2 text-sm font-semibold ${tab === "members" ? "bg-white text-red-700 shadow-sm" : "text-slate-600"}`}
          >
            Thành viên
          </button>
        </div>

        {tab === "qa" ? <div className="space-y-2">
          {qaRows.map((row) => (
            <button
              key={`${row.questionMessageId}-${row.answerMessageId || "none"}`}
              type="button"
              onClick={() => {
                setActive(row);
                setQuestion(row.question || "");
                setAnswer(row.answer || "");
                setNotice("");
                setSaveError("");
              }}
              className={`w-full rounded-md border px-3 py-3 text-left text-sm ${
                active?.questionMessageId === row.questionMessageId ? "border-red-700 bg-red-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="line-clamp-2 font-semibold text-slate-900">{row.question}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{row.userEmail || "unknown"}</span>
                {row.savedAnswerId && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">saved</span>}
              </div>
            </button>
          ))}
        </div> : <div className="space-y-2">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              className="w-full rounded-md border border-slate-200 px-3 py-3 text-left text-sm hover:bg-slate-50"
            >
              <div className="font-semibold text-slate-900">{member.email || member.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {member.planName || "Chưa có gói"} · hôm nay {member.usedToday || 0}
                {member.isUnlimited ? " / không giới hạn" : ` / ${member.questionLimitDaily || 5}`}
              </div>
            </button>
          ))}
        </div>}
      </aside>

      <div className="chat-scrollbar min-w-0 flex-1 overflow-y-auto p-5">
        {tab === "members" ? (
          <div className="mx-auto max-w-6xl space-y-5">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-red-700" />
                <h2 className="text-lg font-bold text-slate-950">Quản lý thành viên</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2">Thành viên</th>
                      <th>Gói</th>
                      <th>Hạn</th>
                      <th>Hôm nay</th>
                      <th>Đổi gói</th>
                      <th>Chu kỳ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id} className="border-b border-slate-100">
                        <td className="py-3">
                          <div className="font-semibold text-slate-900">{member.email || member.name}</div>
                          <div className="text-xs text-slate-500">{member.id}</div>
                        </td>
                        <td>{member.planName || "Cơ bản"}</td>
                        <td>{member.expiresAt ? new Date(member.expiresAt).toLocaleDateString("vi-VN") : "Không có"}</td>
                        <td>
                          {member.usedToday || 0}
                          {member.isUnlimited ? " / không giới hạn" : ` / ${member.questionLimitDaily || 5}`}
                        </td>
                        <td>
                          <select
                            value={member.planId || "basic"}
                            onChange={(event) => handleMemberPlan(member, event.target.value, member.billingCycle || "monthly")}
                            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                          >
                            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            value={member.billingCycle || "monthly"}
                            onChange={(event) => handleMemberPlan(member, member.planId || "basic", event.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                          >
                            <option value="monthly">1 tháng</option>
                            <option value="yearly">1 năm</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-md border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-bold text-slate-950">{plan.name}</h3>
                  <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Giá VND/user</label>
                  <input
                    type="number"
                    defaultValue={plan.priceVnd}
                    onBlur={(event) => handlePlanChange(plan, "priceVnd", Number(event.target.value))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="mt-3 rounded-md bg-red-50 p-3 text-xs text-slate-700">
                    Chu kỳ gói được set theo thanh toán: 1 tháng hoặc 1 năm. Khi client thanh toán, hạn gói tự nhảy theo chu kỳ đã chọn.
                  </div>
                  <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">Giới hạn câu/ngày</label>
                  <input
                    type="number"
                    disabled={Boolean(plan.isUnlimited)}
                    defaultValue={plan.questionLimitDaily || ""}
                    onBlur={(event) => handlePlanChange(plan, "questionLimitDaily", event.target.value ? Number(event.target.value) : null)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      defaultChecked={Boolean(plan.isUnlimited)}
                      onChange={(event) => handlePlanChange(plan, "isUnlimited", event.target.checked)}
                    />
                    Không giới hạn câu hỏi
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      defaultChecked={Boolean(plan.includesLawyerReview)}
                      onChange={(event) => handlePlanChange(plan, "includesLawyerReview", event.target.checked)}
                    />
                    Có luật sư review
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : active ? (
          <div className="mx-auto max-w-4xl space-y-4">
            {notice && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
            {saveError && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>}
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">Câu hỏi</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={5}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase text-slate-500">Câu trả lời admin duyệt</span>
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={18}
                className="w-full rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100"
              />
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !question.trim() || !answer.trim()}
              className="brand-bg brand-hover inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save to database"}
            </button>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-bold text-slate-900">Câu trả lời đã lưu gần đây</h3>
              <div className="space-y-2">
                {savedAnswers.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <div className="font-semibold text-slate-800">{item.question}</div>
                    <div className="mt-1 line-clamp-2">{item.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Chọn một câu hỏi bên trái để sửa và lưu câu trả lời.
          </div>
        )}
      </div>
    </section>
  );
}
