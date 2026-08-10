import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /api/words -> full list, newest first
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, text, active, used_in_cycle, created_at FROM words ORDER BY text ASC"
  );
  res.json(rows);
});

// POST /api/words -> add a new word
router.post("/", async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Word text is required" });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO words (text) VALUES ($1) RETURNING id, text, active, used_in_cycle",
      [text.trim().toLowerCase()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That word already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to add word" });
  }
});

// POST /api/words/bulk -> import many words at once (from a pasted list or CSV)
// Body: { words: ["word1", "word2", ...] }
router.post("/bulk", async (req, res) => {
  const { words } = req.body;
  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty array of words" });
  }

  const cleaned = [...new Set(
    words
      .map((w) => String(w).trim().toLowerCase())
      .filter((w) => w.length > 0 && /^[a-z'-]+$/.test(w))
  )];

  if (cleaned.length === 0) {
    return res.status(400).json({ error: "No valid words found in the import" });
  }

  const client = await pool.connect();
  let added = 0;
  try {
    await client.query("BEGIN");
    for (const word of cleaned) {
      const result = await client.query(
        "INSERT INTO words (text) VALUES ($1) ON CONFLICT (text) DO NOTHING",
        [word]
      );
      added += result.rowCount;
    }
    await client.query("COMMIT");
    res.json({
      submitted: words.length,
      valid: cleaned.length,
      added,
      skipped: cleaned.length - added,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Bulk import failed" });
  } finally {
    client.release();
  }
});

// PATCH /api/words/:id -> update text or active flag
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { text, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE words SET
         text = COALESCE($1, text),
         active = COALESCE($2, active)
       WHERE id = $3
       RETURNING id, text, active, used_in_cycle`,
      [text ? text.trim().toLowerCase() : null, active, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Word not found" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That word already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to update word" });
  }
});

// DELETE /api/words/:id -> remove a word (blocked if it's used in history)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM words WHERE id = $1", [id]);
    res.status(204).end();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        error: "This word has already been used in a past spin — deactivate it instead of deleting.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to delete word" });
  }
});

export default router;
