# T1 — CRUD de produtos e avaliação de desempenho

API HTTP em Node.js e Express com PostgreSQL (Neon). O domínio é **produtos**: leitura filtrada por categoria e escrita de novos registros ou atualização de preço e estoque.

## Pré-requisitos

- Node.js 18 ou superior
- A URL do banco (não versione a senha)

## Configuração

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Preencha `DATABASE_URL` no `.env`. Use `sslmode=require`. O driver `pg` não usa libpq, então omita `channel_binding=require` se a conexão falhar.

O arquivo `.env` está no `.gitignore`. Não faça commit da senha. Se a URL já foi exposta, rotacione a senha no painel do Neon.

## Subir a API e popular o banco

```bash
npm install
npm run seed
npm start
```

`npm run seed` aplica [`sql/schema.sql`](sql/schema.sql), apaga a tabela `produtos` e insere a quantidade de `SEED_COUNT` (padrão **50000**), em lotes de 1000. A tabela nasce só com a chave primária em `id`, sem índices extras, para o experimento de índice ficar separado.

A API escuta em `http://localhost:3000`.

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/health` | Confere a API e o banco |
| GET | `/produtos?categoria=&nome=&limit=&offset=` | Listagem paginada (leitura do benchmark) |
| GET | `/produtos/:id` | Leitura por id |
| POST | `/produtos` | Insert |
| PUT | `/produtos/:id` | Update parcial de nome, categoria, preço, estoque ou descrição |
| DELETE | `/produtos/:id` | Remove o registro |

Exemplo de escrita no PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/produtos -Method Post -ContentType "application/json" -Body '{"nome":"Caneta","categoria":"papelaria","preco":3.5,"estoque":10}'
```

## Roteiro dos experimentos

Meça com Apache JMeter (ou k6) contra `http://localhost:3000`, com a API e o gerador de carga na mesma máquina. O gargalo esperado é a rede até o Neon mais o banco, não a máquina que gera as requisições.

Use 100 threads no total, o mesmo tempo em cada cenário (por exemplo 60 s) e um aquecimento curto antes de gravar os números. Anote throughput (req/s), latência média, p95 e taxa de erro.

Leituras: `GET /produtos?categoria=eletronicos` (e, se quiser ponto a ponto, `GET /produtos/:id` com ids entre 1 e o tamanho da tabela).

Escritas: `POST /produtos` com JSON válido, ou `PUT /produtos/:id` alterando `preco` e `estoque`.

| Cenário | Leituras | Escritas | Exemplo com 100 threads |
| --- | --- | --- | --- |
| A | 50% | 50% | 50 threads de GET e 50 de POST/PUT |
| B | 75% | 25% | 75 de GET e 25 de POST/PUT |
| C | 25% | 75% | 25 de GET e 75 de POST/PUT |

No JMeter, dois Thread Groups no mesmo plano, com o número de threads de cada grupo na proporção acima, e um Aggregate Report ou Summary Report no fim.

### Dataset de 20 mil registros

```powershell
$env:SEED_COUNT = "20000"
npm run seed
```

Repita os três cenários com o mesmo plano do JMeter.

O que se espera, antes de olhar os números:

- `GET /produtos/:id` muda pouco. O índice da chave primária já localiza a linha; 20 mil ou 50 mil páginas a mais quase não aparecem nesse acesso.
- `GET /produtos?categoria=...` **sem** índice em `categoria` faz sequential scan. Com 20 mil linhas o scan lê menos páginas, então a leitura filtrada tende a ficar mais barata.
- Escritas podem melhorar um pouco (menos páginas e menos WAL), em geral menos do que a leitura sem índice.

Quem entra no relatório são os números medidos, não só essa expectativa.

### Índice

A leitura do teste filtra por igualdade em `categoria`. O índice a criar é um B-tree nessa coluna:

```sql
CREATE INDEX idx_produtos_categoria ON produtos (categoria);
```

Confira com `EXPLAIN ANALYZE` o `GET` equivalente (`SELECT ... FROM produtos WHERE categoria = 'eletronicos' ORDER BY id LIMIT 20`) antes e depois. O plano deve sair de sequential scan para index scan ou bitmap index scan, e o tempo da consulta deve cair.

`nome ILIKE '%texto%'` não usa esse B-tree. Busca textual pediria a extensão `pg_trgm` e um índice GIN em `nome`.

O índice deixa `INSERT` e `UPDATE` de `categoria` um pouco mais caros, porque o Postgres mantém a estrutura a cada escrita. No cenário B (mais leituras) o ganho na consulta costuma compensar. No cenário C (mais escritas) pode não compensar. Meça de novo os três cenários com o índice presente e compare com a tabela sem índice.

### SQL e NoSQL neste sistema

PostgreSQL cabe neste CRUD: esquema fixo, filtro por categoria, atualização de campos e transações ACID. Um banco de documentos (por exemplo MongoDB) atenderia o mesmo `GET`/`POST` de um produto com latência parecida no acesso pontual e facilitaria escalar escrita na horizontal, mas abre mão de integridade relacional e de `JOIN` se o modelo ganhar pedidos, clientes e estoque ligados ao produto.

Neste mix de leitura e escrita, o que mais muda o número é índice, tamanho da tabela e latência do Neon. O rótulo SQL ou NoSQL sozinho não explica o resultado. No relatório, compare em uma tabela curta: consistência, esquema, consulta filtrada, custo de escrita e operação (um Postgres gerenciado contra um cluster NoSQL).
