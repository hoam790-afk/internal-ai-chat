import express from "express";
import { z } from "zod";
import { db } from "../db.js";
import { getRequestUser, requireAuth } from "../middleware/auth.js";
import {
  createPayment,
  ensureUserAccount,
  getBillingStatus,
  getPlan,
  markPaymentPaid
} from "../utils/billing.js";

const router = express.Router();

const checkoutSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(["monthly", "yearly"]).default("monthly")
});

const confirmSchema = z.object({
  paymentId: z.string().min(1),
  cardLast4: z.string().regex(/^\d{4}$/).optional()
});

router.use(requireAuth);

router.get("/status", (req, res) => {
  const user = getRequestUser(req);
  res.json({ data: getBillingStatus(user) });
});

router.post("/checkout", (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Gói dịch vụ không hợp lệ." });
  }

  const user = getRequestUser(req);
  ensureUserAccount(user);
  const plan = getPlan(parsed.data.planId);
  if (!plan || !plan.active) {
    return res.status(404).json({ error: "Không tìm thấy gói dịch vụ." });
  }

  if (plan.priceVnd <= 0) {
    return res.status(400).json({ error: "Gói miễn phí không cần thanh toán." });
  }

  const payment = createPayment(user.id, plan.id, parsed.data.billingCycle);
  res.status(201).json({ data: { payment, plan } });
});

router.post("/confirm", (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Thông tin thanh toán không hợp lệ." });
  }

  const user = getRequestUser(req);
  const payment = db.prepare("SELECT * FROM payments WHERE id = ? AND user_id = ?")
    .get(parsed.data.paymentId, user.id);
  if (!payment) {
    return res.status(404).json({ error: "Không tìm thấy giao dịch thanh toán." });
  }

  markPaymentPaid(payment.id, parsed.data.cardLast4 || "");
  res.json({ data: getBillingStatus(user) });
});

export default router;
