const express = require('express');
const jwt = require('jsonwebtoken');
const { JsonCollection } = require('../../shared/JsonDatabase');

const app = express();
app.use(express.json());

const SERVICE_NAME = 'item-service';
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const itemsCol = new JsonCollection('items');

// Auth middleware (igual conceito do user-service)
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Seed inicial (20 itens) se vazio
function seedIfEmpty() {
  if (itemsCol.findAll().length > 0) return;
  const seed = [
    // Alimentos
    { name: 'Arroz Branco', category: 'Alimentos', brand: 'Marca A', unit: 'kg', averagePrice: 6.5, barcode: '789000000001', description: 'Arroz tipo 1', active: true },
    { name: 'Feijão Carioca', category: 'Alimentos', brand: 'Marca B', unit: 'kg', averagePrice: 8.9, barcode: '789000000002', description: 'Feijão selecionado', active: true },
    { name: 'Macarrão Espaguete', category: 'Alimentos', brand: 'Marca C', unit: 'un', averagePrice: 4.2, barcode: '789000000003', description: '500g', active: true },
    { name: 'Óleo de Soja', category: 'Alimentos', brand: 'Marca D', unit: 'litro', averagePrice: 7.1, barcode: '789000000004', description: 'Óleo refinado', active: true },
    // Limpeza
    { name: 'Detergente Neutro', category: 'Limpeza', brand: 'Marca E', unit: 'un', averagePrice: 2.5, barcode: '789000000005', description: '500ml', active: true },
    { name: 'Sabão em Pó', category: 'Limpeza', brand: 'Marca F', unit: 'kg', averagePrice: 18.9, barcode: '789000000006', description: '1kg multiuso', active: true },
    { name: 'Desinfetante Lavanda', category: 'Limpeza', brand: 'Marca G', unit: 'litro', averagePrice: 6.0, barcode: '789000000007', description: '1L', active: true },
    { name: 'Esponja Multiuso', category: 'Limpeza', brand: 'Marca H', unit: 'un', averagePrice: 1.9, barcode: '789000000008', description: 'Esponja dupla face', active: true },
    // Higiene
    { name: 'Sabonete Neutro', category: 'Higiene', brand: 'Marca I', unit: 'un', averagePrice: 2.2, barcode: '789000000009', description: 'Sabonete 90g', active: true },
    { name: 'Shampoo Anticaspa', category: 'Higiene', brand: 'Marca J', unit: 'un', averagePrice: 15.5, barcode: '789000000010', description: '200ml', active: true },
    { name: 'Pasta de Dente', category: 'Higiene', brand: 'Marca K', unit: 'un', averagePrice: 6.3, barcode: '789000000011', description: '90g', active: true },
    { name: 'Papel Higiênico 12x', category: 'Higiene', brand: 'Marca L', unit: 'un', averagePrice: 19.9, barcode: '789000000012', description: 'Folha dupla', active: true },
    // Bebidas
    { name: 'Água Mineral 1.5L', category: 'Bebidas', brand: 'Marca M', unit: 'litro', averagePrice: 3.0, barcode: '789000000013', description: 'Sem gás', active: true },
    { name: 'Refrigerante Cola 2L', category: 'Bebidas', brand: 'Marca N', unit: 'litro', averagePrice: 9.5, barcode: '789000000014', description: 'PET 2L', active: true },
    { name: 'Suco de Laranja 1L', category: 'Bebidas', brand: 'Marca O', unit: 'litro', averagePrice: 8.2, barcode: '789000000015', description: 'Integral', active: true },
    { name: 'Café Torrado e Moído', category: 'Bebidas', brand: 'Marca P', unit: 'kg', averagePrice: 28.5, barcode: '789000000016', description: '500g', active: true },
    // Padaria
    { name: 'Pão de Forma', category: 'Padaria', brand: 'Marca Q', unit: 'un', averagePrice: 8.5, barcode: '789000000017', description: '500g', active: true },
    { name: 'Bolo Simples', category: 'Padaria', brand: 'Marca R', unit: 'un', averagePrice: 12.0, barcode: '789000000018', description: 'Sabor baunilha', active: true },
    { name: 'Croissant', category: 'Padaria', brand: 'Marca S', unit: 'un', averagePrice: 4.8, barcode: '789000000019', description: 'Manteiga', active: true },
    { name: 'Pão Francês', category: 'Padaria', brand: 'Marca T', unit: 'kg', averagePrice: 14.0, barcode: '789000000020', description: 'Aprox. 1kg', active: true }
  ];
  seed.forEach(i => itemsCol.insert(i));
}
seedIfEmpty();

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));

// GET /items?category=&name=
app.get('/items', (req, res) => {
  const { category, name } = req.query;
  const all = itemsCol.findAll(doc => {
    if (category && doc.category !== category) return false;
    if (name && !doc.name.toLowerCase().includes(String(name).toLowerCase())) return false;
    return true;
  });
  res.json(all);
});

// GET /items/:id
app.get('/items/:id', (req, res) => {
  const item = itemsCol.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });
  res.json(item);
});

// POST /items (auth)
app.post('/items', auth, (req, res) => {
  const { name, category, brand = '', unit = 'un', averagePrice = 0, barcode = '', description = '', active = true } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'name e category são obrigatórios' });
  }
  const item = itemsCol.insert({ name, category, brand, unit, averagePrice, barcode, description, active });
  res.status(201).json(item);
});

// PUT /items/:id (auth)
app.put('/items/:id', auth, (req, res) => {
  const current = itemsCol.findById(req.params.id);
  if (!current) return res.status(404).json({ error: 'Item não encontrado' });
  const patch = {};
  [
    'name','category','brand','unit','averagePrice','barcode','description','active'
  ].forEach(f => {
    if (req.body[f] !== undefined) patch[f] = req.body[f];
  });
  const updated = itemsCol.update(current.id, patch);
  res.json(updated);
});

// GET /categories
app.get('/categories', (_req, res) => {
  const cats = Array.from(new Set(itemsCol.findAll().map(i => i.category))).sort();
  res.json(cats);
});

// GET /search?q=
app.get('/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json([]);
  const results = itemsCol.findAll(i => i.name.toLowerCase().includes(q));
  res.json(results);
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// Error
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});

module.exports = app;