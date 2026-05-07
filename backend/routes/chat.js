import express from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createMessage, db, DEMO_USER_ID } from "../db.js";
import { getRequestUser, requireAuth, resolveUserId } from "../middleware/auth.js";
import { chatRateLimit } from "../middleware/rateLimit.js";
import { findSavedAnswer } from "../utils/answers.js";
import { assertCanAsk, incrementUsage } from "../utils/billing.js";

const router = express.Router();

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(50000),
  displayContent: z.string().max(50000).optional(),
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    kind: z.enum(["image", "document", "spreadsheet", "unsupported"]),
    text: z.string().optional().default(""),
    dataUrl: z.string().optional(),
    warning: z.string().optional()
  })).max(8).optional().default([])
});

const chatSchema = z.object({
  conversationId: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
  model: z.string().min(1).max(160),
  systemInstruction: z.string().max(8000).optional().default(""),
  messages: z.array(messageSchema).min(1).max(80),
  temperature: z.coerce.number().min(0).max(2).default(0.2),
  stream: z.boolean().optional().default(false)
});

const maxCompletionTokens = Math.max(Number(process.env.MAX_COMPLETION_TOKENS || 8000), 8000);
const shipmentExtractionModel = process.env.SHIPMENT_EXTRACTION_MODEL || "openrouter/auto";
const openRouterTimeoutMs = Math.max(Number(process.env.OPENROUTER_TIMEOUT_MS || 60000), 60000);
const maxContinuationRounds = Math.min(Math.max(Number(process.env.MAX_CONTINUATION_ROUNDS || 2), 1), 2);
const fallbackModels = (process.env.FALLBACK_MODELS ||
  "google/gemma-4-26b-a4b-it:free,openrouter/free,inclusionai/ling-2.6-1t:free,liquid/lfm-2.5-1.2b-instruct:free")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function getApiHeaders() {
  if (!process.env.OPENROUTER_API_KEY) {
    const error = new Error("OPENROUTER_API_KEY is not configured");
    error.status = 500;
    throw error;
  }

  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
    ...(process.env.OPENROUTER_APP_TITLE ? { "X-Title": process.env.OPENROUTER_APP_TITLE } : {})
  };
}

