require("dotenv").config();

const express = require("express");
const { pool } = require("./db");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseProdutoBody(body, { partial }) {
  const errors = [];
  const produto = {};

  if (!partial || body.nome !== undefined) {
    if (typeof body.nome !== "string" || body.nome.trim() === "") {
      errors.push("nome é obrigatório");
    } else {
      produto.nome = body.nome.trim();
    }
  }

  if (!partial || body.categoria !== undefined) {
    if (typeof body.categoria !== "string" || body.categoria.trim() === "") {
      errors.push("categoria é obrigatória");
    } else {
      produto.categoria = body.categoria.trim();
    }
  }

  if (!partial || body.preco !== undefined) {
    const preco = Number(body.preco);
    if (!Number.isFinite(preco) || preco < 0) {
      errors.push("preco deve ser um número maior ou igual a zero");
    } else {
      produto.preco = preco;
    }
  }

  if (!partial || body.estoque !== undefined) {
    const estoque = Number(body.estoque);
    if (!Number.isInteger(estoque) || estoque < 0) {
      errors.push("estoque deve ser um inteiro maior ou igual a zero");
    } else {
      produto.estoque = estoque;
    }
  }

  if (body.descricao !== undefined) {
    if (body.descricao !== null && typeof body.descricao !== "string") {
      errors.push("descricao deve ser texto");
    } else {
      produto.descricao = body.descricao;
    }
  }

  return { errors, produto };
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    res.status(503).json({ status: "error", message: error.message });
  }
});

app.get("/produtos", async (req, res) => {
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const offset = parsePositiveInt(req.query.offset, 0);
  const params = [];
  const filters = [];

  if (req.query.categoria) {
    params.push(req.query.categoria);
    filters.push(`categoria = $${params.length}`);
  }

  if (req.query.nome) {
    params.push(`%${req.query.nome}%`);
    filters.push(`nome ILIKE $${params.length}`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  params.push(limit, offset);

  try {
    const result = await pool.query(
      `SELECT id, nome, categoria, preco, estoque, descricao, criado_em
       FROM produtos
       ${where}
       ORDER BY id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/produtos/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const result = await pool.query(
      `SELECT id, nome, categoria, preco, estoque, descricao, criado_em
       FROM produtos WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "produto não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/produtos", async (req, res) => {
  const { errors, produto } = parseProdutoBody(req.body ?? {}, { partial: false });
  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join("; ") });
  }

  try {
    const result = await pool.query(
      `INSERT INTO produtos (nome, categoria, preco, estoque, descricao)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, categoria, preco, estoque, descricao, criado_em`,
      [
        produto.nome,
        produto.categoria,
        produto.preco,
        produto.estoque,
        produto.descricao ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put("/produtos/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  const { errors, produto } = parseProdutoBody(req.body ?? {}, { partial: true });
  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join("; ") });
  }

  const fields = [];
  const params = [];
  for (const key of ["nome", "categoria", "preco", "estoque", "descricao"]) {
    if (produto[key] !== undefined) {
      params.push(produto[key]);
      fields.push(`${key} = $${params.length}`);
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: "nenhum campo para atualizar" });
  }

  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE produtos SET ${fields.join(", ")}
       WHERE id = $${params.length}
       RETURNING id, nome, categoria, preco, estoque, descricao, criado_em`,
      params
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "produto não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/produtos/:id", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM produtos WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "produto não encontrado" });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`API ouvindo em http://localhost:${port}`);
});
