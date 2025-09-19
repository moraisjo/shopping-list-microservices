const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { register: regService, startHeartbeat, unregister } = require('../../shared/serviceRegistry');

const app = express();
app.use(express.json());

const SERVICE_NAME = 'list-service';
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || 'localhost';
const SELF_URL = process.env.SELF_URL || `http://${HOST}:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Registro automático e heartbeat
regService(SERVICE_NAME, HOST, PORT, { url: SELF_URL, healthy: true });
const _hb = startHeartbeat(SERVICE_NAME, HOST, PORT, SELF_URL, 30_000);
process.on('SIGINT', () => { try { clearInterval(_hb); unregister(SERVICE_NAME, HOST, PORT); } finally { process.exit(0); } });
process.on('SIGTERM', () => { try { clearInterval(_hb); unregister(SERVICE_NAME, HOST, PORT); } finally { process.exit(0); } });

const { JsonCollection } = require('../../shared/JsonDatabase');
const listsCol = new JsonCollection('lists');

// Middleware de autenticação
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

// Utilitário para calcular resumo
function calcSummary(list) {
  const totalItems = list.items.length;
  const purchasedItems = list.items.filter(i => i.purchased).length;
  const estimatedTotal = list.items.reduce((sum, i) => sum + (i.estimatedPrice * i.quantity), 0);
  return { totalItems, purchasedItems, estimatedTotal };
}

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', service: SERVICE_NAME }));

// Criar nova lista
app.post('/lists', auth, (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const now = Date.now();
  const list = listsCol.insert({
    userId: req.user.id,
    name,
    description,
    status: 'active',
    items: [],
    summary: { totalItems: 0, purchasedItems: 0, estimatedTotal: 0 },
    createdAt: now,
    updatedAt: now
  });
  res.status(201).json(list);
});

// Listar listas do usuário
app.get('/lists', auth, (req, res) => {
  const userLists = listsCol.findAll(l => l.userId === req.user.id);
  res.json(userLists);
});

// Buscar lista específica
app.get('/lists/:id', auth, (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  res.json(list);
});

// Atualizar lista (nome, descrição)
app.put('/lists/:id', auth, (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  const patch = {};
  if (req.body.name !== undefined) patch.name = req.body.name;
  if (req.body.description !== undefined) patch.description = req.body.description;
  if (req.body.status !== undefined) patch.status = req.body.status;
  patch.updatedAt = Date.now();
  const updated = listsCol.update(list.id, patch);
  res.json(updated);
});

// Deletar lista
app.delete('/lists/:id', auth, (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  listsCol.delete(list.id);
  res.status(204).end();
});

// Adicionar item à lista
app.post('/lists/:id/items', auth, async (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  const { itemId, quantity = 1, notes = '' } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId obrigatório' });
  try {
    const { data: item } = await axios.get(`http://localhost:3002/items/${itemId}`);
    const now = Date.now();
    const listItem = {
      itemId: item.id,
      itemName: item.name,
      quantity,
      unit: item.unit,
      estimatedPrice: item.averagePrice,
      purchased: false,
      notes,
      addedAt: now
    };
    const items = [...(list.items || []), listItem];
    const summary = calcSummary({ ...list, items });
    const updated = listsCol.update(list.id, { items, summary, updatedAt: now });
    res.status(201).json(listItem);
  } catch (err) {
    res.status(404).json({ error: 'Item não encontrado no Item Service' });
  }
});

// Atualizar item na lista
app.put('/lists/:id/items/:itemId', auth, (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  const items = (list.items || []).map(i => {
    if (i.itemId === req.params.itemId) {
      const updated = { ...i };
      ['quantity', 'unit', 'estimatedPrice', 'purchased', 'notes'].forEach(f => {
        if (req.body[f] !== undefined) updated[f] = req.body[f];
      });
      return updated;
    }
    return i;
  });
  const item = items.find(i => i.itemId === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item não encontrado na lista' });
  const summary = calcSummary({ ...list, items });
  const updatedList = listsCol.update(list.id, { items, summary, updatedAt: Date.now() });
  res.json(item);
});

// Remover item da lista
app.delete('/lists/:id/items/:itemId', auth, (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  const items = (list.items || []).filter(i => i.itemId !== req.params.itemId);
  if (items.length === (list.items || []).length) return res.status(404).json({ error: 'Item não encontrado na lista' });
  const summary = calcSummary({ ...list, items });
  listsCol.update(list.id, { items, summary, updatedAt: Date.now() });
  res.status(204).end();
});

// Resumo da lista
app.get('/lists/:id/summary', auth, (req, res) => {
  const list = listsCol.findById(req.params.id);
  if (!list || list.userId !== req.user.id) return res.status(404).json({ error: 'Lista não encontrada' });
  res.json(list.summary);
});

// 404 e erro
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});

module.exports = app;