import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import { ensureDemoUser } from "./db.js";
import chatRouter from "./routes/chat.js";
import conversationsRouter from "./routes/conversations.js";
import modelsRouter from "./routes/models.js";
import uploadsRouter from "./routes/uploads.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import billingRouter from "./routes/billing.js";

ensureDemoUser();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../frontend/dist");

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: frontendOrigin,
  credentials: true
}));
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY)
  });
});

app.use("/api/models", modelsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/billing", billingRouter);
app.use("/api/chat", chatRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/uploads", uploadsRouter);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({
    error: "Có lỗi xảy ra ở backend.",
    detail: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
