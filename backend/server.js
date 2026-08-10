import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import spinRoutes from "./routes/spin.js";
import wordsRoutes from "./routes/words.js";
import stylesRoutes from "./routes/styles.js";
import historyRoutes from "./routes/history.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", spinRoutes);
app.use("/api/words", wordsRoutes);
app.use("/api/styles", stylesRoutes);
app.use("/api/history", historyRoutes);

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "db unreachable" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Word Spinner API listening on :${PORT}`));
