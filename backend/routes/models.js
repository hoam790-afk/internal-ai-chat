import express from "express";

const router = express.Router();
let cachedModels = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeModel(model) {
  const pricing = model.pricing || {};
  return {
    id: model.id,
    name: model.name || model.id,
    provider: model.id?.split("/")?.[0] || model.provider || "openrouter",
    contextLength: model.context_length || model.contextLength || null,
    pricing: {
      prompt: pricing.prompt ?? pricing.input ?? null,
      completion: pricing.completion ?? pricing.output ?? null
    },
    raw: model
  };
}

router.get("/", async (_req, res) => {
  try {
    if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
      return res.json({ data: cachedModels, cached: true });
    }

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`OpenRouter Models API returned ${response.status}`);
    }

    const payload = await response.json();
    cachedModels = (payload.data || []).map(normalizeModel);
    cachedAt = Date.now();
    res.json({ data: cachedModels, cached: false });
  } catch (error) {
    res.status(502).json({
      error: "Không tải được danh sách model từ OpenRouter.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

export default router;
