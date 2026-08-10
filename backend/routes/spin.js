import { Router } from "express";
import { pool, todayLocal } from "../db.js";

const router = Router();

const MAX_SPINS_PER_DAY = 3;

// When true, a finalized/locked-in day doesn't block starting a fresh session —
// useful for testing the whole spin/lock/lock-in flow repeatedly without
// waiting for a real day to pass. Set TESTING_MODE=true in .env.
const TESTING_MODE = process.env.TESTING_MODE === "true";

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getLatestRow(client, spinDate) {
  const { rows } = await client.query(
    `SELECT * FROM spin_history WHERE spin_date = $1 ORDER BY id DESC LIMIT 1`,
    [spinDate]
  );
  return rows[0] || null;
}

async function getActiveSession(client, spinDate) {
  const row = await getLatestRow(client, spinDate);
  // In testing mode, a finalized row doesn't count as "active" — treat it as
  // if no session has started yet, so a fresh 3-spin round can begin.
  if (row && row.finalized && TESTING_MODE) return null;
  return row;
}

async function hydrateSession(client, row) {
  if (!row) {
    return {
      spinsUsed: 0,
      spinsRemaining: MAX_SPINS_PER_DAY,
      word: null,
      style: null,
      wordLocked: false,
      styleLocked: false,
      finalized: false,
    };
  }
  const { rows } = await client.query(
    `SELECT w.text AS word, s.name AS style FROM words w, styles s WHERE w.id = $1 AND s.id = $2`,
    [row.word_id, row.style_id]
  );
  const names = rows[0] || {};
  return {
    spinsUsed: row.spins_used,
    spinsRemaining: Math.max(0, MAX_SPINS_PER_DAY - row.spins_used),
    word: names.word || null,
    style: names.style || null,
    wordLocked: row.word_locked,
    styleLocked: row.style_locked,
    finalized: row.finalized,
  };
}

