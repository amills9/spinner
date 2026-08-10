import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

// GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD -> date/word/style list, newest first
router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";

  if (from) {
    params.push(from);
    where += ` AND sh.spin_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND sh.spin_date <= $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT sh.spin_date, w.text AS word, s.name AS style, sh.spins_used, sh.cycle_reset, sh.cap_relaxed
     FROM spin_history sh
     JOIN words w ON w.id = sh.word_id
     JOIN styles s ON s.id = sh.style_id
     WHERE sh.finalized = TRUE ${where}
     ORDER BY sh.spin_date DESC, sh.id DESC`,
    params
  );
  res.json(rows);
});

export default router;
