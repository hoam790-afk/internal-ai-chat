import { CreditCard, Crown, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";

function formatVnd(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " VND";
}

export default function BillingPanel({ open, onClose, billingStatus, onCheckout, onConfirmPayment, onRefresh }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payment, setPayment] = useState(null);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const plans = billingStatus?.plans || [];
  const currentPlanId = billingStatus?.subscription?.planId;
  const cycleMultiplier = billingCycle === "yearly" ? 12 : 1;
  const cycleLabel = billingCycle === "yearly" ? "1 nam" : "1 thang";

  if (!open) return null;

  async function startCheckout(plan) {
    setNotice("");
    setSelectedPlan(plan);
    setPayment(null);
    if (plan.priceVnd <= 0) return;
    const result = await onCheckout(plan.id, billingCycle);
    setPayment(result.payment);
  }

  async function payNow() {
    if (!payment) return;
    setProcessing(true);
    setNotice("");
    try {
      const digits = cardNumber.replace(/\D/g, "");
      await onConfirmPayment({
        paymentId: payment.id,
        cardLast4: digits.slice(-4) || "0000"
      });
      await onRefresh?.();
      setNotice("Thanh toán thành công. Gói dịch vụ đã được kích hoạt.");
      setPayment(null);
      setSelectedPlan(null);
      setCardName("");
      setCardNumber("");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="brand-bg flex items-center justify-between px-5 py-4 text-white">
          <div>
            <h2 className="text-lg font-bold">Nâng cấp gói dịch vụ</h2>
            <p className="text-xs text-white/80">Thanh toán Visa và quản lý quyền hỏi AI nội bộ.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-white/10" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="chat-scrollbar max-h-[calc(92vh-72px)] overflow-y-auto p-5">
          {notice && <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

          <div className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-slate-500">Gói hiện tại</div>
              <div className="font-bold text-slate-950">{billingStatus?.subscription?.planName || "Cơ bản"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Câu hỏi hôm nay</div>
              <div className="font-bold text-slate-950">
                {billingStatus?.usage?.limitToday == null
                  ? `${billingStatus?.usage?.usedToday || 0} / Không giới hạn`
                  : `${billingStatus?.usage?.usedToday || 0} / ${billingStatus?.usage?.limitToday}`}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Hạn gói</div>
              <div className="font-bold text-slate-950">
                {billingStatus?.subscription?.expiresAt
                  ? new Date(billingStatus.subscription.expiresAt).toLocaleDateString("vi-VN")
                  : "Không có"}
              </div>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-100 bg-red-50 p-3">
            <div>
              <div className="text-sm font-bold text-slate-950">Chu ky thanh toan</div>
              <div className="text-xs text-slate-600">Chon 1 thang hoac 1 nam, han goi se tu dong cap nhat sau khi thanh toan Visa.</div>
            </div>
            <div className="grid grid-cols-2 rounded-md bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setBillingCycle("monthly");
                  setPayment(null);
                }}
                className={`rounded px-4 py-2 text-sm font-bold ${billingCycle === "monthly" ? "brand-bg text-white" : "text-slate-600"}`}
              >
                1 thang
              </button>
              <button
                type="button"
                onClick={() => {
                  setBillingCycle("yearly");
                  setPayment(null);
                }}
                className={`rounded px-4 py-2 text-sm font-bold ${billingCycle === "yearly" ? "brand-bg text-white" : "text-slate-600"}`}
              >
                1 nam
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const active = currentPlanId === plan.id;
              const Icon = plan.includesLawyerReview ? Crown : plan.isUnlimited ? Sparkles : ShieldCheck;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => startCheckout(plan)}
                  className={`rounded-md border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                    active ? "border-red-600 bg-red-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-100 text-red-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    {active && <span className="rounded bg-red-600 px-2 py-1 text-xs font-bold text-white">Đang dùng</span>}
                  </div>
                  <h3 className="text-lg font-bold text-slate-950">{plan.name}</h3>
                  <p className="mt-1 min-h-12 text-sm text-slate-600">{plan.description}</p>
                  <div className="mt-4 text-2xl font-black text-slate-950">
                    {plan.priceVnd ? formatVnd(Number(plan.priceVnd) * cycleMultiplier) : "Miễn phí"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">/{cycleLabel} / user</div>
                  <div className="mt-4 text-sm font-semibold text-red-700">
                    {plan.isUnlimited ? "Không giới hạn câu hỏi" : `${plan.questionLimitDaily || 5} câu/ngày`}
                  </div>
                  {plan.includesLawyerReview && (
                    <div className="mt-2 text-sm text-slate-700">Có review câu trả lời bởi luật sư qua tin nhắn.</div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedPlan?.priceVnd > 0 && payment && (
            <div className="mt-5 rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-950">
                <CreditCard className="h-5 w-5 text-red-700" />
                Thanh toán Visa
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  value={cardName}
                  onChange={(event) => setCardName(event.target.value)}
                  placeholder="Tên trên thẻ"
                  className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-red-700"
                />
                <input
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  placeholder="Số thẻ Visa"
                  className="rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-red-700"
                />
                <button
                  type="button"
                  onClick={payNow}
                  disabled={processing || cardNumber.replace(/\D/g, "").length < 4}
                  className="brand-bg brand-hover rounded-md px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {processing ? "Đang xử lý..." : `Thanh toán ${formatVnd(payment.amountVnd)}`}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Chế độ hiện tại là mô phỏng thanh toán để kiểm thử subscription. Khi có tài khoản cổng thanh toán, backend sẽ thay provider thật.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
