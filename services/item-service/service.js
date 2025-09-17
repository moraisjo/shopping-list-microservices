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