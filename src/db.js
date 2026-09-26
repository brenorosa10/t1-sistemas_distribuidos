const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não está definida. Copie .env.example para .env.");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: true },
  max: 20,
});

module.exports = { pool };