// GET /api/today -> current session state for today (spins used, current
// word/style, lock flags, whether it's finalized).
router.get("/today", async (req, res) => {
  try {
    const today = todayLocal();
    const activeRow = await getActiveSession(pool, today);
    const session = await hydrateSession(pool, activeRow);
    res.json({ date: today, session, testingMode: TESTING_MODE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load today's session" });
  }
});

// PATCH /api/today/locks -> toggle which reel(s) stay fixed on the next spin
router.patch("/today/locks", async (req, res) => {
  const { wordLocked, styleLocked } = req.body;
  const client = await pool.connect();
  try {
    const today = todayLocal();
    const activeRow = await getActiveSession(client, today);

    if (!activeRow) {
      // Nothing spun yet today — nothing to lock, but not an error; the
      // frontend only shows lock buttons once a word/style exists anyway.
      return res.json({ date: today, session: await hydrateSession(client, null), testingMode: TESTING_MODE });
    }
    if (activeRow.finalized) {
      return res.status(409).json({ error: "Today is already locked in" });
    }

    await client.query(
      `UPDATE spin_history SET
         word_locked = COALESCE($1, word_locked),
         style_locked = COALESCE($2, style_locked),
         updated_at = now()
       WHERE id = $3`,
      [wordLocked, styleLocked, activeRow.id]
    );

    const updatedRow = await getLatestRow(client, today);
    res.json({ date: today, session: await hydrateSession(client, updatedRow), testingMode: TESTING_MODE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update locks" });
  } finally {
    client.release();
  }
});

// POST /api/spin -> use one of today's (up to 3) spins. Re-rolls whichever
// of word/style isn't locked; auto-finalizes once the 3rd spin is used.
router.post("/spin", async (req, res) => {
  const client = await pool.connect();
  try {
    const today = todayLocal();
    await client.query("BEGIN");

    const activeRow = await getActiveSession(client, today);

    if (activeRow?.finalized) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Today is already locked in" });
    }
    if (activeRow && activeRow.spins_used >= MAX_SPINS_PER_DAY) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "No spins remaining today" });
    }
    if (activeRow?.word_locked && activeRow?.style_locked) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Everything is locked — tap Lock it in" });
    }

    const wordLocked = activeRow?.word_locked || false;
    const styleLocked = activeRow?.style_locked || false;
    const currentWordId = activeRow?.word_id || null;
    const currentStyleId = activeRow?.style_id || null;

    let chosenWordId = currentWordId;
    let cycleReset = false;

    if (!wordLocked) {
      const { rows: unusedWords } = await client.query(
        "SELECT id FROM words WHERE active = TRUE AND used_in_cycle = FALSE AND id IS DISTINCT FROM $1",
        [currentWordId]
      );
      let wordPool = unusedWords;
      if (wordPool.length === 0) {
        // Try including the current word before considering a full reset —
        // it's still a valid "unused" pick, just excluded above to force variety.
        const { rows: unusedIncludingCurrent } = await client.query(
          "SELECT id FROM words WHERE active = TRUE AND used_in_cycle = FALSE"
        );
        if (unusedIncludingCurrent.length > 0) {
          wordPool = unusedIncludingCurrent;
        } else {
          await client.query("UPDATE words SET used_in_cycle = FALSE WHERE active = TRUE");
          const { rows: allWords } = await client.query(
            "SELECT id FROM words WHERE active = TRUE AND id IS DISTINCT FROM $1",
            [currentWordId]
          );
          wordPool = allWords.length > 0 ? allWords : await client
            .query("SELECT id FROM words WHERE active = TRUE")
            .then((r) => r.rows);
          cycleReset = true;
        }
      }
      if (wordPool.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No active words configured" });
      }
      chosenWordId = wordPool[Math.floor(Math.random() * wordPool.length)].id;
    }

    let chosenStyleId = currentStyleId;
    let capRelaxed = false;

    if (!styleLocked) {
      const yesterday = shiftDate(today, -1);
      const weekStart = shiftDate(today, -7);

      const { rows: allStyles } = await client.query("SELECT id FROM styles WHERE active = TRUE");
      const { rows: recentSpins } = await client.query(
        `SELECT style_id, spin_date FROM spin_history
         WHERE finalized = TRUE AND spin_date >= $1 AND spin_date <= $2`,
        [weekStart, yesterday]
      );

      const usedYesterday = new Set(
        recentSpins.filter((r) => r.spin_date.toISOString().slice(0, 10) === yesterday).map((r) => r.style_id)
      );
      const weekCounts = {};
      recentSpins.forEach((r) => {
        weekCounts[r.style_id] = (weekCounts[r.style_id] || 0) + 1;
      });

      let stylePool = allStyles.filter(
        (s) => s.id !== currentStyleId && !usedYesterday.has(s.id) && (weekCounts[s.id] || 0) < 2
      );
      if (stylePool.length === 0) {
        stylePool = allStyles.filter((s) => !usedYesterday.has(s.id) && (weekCounts[s.id] || 0) < 2);
      }
      if (stylePool.length === 0) {
        stylePool = allStyles.filter((s) => s.id !== currentStyleId && !usedYesterday.has(s.id));
        capRelaxed = true;
      }
      if (stylePool.length === 0) {
        stylePool = allStyles.filter((s) => !usedYesterday.has(s.id));
        capRelaxed = true;
      }
      if (stylePool.length === 0) {
        stylePool = allStyles;
        capRelaxed = true;
      }
      if (stylePool.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No active styles configured" });
      }
      chosenStyleId = stylePool[Math.floor(Math.random() * stylePool.length)].id;
    }

    const newSpinsUsed = (activeRow?.spins_used || 0) + 1;
    const willFinalize = newSpinsUsed >= MAX_SPINS_PER_DAY;

    let rowId;
    if (activeRow) {
      const { rows } = await client.query(
        `UPDATE spin_history SET
           word_id = $1, style_id = $2, spins_used = $3,
           cycle_reset = $4, cap_relaxed = $5, finalized = $6, updated_at = now()
         WHERE id = $7
         RETURNING id`,
        [chosenWordId, chosenStyleId, newSpinsUsed, cycleReset, capRelaxed, willFinalize, activeRow.id]
      );
      rowId = rows[0].id;
    } else {
      const { rows } = await client.query(
        `INSERT INTO spin_history (spin_date, word_id, style_id, spins_used, cycle_reset, cap_relaxed, finalized)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [today, chosenWordId, chosenStyleId, newSpinsUsed, cycleReset, capRelaxed, willFinalize]
      );
      rowId = rows[0].id;
    }

    if (willFinalize) {
      await client.query("UPDATE words SET used_in_cycle = TRUE WHERE id = $1", [chosenWordId]);
    }

    await client.query("COMMIT");

    const finalRow = await getLatestRow(pool, today);
    const session = await hydrateSession(pool, finalRow);
    res.json({ date: today, session, testingMode: TESTING_MODE });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to spin" });
  } finally {
    client.release();
  }
});

// POST /api/today/lock-in -> finalize early, before all 3 spins are used
router.post("/today/lock-in", async (req, res) => {
  const client = await pool.connect();
  try {
    const today = todayLocal();
    await client.query("BEGIN");

    const activeRow = await getActiveSession(client, today);
    if (!activeRow) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Spin at least once before locking in" });
    }
    if (activeRow.finalized) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Today is already locked in" });
    }

    await client.query("UPDATE spin_history SET finalized = TRUE, updated_at = now() WHERE id = $1", [activeRow.id]);
    await client.query("UPDATE words SET used_in_cycle = TRUE WHERE id = $1", [activeRow.word_id]);

    await client.query("COMMIT");

    const finalRow = await getLatestRow(pool, today);
    res.json({ date: today, session: await hydrateSession(pool, finalRow), testingMode: TESTING_MODE });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to lock in" });
  } finally {
    client.release();
  }
});

export default router;
