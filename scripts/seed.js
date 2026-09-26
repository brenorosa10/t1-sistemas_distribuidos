require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

const CATEGORIAS = [
  "eletronicos",
  "livros",
  "casa",
  "esporte",
  "vestuario",
  "alimentos",
  "brinquedos",
  "beleza",
];

const BATCH_SIZE = 1000;

function produtoAt(index) {
  const categoria = CATEGORIAS[index % CATEGORIAS.length];
  const preco = ((index * 17) % 50000) / 100;
  const estoque = index % 200;
  return [
    `Produto ${index + 1}`,
    categoria,
    preco.toFixed(2),
    estoque,
    `Descricao do produto ${index + 1} na categoria ${categoria}`,
  ];
}

async function insertBatch(client, rows) {
  const values = [];
  const params = [];
  let param = 1;

  for (const row of rows) {
    values.push(`($${param}, $${param + 1}, $${param + 2}, $${param + 3}, $${param + 4})`);
    params.push(...row);
    param += 5;
  }

  await client.query(
    `INSERT INTO produtos (nome, categoria, preco, estoque, descricao)
     VALUES ${values.join(", ")}`,
    params
  );
}

async function main() {
  const total = Number.parseInt(process.env.SEED_COUNT ?? "50000", 10);
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error("SEED_COUNT deve ser um inteiro positivo");
  }

  const schema = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  const client = await pool.connect();

  try {
    await client.query(schema);
    await client.query("TRUNCATE produtos RESTART IDENTITY");

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, total - offset);
      const rows = [];
      for (let i = 0; i < size; i += 1) {
        rows.push(produtoAt(offset + i));
      }
      await insertBatch(client, rows);
      console.log(`Inseridos ${offset + size} de ${total}`);
    }

    const count = await client.query("SELECT COUNT(*)::int AS total FROM produtos");
    console.log(`Seed concluído: ${count.rows[0].total} produtos`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