function ensureConversation({ conversationId, model, systemInstruction, firstUserMessage, userId }) {
  if (conversationId) {
    const existing = db.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
      .get(conversationId, userId);
    if (existing) {
      db.prepare(`
        UPDATE conversations
        SET selected_model = ?, system_instruction = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(model, systemInstruction, conversationId);
      return conversationId;
    }
  }

  const id = nanoid();
  const title = firstUserMessage.slice(0, 70).replace(/\s+/g, " ").trim() || "New chat";
  db.prepare(`
    INSERT INTO conversations (id, user_id, title, selected_model, system_instruction)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, title, model, systemInstruction);
  return id;
}

function formatAttachmentText(attachments = []) {
  const textAttachments = attachments
    .filter((attachment) => attachment.text)
    .map((attachment) => [
      `Tên file: ${attachment.name}`,
      `Loại: ${attachment.kind}`,
      "Nội dung trích xuất:",
      attachment.text
    ].join("\n"));

  if (!textAttachments.length) return "";
  return `\n\n---\nNỘI DUNG FILE ĐÍNH KÈM\n${textAttachments.join("\n\n---\n")}`;
}

function formatAttachmentList(attachments = []) {
  if (!attachments.length) return "";
  return `\n\nFile đính kèm:\n${attachments.map((attachment) => `- ${attachment.name}`).join("\n")}`;
}

function formatShipmentExtraction(shipmentInfo) {
  if (!shipmentInfo) return "";
  return [
    "\n\n---",
    "THONG TIN LO HANG DA DUOC AI DOC TU FILE/HINH ANH",
    shipmentInfo,
    "---",
    "Khi tu van, hay uu tien thong tin lo hang da trich xuat o tren. Neu con thieu du lieu de xac dinh HS code chinh xac, hay neu ro can bo sung thong tin nao."
  ].join("\n");
}

function toOpenRouterMessage(message) {
  const attachmentText = formatAttachmentText(message.attachments);
  const imageAttachments = (message.attachments || []).filter((attachment) =>
    attachment.kind === "image" && attachment.dataUrl && !attachment.text
  );
  const text = `${message.content}${attachmentText}`;

  if (message.role === "user" && imageAttachments.length) {
    return {
      role: message.role,
      content: [
        { type: "text", text },
        ...imageAttachments.map((attachment) => ({
          type: "image_url",
          image_url: { url: attachment.dataUrl }
        }))
      ]
    };
  }

  return { role: message.role, content: text };
}

async function callOpenRouter(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openRouterTimeoutMs);
  let response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`OpenRouter model ${body.model} timed out after ${openRouterTimeoutMs}ms`);
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `OpenRouter returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response;
}

async function callOpenRouterWithFallback(body) {
  const candidates = [body.model, ...fallbackModels].filter((model, index, items) => model && items.indexOf(model) === index);
  let lastError;

  for (const candidate of candidates) {
    try {
      const response = await callOpenRouter({ ...body, model: candidate });
      response.usedModel = candidate;
      return response;
    } catch (error) {
      lastError = error;
      if (![408, 409, 429, 500, 502, 503, 504].includes(Number(error.status))) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function callOpenRouterWithCandidates(body, candidates) {
  const uniqueCandidates = candidates.filter((model, index, items) => model && items.indexOf(model) === index);
  let lastError;

  for (const candidate of uniqueCandidates) {
    try {
      const response = await callOpenRouter({ ...body, model: candidate });
      response.usedModel = candidate;
      return response;
    } catch (error) {
      lastError = error;
      if (![400, 408, 409, 429, 500, 502, 503, 504].includes(Number(error.status))) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function extractShipmentInfo({ attachments = [], userQuestion, model }) {
  const usefulAttachments = attachments.filter((attachment) =>
    attachment.text || (attachment.kind === "image" && attachment.dataUrl)
  );
  if (!usefulAttachments.length) return "";

  const content = [
    {
      type: "text",
      text: [
        "Ban la AI chuyen doc chung tu, anh chup lo hang, invoice, packing list, tem nhan va mo ta hang hoa xuat nhap khau.",
        "Hay trich xuat thong tin lo hang tu file/hinh anh de AI tu van HS code o buoc sau.",
        "Chi dua thong tin co trong file/hinh anh hoac suy luan rat can trong tu noi dung nhin thay. Khong tu bia them.",
        "",
        "Tra ve bang tieng Viet theo cau truc ngan gon:",
        "1. Ten hang/ten thuong mai:",
        "2. Mo ta hang hoa:",
        "3. Chat lieu/thanh phan:",
        "4. Cong dung:",
        "5. Thong so/size/dung tich/model/brand:",
        "6. So luong/trong luong/gia tri/xuat xu neu co:",
        "7. Thong tin tren invoice/packing/nhan hang neu co:",
        "8. Dau hieu lien quan HS code/phan loai:",
        "9. Thong tin con thieu can hoi them:",
        "",
        `Cau hoi cua nguoi dung: ${userQuestion || "Phan tich file dinh kem."}`,
        "",
        "Noi dung OCR/text da doc duoc tu file:"
      ].join("\n")
    }
  ];

  usefulAttachments.forEach((attachment) => {
    const text = attachment.text?.trim()
      ? attachment.text.trim()
      : "[Chua co OCR text, can doc truc tiep tu hinh anh.]";
    content.push({
      type: "text",
      text: `\n---\nFile: ${attachment.name}\nLoai: ${attachment.kind}\n${text}`
    });
    if (attachment.kind === "image" && attachment.dataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: attachment.dataUrl }
      });
    }
  });

  const response = await callOpenRouterWithCandidates({
    model: shipmentExtractionModel,
    messages: [{ role: "user", content }],
    temperature: 0,
    max_tokens: 1200
  }, [shipmentExtractionModel, "openrouter/auto", model, ...fallbackModels]);

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content?.trim() || "";
}

function isTruncatedFinishReason(reason) {
  return ["length", "max_tokens", "token_limit"].includes(String(reason || "").toLowerCase());
}

function looksIncompleteAnswer(content = "") {
  const text = content.trim();
  if (!text) return true;

  const tail = text.slice(-500).toLowerCase();
  const hasClosingSignal = [
    "kết luận",
    "ket luan",
    "tóm lại",
    "tom lai",
    "trên đây",
    "tren day",
    "vui lòng",
    "vui long"
  ].some((marker) => tail.includes(marker));
  const endsCleanly = /[.!?。)”"'`*]$/.test(text);
  const danglingListOrSentence = /(\n\s*[-*]\s*|\n\s*\d+\.\s*|[:;,]|\b(và|hoặc|gồm|như|theo|với|của|cho|là|and|or)\s*)$/i.test(text);

  return !endsCleanly || danglingListOrSentence || (text.length > 2500 && !hasClosingSignal);
}

