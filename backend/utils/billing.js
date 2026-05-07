import { nanoid } from "nanoid";
import { db } from "../db.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 30));
  return date.toISOString();
}

export function ensureUserAccount(user) {
  if (!user?.id) return null;

  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email)
    VALUES (?, ?, ?)
  `).run(user.id, user.name || user.email || "Client", user.email || null);

  const subscription = db.prepare("SELECT id FROM subscriptions WHERE user_id = ?").get(user.id);
  if (!subscription && user.role !== "admin") {
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at)
      VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, ?)
    `).run(nanoid(), user.id, "basic", addDays(3650));
  }

  return user.id;
}

export function listPlans() {
  return db.prepare(`
    SELECT id, name, description, price_vnd AS priceVnd,
           billing_period_days AS billingPeriodDays,
           question_limit_daily AS questionLimitDaily,
           is_unlimited AS isUnlimited,
           includes_lawyer_review AS includesLawyerReview,
           active, sort_order AS sortOrder, updated_at AS updatedAt
    FROM plans
    WHERE active = 1
    ORDER BY sort_order ASC, price_vnd ASC
  `).all();
}

export function getPlan(planId) {
  return db.prepare(`
    SELECT id, name, description, price_vnd AS priceVnd,
           billing_period_days AS billingPeriodDays,
           question_limit_daily AS questionLimitDaily,
           is_unlimited AS isUnlimited,
           includes_lawyer_review AS includesLawyerReview,
           active, sort_order AS sortOrder, updated_at AS updatedAt
    FROM plans
    WHERE id = ?
  `).get(planId);
}

export function getUsage(userId, date = todayKey()) {
  return db.prepare(`
    SELECT question_count AS questionCount
    FROM usage_daily
    WHERE user_id = ? AND usage_date = ?
  `).get(userId, date)?.questionCount || 0;
}

export function incrementUsage(userId, date = todayKey()) {
  db.prepare(`
    INSERT INTO usage_daily (id, user_id, usage_date, question_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, usage_date)
    DO UPDATE SET question_count = question_count + 1
  `).run(nanoid(), userId, date);
}

export function getSubscription(userId) {
  const row = db.prepare(`
    SELECT s.id, s.user_id AS userId, s.plan_id AS planId, s.status,
           s.started_at AS startedAt, s.expires_at AS expiresAt,
           p.name AS planName, p.price_vnd AS priceVnd,
           p.billing_period_days AS billingPeriodDays,
           p.question_limit_daily AS questionLimitDaily,
           p.is_unlimited AS isUnlimited,
           p.includes_lawyer_review AS includesLawyerReview
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ?
  `).get(userId);

  if (!row) return null;

  const expired = row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
  if (expired && row.status === "active") {
    db.prepare("UPDATE subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
    row.status = "expired";
  }
  return row;
}

export function getBillingStatus(user) {
  ensureUserAccount(user);
  const subscription = getSubscription(user.id);
  const usedToday = getUsage(user.id);
  const limit = subscription?.isUnlimited ? null : Number(subscription?.questionLimitDaily ?? 5);
  const remainingToday = limit == null ? null : Math.max(limit - usedToday, 0);

  return {
    subscription,
    usage: {
      usedToday,
      limitToday: limit,
      remainingToday
    },
    plans: listPlans()
  };
}

export function assertCanAsk(user) {
  if (user?.role === "admin") return { allowed: true };
  const status = getBillingStatus(user);
  const subscription = status.subscription;
  const active = subscription?.status === "active";

  if (!active) {
    return {
      allowed: false,
      reason: "subscription_expired",
      message: "Gói dịch vụ đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.",
      billing: status
    };
  }

  if (!subscription?.isUnlimited && status.usage.remainingToday <= 0) {
    return {
      allowed: false,
      reason: "daily_limit_reached",
      message: `Bạn đã dùng hết ${status.usage.limitToday} câu hỏi miễn phí hôm nay. Nâng cấp Pro hoặc VIP để hỏi không giới hạn.`,
      billing: status
    };
  }

  return { allowed: true, billing: status };
}

export function setSubscription(userId, planId, days) {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Plan not found");
  const expiresAt = addDays(days || plan.billingPeriodDays);
  const existing = getSubscription(userId);

  if (existing) {
    db.prepare(`
      UPDATE subscriptions
      SET plan_id = ?, status = 'active', started_at = CURRENT_TIMESTAMP,
          expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(planId, expiresAt, userId);
  } else {
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at)
      VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, ?)
    `).run(nanoid(), userId, planId, expiresAt);
  }

  return getSubscription(userId);
}

export function createPayment(userId, planId) {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Plan not found");
  const paymentId = nanoid();
  db.prepare(`
    INSERT INTO payments (id, user_id, plan_id, amount_vnd, provider, status, checkout_url)
    VALUES (?, ?, ?, ?, 'visa_demo', 'pending', ?)
  `).run(paymentId, userId, planId, plan.priceVnd, `/billing/checkout/${paymentId}`);

  return db.prepare(`
    SELECT id, user_id AS userId, plan_id AS planId, amount_vnd AS amountVnd,
           currency, provider, status, checkout_url AS checkoutUrl, created_at AS createdAt
    FROM payments WHERE id = ?
  `).get(paymentId);
}

export function markPaymentPaid(paymentId, cardLast4 = "") {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  if (!payment) throw new Error("Payment not found");
  db.prepare(`
    UPDATE payments
    SET status = 'paid', card_last4 = ?, paid_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(cardLast4 || null, paymentId);
  setSubscription(payment.user_id, payment.plan_id);
  return payment;
}
