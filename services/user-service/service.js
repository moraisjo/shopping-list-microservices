const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JsonCollection } = require('../../shared/JsonDatabase');

const app = express();
app.use(express.json());

const SERVICE_NAME = 'user-service';
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const users = new JsonCollection('users');

function sanitize(u) {
  const { password, ...rest } = u;
  return rest;
}
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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME });
});

app.post('/auth/register', async (req, res) => {
  const { email, username, password, firstName = '', lastName = '' } = req.body;
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'email, username e password são obrigatórios' });
  }
  if (users.findOne({ email })) return res.status(409).json({ error: 'Email já cadastrado' });
  if (users.findOne({ username })) return res.status(409).json({ error: 'Username já cadastrado' });

  const hash = await bcrypt.hash(password, 10);
  const user = users.insert({
    email,
    username,
    password: hash,
    firstName,
    lastName,
    preferences: { defaultStore: '', currency: 'BRL' }
  });
  const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  res.status(201).json({ user: sanitize(user), token });
});

app.post('/auth/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier e password são obrigatórios' });
  }
  const byEmail = users.findOne({ email: identifier });
  const byUsername = byEmail ? null : users.findOne({ username: identifier });
  const user = byEmail || byUsername;
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ user: sanitize(user), token });
});

app.get('/users/:id', auth, (req, res) => {
  const { id } = req.params;
  if (id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const user = users.findById(id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(sanitize(user));
});

app.put('/users/:id', auth, (req, res) => {
  const { id } = req.params;
  if (id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const current = users.findById(id);
  if (!current) return res.status(404).json({ error: 'Usuário não encontrado' });

  const patch = {};
  if (req.body.firstName !== undefined) patch.firstName = req.body.firstName;
  if (req.body.lastName !== undefined) patch.lastName = req.body.lastName;
  if (req.body.preferences) {
    patch.preferences = {
      ...current.preferences,
      ...req.body.preferences
    };
  }
  const updated = users.update(id, patch);
  res.json(sanitize(updated));
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});

module.exports = app;