function mergeUsage(total = {}, next = {}) {
  return {
    prompt_tokens: (total.prompt_tokens || 0) + (next.prompt_tokens || 0),
    completion_tokens: (total.completion_tokens || 0) + (next.completion_tokens || 0),
    total_tokens: (total.total_tokens || 0) + (next.total_tokens || 0)
  };
}

async function completeChatWithContinuation(requestBody) {
  const response = await callOpenRouterWithFallback(requestBody);
  const payload = await response.json();
  const firstChoice = payload.choices?.[0] || {};
  let assistantContent = firstChoice.message?.content || "";
  let finishReason = firstChoice.finish_reason;
  let usage = payload.usage || null;
  let usedModel = payload.model || response.usedModel || requestBody.model;

  for (
    let round = 0;
    round < maxContinuationRounds && (isTruncatedFinishReason(finishReason) || looksIncompleteAnswer(assistantContent));
    round += 1
  ) {
    const continuationMessages = [
      ...requestBody.messages,
      { role: "assistant", content: assistantContent },
      {
        role: "user",
        content: [
          "Cau tra loi vua roi chua hoan tat hoac bi cat ngang.",
          "Hay viet tiep tu dung noi dung dang dang do, khong lap lai phan da tra loi.",
          "Chi bo sung cac muc con thieu theo system instruction/prompts, khong mo rong them ngoai yeu cau.",
          "Neu noi dung da du thi chi viet mot ket luan ngan gon va dung lai."
        ].join("\n")
      }
    ];

    const continuationResponse = await callOpenRouterWithFallback({
      ...requestBody,
      messages: continuationMessages,
      max_tokens: maxCompletionTokens
    });
    const continuationPayload = await continuationResponse.json();
    const continuationChoice = continuationPayload.choices?.[0] || {};
    const continuationContent = continuationChoice.message?.content || "";

    if (!continuationContent.trim()) break;
    assistantContent = `${assistantContent.trim()}\n\n${continuationContent.trim()}`;
    finishReason = continuationChoice.finish_reason;
    usedModel = continuationPayload.model || continuationResponse.usedModel || usedModel;
    usage = usage || continuationPayload.usage
      ? mergeUsage(usage || {}, continuationPayload.usage || {})
      : null;
  }

  return { assistantContent, finishReason, usage, model: usedModel };
}

