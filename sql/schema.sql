CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
  estoque INTEGER NOT NULL CHECK (estoque >= 0),
  descricao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
