import express from "express";
import mammoth from "mammoth";
import multer from "multer";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 60000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 8
  }
});

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const textTypes = new Set([
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown"
]);

function trimText(text = "") {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (normalized.length <= MAX_TEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_TEXT_CHARS)}\n\n[Đã cắt bớt nội dung do file quá dài.]`;
}

function workbookToText(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return `# Sheet: ${sheetName}\n${csv}`;
  }).join("\n\n");
}

function getOpenRouterHeaders() {
  if (!process.env.OPENROUTER_API_KEY) return null;
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    ...(process.env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER } : {}),
    ...(process.env.OPENROUTER_APP_TITLE ? { "X-Title": process.env.OPENROUTER_APP_TITLE } : {})
  };
}

async function extractImageText(dataUrl, fileName) {
  const headers = getOpenRouterHeaders();
  if (!headers) return "";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "baidu/qianfan-ocr-fast:free",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Hãy đọc toàn bộ chữ, số, bảng biểu và nội dung quan trọng trong ảnh này.",
                "Trả về văn bản thuần để một AI khác có thể tư vấn dựa trên nội dung ảnh.",
                `Tên file: ${fileName}`
              ].join("\n")
            },
            {
              type: "image_url",
              image_url: { url: dataUrl }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return "";
  }

  const payload = await response.json();
  return trimText(payload.choices?.[0]?.message?.content || "");
}

async function extractFile(file) {
  const extension = file.originalname.split(".").pop()?.toLowerCase();
  const base = {
    id: nanoid(),
    name: file.originalname,
    mimeType: file.mimetype,
    size: file.size
  };

  if (imageTypes.has(file.mimetype)) {
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const extractedText = await extractImageText(dataUrl, file.originalname);
    return {
      ...base,
      kind: "image",
      dataUrl,
      text: extractedText,
      warning: extractedText ? undefined : "Ảnh đã tải lên, nhưng OCR chưa đọc được chữ. Hãy chọn model có hỗ trợ vision nếu cần phân tích trực tiếp hình ảnh."
    };
  }

  if (file.mimetype === "application/pdf" || extension === "pdf") {
    const parsed = await pdfParse(file.buffer);
    return { ...base, kind: "document", text: trimText(parsed.text) };
  }

  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    return { ...base, kind: "document", text: trimText(parsed.value) };
  }

  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel" ||
    ["xlsx", "xls", "csv"].includes(extension)
  ) {
    const text = extension === "csv"
      ? file.buffer.toString("utf8")
      : workbookToText(file.buffer);
    return { ...base, kind: "spreadsheet", text: trimText(text) };
  }

  if (textTypes.has(file.mimetype) || ["txt", "md", "json"].includes(extension)) {
    return { ...base, kind: "document", text: trimText(file.buffer.toString("utf8")) };
  }

  return {
    ...base,
    kind: "unsupported",
    text: "",
    warning: "Định dạng này đã được nhận nhưng chưa hỗ trợ trích xuất nội dung."
  };
}

router.post("/", requireAuth, upload.array("files", 8), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "Chưa có file nào được tải lên." });
    }

    const data = await Promise.all(files.map(extractFile));
    res.json({ data });
  } catch (error) {
    res.status(400).json({
      error: "Không xử lý được file tải lên.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

export default router;
