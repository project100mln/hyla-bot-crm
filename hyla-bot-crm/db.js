const { Pool } = require("pg");

// Railway сам подставит DATABASE_URL, когда ты подключишь Postgres к проекту.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      city TEXT,
      source TEXT,
      pain TEXT,
      pets BOOLEAN DEFAULT FALSE,
      housing TEXT,
      notes TEXT,
      stage TEXT NOT NULL DEFAULT 'new',
      telegram_chat_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("[db] таблица leads готова");
}

function scoreOf(lead) {
  let s = 0;
  if (lead.pain === "Аллергия") s += 2;
  if (lead.pets) s += 2;
  if (lead.phone) s += 2;
  if (lead.housing) s += 1;
  if (s >= 5) return "hot";
  if (s >= 2) return "warm";
  return "cold";
}

module.exports = { pool, initDb, scoreOf };
