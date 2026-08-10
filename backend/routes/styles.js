import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /api/styles -> full list
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, active, created_at FROM styles ORDER BY name ASC"
  );
  res.json(rows);
});

// POST /api/styles -> add a new style
router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Style name is required" });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO styles (name) VALUES ($1) RETURNING id, name, active",
      [name.trim().toLowerCase()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That style already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to add style" });
  }
});

// PATCH /api/styles/:id -> update name or active flag
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE styles SET
         name = COALESCE($1, name),
         active = COALESCE($2, active)
       WHERE id = $3
       RETURNING id, name, active`,
      [name ? name.trim().toLowerCase() : null, active, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Style not found" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That style already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to update style" });
  }
});

// DELETE /api/styles/:id -> remove a style (blocked if used in history)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM styles WHERE id = $1", [id]);
    res.status(204).end();
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        error: "This style has already been used in a past spin — deactivate it instead of deleting.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to delete style" });
  }
});

export default router;
