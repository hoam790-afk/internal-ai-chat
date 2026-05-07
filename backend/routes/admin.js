import express from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { normalizeQuestion } from "../utils/answers.js";
import { setSubscription } from "../utils/billing.js";

const router = express.Router();

const saveAnswerSchema = z.object({
  question: z.string().trim().min(1).max(50000),
  answer: z.string().trim().min(1).max(100000),
  sourceConversationId: z.string().nullish(),
  sourceMessageId: z.string().nullish()
});

const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  priceVnd: z.coerce.number().int().min(0).optional(),
  billingPeriodDays: z.coerce.number().int().min(1).max(3660).optional(),
  questionLimitDaily: z.coerce.number().int().min(0).nullable().optional(),
  isUnlimited: z.boolean().optional(),
  includesLawyerReview: z.boolean().optional(),
  active: z.boolean().optional()
});

const memberPlanSchema = z.object({
  planId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(3660).optional()
});

router.use(requireAdmin);

router.get("/qa", (_req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id AS conversationId,
      c.title,
      c.selected_model AS selectedModel,
      c.updated_at AS updatedAt,
      u.email AS userEmail,
      qm.id AS questionMessageId,
      qm.content AS question,
      am.id AS answerMessageId,
      am.content AS answer,
      am.model AS answerModel,
      am.created_at AS answerCreatedAt,
      ac.id AS savedAnswerId,
      ac.updated_at AS savedAt
    FROM messages qm
    JOIN conversations c ON c.id = qm.conversation_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN messages am ON am.id = (
      SELECT id FROM messages
      WHERE conversation_id = qm.conversation_id
        AND role = 'assistant'
        AND rowid > qm.rowid
      ORDER BY rowid ASC
      LIMIT 1
    )
    LEFT JOIN answer_cache ac ON ac.source_message_id = am.id
    WHERE qm.role = 'user'
    ORDER BY datetime(qm.created_at) DESC, qm.rowid DESC
    LIMIT 200
  `).all();
  res.json({ data: rows });
});

router.get("/answers", (_req, res) => {
  const rows = db.prepare(`
    SELECT id, question, answer, source_conversation_id AS sourceConversationId,
           source_message_id AS sourceMessageId, created_by AS createdBy,
           created_at AS createdAt, updated_at AS updatedAt
    FROM answer_cache
    ORDER BY datetime(updated_at) DESC
    LIMIT 300
  `).all();
  res.json({ data: rows });
});

router.get("/plans", (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, description, price_vnd AS priceVnd,
           billing_period_days AS billingPeriodDays,
           question_limit_daily AS questionLimitDaily,
           is_unlimited AS isUnlimited,
           includes_lawyer_review AS includesLawyerReview,
           active, sort_order AS sortOrder, updated_at AS updatedAt
    FROM plans
    ORDER BY sort_order ASC, price_vnd ASC
  `).all();
  res.json({ data: rows });
});

router.patch("/plans/:id", (req, res) => {
  const parsed = planUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dữ liệu gói dịch vụ không hợp lệ." });
  }

  const current = db.prepare("SELECT * FROM plans WHERE id = ?").get(req.params.id);
  if (!current) {
    return res.status(404).json({ error: "Không tìm thấy gói dịch vụ." });
  }

  const next = {
    name: parsed.data.name ?? current.name,
    description: parsed.data.description ?? current.description,
    priceVnd: parsed.data.priceVnd ?? current.price_vnd,
    billingPeriodDays: parsed.data.billingPeriodDays ?? current.billing_period_days,
    questionLimitDaily: Object.prototype.hasOwnProperty.call(parsed.data, "questionLimitDaily")
      ? parsed.data.questionLimitDaily
      : current.question_limit_daily,
    isUnlimited: parsed.data.isUnlimited == null ? current.is_unlimited : Number(parsed.data.isUnlimited),
    includesLawyerReview: parsed.data.includesLawyerReview == null
      ? current.includes_lawyer_review
      : Number(parsed.data.includesLawyerReview),
    active: parsed.data.active == null ? current.active : Number(parsed.data.active)
  };

  db.prepare(`
    UPDATE plans
    SET name = ?, description = ?, price_vnd = ?, billing_period_days = ?,
        question_limit_daily = ?, is_unlimited = ?, includes_lawyer_review = ?,
        active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    next.name,
    next.description,
    next.priceVnd,
    next.billingPeriodDays,
    next.questionLimitDaily,
    next.isUnlimited,
    next.includesLawyerReview,
    next.active,
    req.params.id
  );

  const row = db.prepare("SELECT * FROM plans WHERE id = ?").get(req.params.id);
  res.json({ data: row });
});

router.get("/members", (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at AS createdAt,
           s.plan_id AS planId, s.status AS subscriptionStatus,
           s.started_at AS startedAt, s.expires_at AS expiresAt,
           p.name AS planName, p.price_vnd AS priceVnd,
           p.question_limit_daily AS questionLimitDaily,
           p.is_unlimited AS isUnlimited,
           COALESCE(ud.question_count, 0) AS usedToday
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN usage_daily ud ON ud.user_id = u.id AND ud.usage_date = date('now')
    WHERE u.id != 'demo-user'
    ORDER BY datetime(u.created_at) DESC
    LIMIT 500
  `).all();
  res.json({ data: rows });
});

router.patch("/members/:id/subscription", (req, res) => {
  const parsed = memberPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dữ liệu thành viên không hợp lệ." });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "Không tìm thấy thành viên." });
  }

  const subscription = setSubscription(req.params.id, parsed.data.planId, parsed.data.days);
  res.json({ data: subscription });
});

router.post("/answers", (req, res) => {
  const parsed = saveAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dữ liệu câu trả lời không hợp lệ." });
  }

  const id = nanoid();
  db.prepare(`
    INSERT INTO answer_cache (
      id, question, normalized_question, answer,
      source_conversation_id, source_message_id, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    parsed.data.question,
    normalizeQuestion(parsed.data.question),
    parsed.data.answer,
    parsed.data.sourceConversationId || null,
    parsed.data.sourceMessageId || null,
    req.user.email || req.user.id
  );

  const row = db.prepare("SELECT * FROM answer_cache WHERE id = ?").get(id);
  res.status(201).json({ data: row });
});

router.put("/answers/:id", (req, res) => {
  const parsed = saveAnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dữ liệu câu trả lời không hợp lệ." });
  }

  db.prepare(`
    UPDATE answer_cache
    SET question = ?, normalized_question = ?, answer = ?,
        source_conversation_id = ?, source_message_id = ?,
        created_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    parsed.data.question,
    normalizeQuestion(parsed.data.question),
    parsed.data.answer,
    parsed.data.sourceConversationId || null,
    parsed.data.sourceMessageId || null,
    req.user.email || req.user.id,
    req.params.id
  );

  const row = db.prepare("SELECT * FROM answer_cache WHERE id = ?").get(req.params.id);
  res.json({ data: row });
});

export default router;
