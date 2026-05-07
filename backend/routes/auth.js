import express from "express";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { signUser } from "../middleware/auth.js";

const router = express.Router();

const adminLoginSchema = z.object({
  password: z.string().min(1)
});

const googleLoginSchema = z.object({
  credential: z.string().min(1)
});

const clientEmailLoginSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().max(120).optional()
});

router.get("/config", (_req, res) => {
  res.json({
    data: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      adminLoginEnabled: true
    }
  });
});

router.post("/admin/login", (req, res) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Mật khẩu admin không hợp lệ." });
  }

  const expected = process.env.ADMIN_PASSWORD || "admin";
  if (parsed.data.password !== expected) {
    return res.status(401).json({ error: "Sai mật khẩu admin." });
  }

  const user = {
    id: "demo-user",
    role: "admin",
    name: "Admin",
    email: "admin@local"
  };
  res.json({ data: { token: signUser(user), user } });
});

router.post("/client/demo", (_req, res) => {
  const user = {
    id: "client-demo",
    role: "client",
    name: "Client Demo",
    email: "client.demo@local"
  };
  res.json({ data: { token: signUser(user), user } });
});

router.post("/client/email", (req, res) => {
  const parsed = clientEmailLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email client khong hop le." });
  }

  const email = parsed.data.email.toLowerCase();
  const user = {
    id: `email:${email}`,
    role: "client",
    name: parsed.data.name || email.split("@")[0],
    email
  };

  res.json({ data: { token: signUser(user), user } });
});

router.post("/google", async (req, res) => {
  const parsed = googleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Google credential không hợp lệ." });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: "Chưa cấu hình GOOGLE_CLIENT_ID trong backend .env." });
  }

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: parsed.data.credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ error: "Gmail chưa được xác thực." });
    }

    const user = {
      id: `google:${payload.sub}`,
      role: "client",
      name: payload.name || payload.email,
      email: payload.email,
      picture: payload.picture
    };
    res.json({ data: { token: signUser(user), user } });
  } catch (error) {
    res.status(401).json({ error: "Không xác thực được Google Gmail." });
  }
});

export default router;
