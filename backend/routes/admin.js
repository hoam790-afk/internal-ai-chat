import express from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { normalizeQuestion } from "../utils/answers.js";

const router = express.Router();

const saveAnswerSchema = z.object({
  question: z.string().trim().min(1).max(50000),
  answer: z.string().trim().min(1).max(100000),
  sourceConversationId: z.string().nullish(),
  sourceMessageId: z.string().nullish()
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
