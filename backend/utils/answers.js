export function normalizeQuestion(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeQuestion(text).split(" ").filter((token) => token.length > 1));
}

function similarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  const union = left.size + right.size - intersection;
  return intersection / union;
}

export function findSavedAnswer(db, question) {
  const normalized = normalizeQuestion(question);
  const exact = db.prepare(`
    SELECT *
    FROM answer_cache
    WHERE normalized_question = ?
    ORDER BY datetime(updated_at) DESC
    LIMIT 1
  `).get(normalized);
  if (exact) return { ...exact, matchScore: 1 };

  const rows = db.prepare(`
    SELECT *
    FROM answer_cache
    ORDER BY datetime(updated_at) DESC
    LIMIT 300
  `).all();

  let best = null;
  for (const row of rows) {
    const score = similarity(question, row.question);
    if (score >= 0.72 && (!best || score > best.matchScore)) {
      best = { ...row, matchScore: score };
    }
  }
  return best;
}
