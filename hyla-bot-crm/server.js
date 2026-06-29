require("dotenv").config();
const express = require("express");
const path = require("path");
const { pool, initDb, scoreOf } = require("./db");
const { startBot } = require("./bot");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Получить всех лидов
app.get("/api/leads", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM leads ORDER BY created_at DESC");
    const withScore = rows.map((l) => ({ ...l, score: scoreOf(l) }));
    res.json(withScore);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Не удалось получить лидов" });
  }
});

// Создать лида вручную (из CRM)
app.post("/api/leads", async (req, res) => {
  const { name, phone, city, source, pain, pets, housing, notes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Имя обязательно" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO leads (name, phone, city, source, pain, pets, housing, notes, stage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new') RETURNING *`,
      [name, phone, city, source, pain, !!pets, housing, notes]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Не удалось сохранить лида" });
  }
});

// Обновить этап / поля лида
app.patch("/api/leads/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const allowed = ["name", "phone", "city", "source", "pain", "pets", "housing", "notes", "stage"];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "Нет полей для обновления" });
  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE leads SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Не удалось обновить лида" });
  }
});

// Удалить лида
app.delete("/api/leads/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM leads WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Не удалось удалить лида" });
  }
});

const PORT = process.env.PORT || 3000;

(async () => {
  await initDb();
  startBot();
  app.listen(PORT, () => console.log(`[server] CRM доступна на порту ${PORT}`));
})();
