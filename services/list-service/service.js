const express = require('express');

const app = express();
app.use(express.json());

const SERVICE_NAME = 'list-service';
const PORT = process.env.PORT || 3003;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

// Listas demo (em memória)
let lists = [
  { id: 1, name: 'Supermercado', items: [1, 2] }
];

app.get('/lists', (_req, res) => {
  res.json(lists);
});

app.post('/lists', (req, res) => {
  const newList = { id: Date.now(), ...req.body };
  lists.push(newList);
  res.status(201).json(newList);
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});

module.exports = app;
