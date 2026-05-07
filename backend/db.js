import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import initSqlJs from "sql.js";

const databasePath = process.env.DATABASE_PATH || "./data/chat.sqlite";
const resolvedPath = path.resolve(databasePath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const SQL = await initSqlJs();
const existingDatabase = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath) : undefined;
const sqlite = new SQL.Database(existingDatabase);

function persist() {
  fs.writeFileSync(resolvedPath, Buffer.from(sqlite.export()));
}

function normalizeParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

export const db = {
  pragma(value) {
    sqlite.run(`PRAGMA ${value}`);
  },
  exec(sql) {
    sqlite.run(sql);
    persist();
  },
  prepare(sql) {
    return {
      run(...params) {
        const statement = sqlite.prepare(sql);
        try {
          statement.bind(normalizeParams(params));
          while (statement.step()) {}
        } finally {
          statement.free();
        }
        persist();
        return {};
      },
      get(...params) {
        const statement = sqlite.prepare(sql);
        try {
          statement.bind(normalizeParams(params));
          return statement.step() ? statement.getAsObject() : undefined;
        } finally {
          statement.free();
        }
      },
      all(...params) {
        const statement = sqlite.prepare(sql);
        const rows = [];
        try {
          statement.bind(normalizeParams(params));
          while (statement.step()) {
            rows.push(statement.getAsObject());
          }
          return rows;
        } finally {
          statement.free();
        }
      }
    };
  }
};

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  selected_model TEXT,
  system_instruction TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  model TEXT,
  token_input INTEGER,
  token_output INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  default_model TEXT NOT NULL,
  default_system_instruction TEXT,
  temperature REAL NOT NULL DEFAULT 0.2,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answer_cache (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  normalized_question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_conversation_id TEXT,
  source_message_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_answer_cache_normalized_question
ON answer_cache(normalized_question, updated_at);
`);

export const DEMO_USER_ID = "demo-user";

export function ensureDemoUser() {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email)
    VALUES (?, ?, ?)
  `).run(DEMO_USER_ID, "Internal User", "internal@example.com");

  db.prepare(`
    INSERT OR IGNORE INTO settings (id, user_id, default_model, default_system_instruction, temperature)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    nanoid(),
    DEMO_USER_ID,
    process.env.DEFAULT_MODEL || "openrouter/free",
    "You are a helpful internal company AI assistant. Answer clearly and professionally.",
    0.2
  );
}

export function touchConversation(conversationId) {
  db.prepare("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(conversationId);
}

export function createMessage({ conversationId, role, content, model, tokenInput, tokenOutput }) {
  const id = nanoid();
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, model, token_input, token_output)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, conversationId, role, content, model || null, tokenInput || null, tokenOutput || null);
  touchConversation(conversationId);
  return id;
}
