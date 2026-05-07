import express from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, DEMO_USER_ID, touchConversation } from "../db.js";
import { getRequestUser, requireAdmin, requireAuth, resolveUserId } from "../middleware/auth.js";

const router = express.Router();

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  selectedModel: z.string().trim().min(1).max(160).optional(),
  systemInstruction: z.string().max(8000).optional()
});

const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  selectedModel: z.string().trim().min(1).max(160).optional(),
  systemInstruction: z.string().max(8000).optional()
});

const settingsSchema = z.object({
  defaultModel: z.string().trim().min(1).max(160),
  defaultSystemInstruction: z.string().max(8000).optional().default(""),
  temperature: z.coerce.number().min(0).max(2)
});

router.get("/", requireAuth, (req, res) => {
  const user = getRequestUser(req);
  const userId = user?.role === "admin" ? DEMO_USER_ID : resolveUserId(req);
  const conversations = db.prepare(`
    SELECT id, title, selected_model AS selectedModel, system_instruction AS systemInstruction,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
  `).all(userId);
  res.json({ data: conversations });
});

router.post("/", requireAuth, (req, res) => {
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dữ liệu cuộc hội thoại không hợp lệ." });
  }

  const id = nanoid();
  const user = getRequestUser(req);
  const userId = user?.role === "admin" ? DEMO_USER_ID : resolveUserId(req);
  const adminSettings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(DEMO_USER_ID);
  const settings = user?.role === "admin"
    ? adminSettings
    : db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId) || adminSettings;
  db.prepare(`
    INSERT INTO conversations (id, user_id, title, selected_model, system_instruction)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    parsed.data.title || "New chat",
    user?.role === "admin" ? (parsed.data.selectedModel || settings.default_model) : adminSettings.default_model,
    user?.role === "admin" ? (parsed.data.systemInstruction ?? settings.default_system_instruction) : adminSettings.default_system_instruction
  );

  const conversation = db.prepare(`
    SELECT id, title, selected_model AS selectedModel, system_instruction AS systemInstruction,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations WHERE id = ?
  `).get(id);
  res.status(201).json({ data: conversation });
});

router.get("/settings", requireAuth, (req, res) => {
  const user = getRequestUser(req);
  const settings = db.prepare(`
    SELECT default_model AS defaultModel,
           default_system_instruction AS defaultSystemInstruction,
           temperature
    FROM settings
    WHERE user_id = ?
  `).get(DEMO_USER_ID);

  res.json({
    data: {
      ...settings,
      apiKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      apiKeyPreview: process.env.OPENROUTER_API_KEY ? "sk-or-..." : null,
      role: user?.role || "admin"
    }
  });
});

router.put("/settings", requireAdmin, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Cấu hình không hợp lệ." });
  }

  db.prepare(`
    UPDATE settings
    SET default_model = ?, default_system_instruction = ?, temperature = ?
    WHERE user_id = ?
  `).run(
    parsed.data.defaultModel,
    parsed.data.defaultSystemInstruction,
    parsed.data.temperature,
    DEMO_USER_ID
  );

  res.json({ data: parsed.data });
});

router.get("/:id/messages", requireAuth, (req, res) => {
  const user = getRequestUser(req);
  const userId = user?.role === "admin" ? DEMO_USER_ID : resolveUserId(req);
  const conversation = db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, userId);
  if (!conversation) {
    return res.status(404).json({ error: "Không tìm thấy cuộc hội thoại." });
  }

  const messages = db.prepare(`
    SELECT id, role, content, model, token_input AS tokenInput, token_output AS tokenOutput,
           created_at AS createdAt
    FROM messages
    WHERE conversation_id = ?
    ORDER BY datetime(created_at) ASC, rowid ASC
  `).all(req.params.id);
  res.json({ data: messages });
});

router.patch("/:id", requireAuth, (req, res) => {
  const parsed = updateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dữ liệu cập nhật không hợp lệ." });
  }

  const user = getRequestUser(req);
  const userId = user?.role === "admin" ? DEMO_USER_ID : resolveUserId(req);
  const existing = db.prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, userId);
  if (!existing) {
    return res.status(404).json({ error: "Không tìm thấy cuộc hội thoại." });
  }

  const updates = [];
  const values = [];
  if (parsed.data.title !== undefined) {
    updates.push("title = ?");
    values.push(parsed.data.title);
  }
  if (user?.role === "admin" && parsed.data.selectedModel !== undefined) {
    updates.push("selected_model = ?");
    values.push(parsed.data.selectedModel);
  }
  if (user?.role === "admin" && parsed.data.systemInstruction !== undefined) {
    updates.push("system_instruction = ?");
    values.push(parsed.data.systemInstruction);
  }

  if (updates.length) {
    db.prepare(`UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`).run(...values, req.params.id);
    touchConversation(req.params.id);
  }

  const conversation = db.prepare(`
    SELECT id, title, selected_model AS selectedModel, system_instruction AS systemInstruction,
           created_at AS createdAt, updated_at AS updatedAt
    FROM conversations WHERE id = ?
  `).get(req.params.id);
  res.json({ data: conversation });
});

router.delete("/:id", requireAuth, (req, res) => {
  const user = getRequestUser(req);
  const userId = user?.role === "admin" ? DEMO_USER_ID : resolveUserId(req);
  db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(req.params.id, userId);
  res.status(204).send();
});

export default router;