router.post("/", requireAuth, chatRateLimit, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Nội dung chat không hợp lệ." });
  }

  const requestUser = getRequestUser(req);
  const userId = requestUser?.role === "admin" ? DEMO_USER_ID : resolveUserId(req);
  const adminSettings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(DEMO_USER_ID);
  const model = requestUser?.role === "admin" ? parsed.data.model : adminSettings.default_model;
  const systemInstruction = requestUser?.role === "admin"
    ? parsed.data.systemInstruction
    : adminSettings.default_system_instruction;
  const temperature = requestUser?.role === "admin" ? parsed.data.temperature : adminSettings.temperature;
  const { messages, stream } = parsed.data;
  const userMessages = messages.filter((message) => message.role === "user");
  const latestUser = userMessages.at(-1);

  if (!latestUser) {
    return res.status(400).json({ error: "Cần ít nhất một tin nhắn user." });
  }

  const quota = assertCanAsk(requestUser);
  if (!quota.allowed) {
    return res.status(402).json({
      error: quota.message,
      code: quota.reason,
      billing: quota.billing
    });
  }

  let conversationId;
  try {
    conversationId = ensureConversation({
      conversationId: parsed.data.conversationId,
      model,
      systemInstruction,
      firstUserMessage: latestUser.content,
      userId
    });

    createMessage({
      conversationId,
      role: "user",
      content: latestUser.displayContent || `${latestUser.content}${formatAttachmentList(latestUser.attachments)}`,
      model
    });

    const savedAnswer = latestUser.attachments?.length ? null : findSavedAnswer(db, latestUser.content);
    if (savedAnswer) {
      const messageId = createMessage({
        conversationId,
        role: "assistant",
        content: savedAnswer.answer,
        model: "saved-answer"
      });
      if (requestUser?.role !== "admin") incrementUsage(userId);

      if (stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        });
        res.write(`event: meta\ndata: ${JSON.stringify({ conversationId, source: "saved-answer", matchScore: savedAnswer.matchScore })}\n\n`);
        const chunks = savedAnswer.answer.match(/.{1,80}(\s|$)/gs) || [savedAnswer.answer];
        for (const chunk of chunks) {
          res.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
        }
        res.write(`event: done\ndata: ${JSON.stringify({ conversationId, messageId, source: "saved-answer" })}\n\n`);
        return res.end();
      }

      return res.json({
        data: {
          conversationId,
          messageId,
          role: "assistant",
          content: savedAnswer.answer,
          usage: null,
          model: "saved-answer",
          source: "saved-answer",
          matchScore: savedAnswer.matchScore
        }
      });
    }

    let shipmentInfo = "";
    if (latestUser.attachments?.length) {
      try {
        shipmentInfo = await extractShipmentInfo({
          attachments: latestUser.attachments,
          userQuestion: latestUser.content,
          model
        });
      } catch {
        shipmentInfo = formatAttachmentText(latestUser.attachments);
      }
    }

    const openRouterMessages = [
      ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
      ...(shipmentInfo ? [{ role: "system", content: formatShipmentExtraction(shipmentInfo) }] : []),
      ...messages.map(toOpenRouterMessage)
    ];

    if (stream) {
      const requestBody = {
        model,
        messages: openRouterMessages,
        temperature,
        max_tokens: maxCompletionTokens
      };
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      res.write(`event: meta\ndata: ${JSON.stringify({ conversationId })}\n\n`);

      const completed = await completeChatWithContinuation(requestBody);
      let assistantContent = completed.assistantContent || "";
      if (!assistantContent.trim()) {
        assistantContent = "OpenRouter da phan hoi nhung khong tra noi dung. Vui long gui lai cau hoi hoac doi model mac dinh trong trang admin.";
      }

      const chunks = assistantContent.match(/[\s\S]{1,120}/g) || [assistantContent];
      for (const chunk of chunks) {
        res.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      const messageId = createMessage({
        conversationId,
        role: "assistant",
        content: assistantContent,
        model: completed.model || model,
        tokenInput: completed.usage?.prompt_tokens,
        tokenOutput: completed.usage?.completion_tokens
      });
      if (requestUser?.role !== "admin") incrementUsage(userId);
      res.write(`event: done\ndata: ${JSON.stringify({ conversationId, messageId })}\n\n`);
      return res.end();

      {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let finishReason = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const data = line.replace(/^data:\s*/, "");
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            finishReason = json.choices?.[0]?.finish_reason || finishReason;
            if (delta) {
              assistantContent += delta;
              res.write(`event: token\ndata: ${JSON.stringify({ token: delta })}\n\n`);
            }
          } catch {
            continue;
          }
        }
      }

      if (!assistantContent.trim()) {
        try {
          const fallbackResponse = await callOpenRouterWithFallback(requestBody);
          const fallbackPayload = await fallbackResponse.json();
          assistantContent = fallbackPayload.choices?.[0]?.message?.content || "";
          if (assistantContent.trim()) {
            res.write(`event: token\ndata: ${JSON.stringify({ token: assistantContent })}\n\n`);
          }
        } catch {
          assistantContent = "OpenRouter không trả nội dung ở chế độ streaming. Vui lòng gửi lại câu hỏi hoặc chọn model khác.";
          res.write(`event: token\ndata: ${JSON.stringify({ token: assistantContent })}\n\n`);
        }
      }

      if (assistantContent.trim() && isTruncatedFinishReason(finishReason)) {
        try {
          const continuation = await completeChatWithContinuation({
            ...requestBody,
            messages: [
              ...requestBody.messages,
              { role: "assistant", content: assistantContent },
              {
                role: "user",
                content: "Cau tra loi vua bi cat do gioi han token. Hay viet tiep tu dung noi dung dang dang do, khong lap lai phan da tra loi, va hoan thanh day du instruction."
              }
            ]
          });
          const continuationContent = continuation.assistantContent || "";
          if (continuationContent.trim()) {
            assistantContent = `${assistantContent.trim()}\n\n${continuationContent.trim()}`;
            res.write(`event: token\ndata: ${JSON.stringify({ token: `\n\n${continuationContent.trim()}` })}\n\n`);
          }
        } catch {
          const notice = "\n\n[Lưu ý: Model đã dừng do giới hạn token trước khi hoàn tất. Vui lòng bấm gửi tiếp câu: 'viết tiếp phần còn thiếu'.]";
          assistantContent = `${assistantContent}${notice}`;
          res.write(`event: token\ndata: ${JSON.stringify({ token: notice })}\n\n`);
        }
      }

      const messageId = createMessage({
        conversationId,
        role: "assistant",
        content: assistantContent,
        model: response.usedModel || model
      });
      res.write(`event: done\ndata: ${JSON.stringify({ conversationId, messageId })}\n\n`);
      return res.end();
      }
    }

    const completed = await completeChatWithContinuation({
      model,
      messages: openRouterMessages,
      temperature,
      max_tokens: maxCompletionTokens
    });

    let assistantContent = completed.assistantContent || "";
    if (!assistantContent.trim()) {
      assistantContent = "OpenRouter đã phản hồi nhưng không trả nội dung. Vui lòng gửi lại câu hỏi hoặc đổi model mặc định trong trang admin.";
    }
    const messageId = createMessage({
      conversationId,
      role: "assistant",
      content: assistantContent,
      model: completed.model || model,
      tokenInput: completed.usage?.prompt_tokens,
      tokenOutput: completed.usage?.completion_tokens
    });
    if (requestUser?.role !== "admin") incrementUsage(userId);

    res.json({
      data: {
        conversationId,
        messageId,
        role: "assistant",
        content: assistantContent,
        usage: completed.usage || null,
        model: completed.model || model,
        finishReason: completed.finishReason
      }
    });
  } catch (error) {
    const status = error.status && error.status < 500 ? error.status : 502;
    res.status(status).json({
      error: error.message === "OPENROUTER_API_KEY is not configured"
        ? "Chưa cấu hình OPENROUTER_API_KEY trong backend .env."
        : "OpenRouter đang không phản hồi như mong đợi. Vui lòng thử lại sau.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

export default router;
