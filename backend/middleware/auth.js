import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { db, DEMO_USER_ID } from "../db.js";

const jwtSecret = process.env.JWT_SECRET || "dev-only-change-me";

export function signUser(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
}

export function getRequestUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: "Bạn cần đăng nhập." });
  }
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const user = getRequestUser(req);
  if (!user) {
    return res.status(401).json({ error: "Bạn cần đăng nhập admin." });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Chỉ admin được phép thao tác." });
  }
  req.user = user;
  next();
}

export function resolveUserId(req) {
  const user = getRequestUser(req);
  if (!user) return null;
  if (user.role === "admin") return DEMO_USER_ID;

  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email)
    VALUES (?, ?, ?)
  `).run(user.id, user.name || user.email, user.email);

  const settings = db.prepare("SELECT id FROM settings WHERE user_id = ?").get(user.id);
  if (!settings) {
    const adminSettings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(DEMO_USER_ID);
    db.prepare(`
      INSERT INTO settings (id, user_id, default_model, default_system_instruction, temperature)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      user.id,
      adminSettings?.default_model || process.env.DEFAULT_MODEL || "openrouter/free",
      adminSettings?.default_system_instruction || "",
      adminSettings?.temperature ?? 0.2
    );
  }

  return user.id;
}
