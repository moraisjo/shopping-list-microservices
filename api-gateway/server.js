const express = require('express');
const fs = require('fs');
const path = require('path');
const registry = require('../shared/serviceRegistry');

const app = express();
const PORT = process.env.PORT || 3000;

// Logs de requisição
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use(express.json());

// Service discovery via arquivo compartilhado
const REGISTRY_PATH = path.resolve(__dirname, '../shared/services.json');
function readRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function getServiceUrl(name) {
  // 1) Tenta via serviceRegistry (dinâmico)
  try {
    const instances = registry.get(name);
    if (Array.isArray(instances) && instances.length > 0) {
      const inst = instances[0];
      if (inst?.meta?.url) return inst.meta.url;
      if (inst?.host && inst?.port) return `http://${inst.host}:${inst.port}`;
    }
  } catch {}
  // 2) Fallback para services.json estático
  const reg = readRegistry();
  const v = reg[name];
  return typeof v === 'string' ? v : v?.url;
}

// Circuit breaker simples por serviço
const circuits = {
  'user-service': { failures: 0, openUntil: 0, lastError: null, state: 'closed' },
  'item-service': { failures: 0, openUntil: 0, lastError: null, state: 'closed' },
  'list-service': { failures: 0, openUntil: 0, lastError: null, state: 'closed' }
};
const MAX_FAILURES = 3;
const OPEN_MS = 30_000;

function ensureCircuit(name) {
  if (!circuits[name]) circuits[name] = { failures: 0, openUntil: 0, lastError: null, state: 'closed' };
  return circuits[name];
}
function isOpen(name) {
  const c = ensureCircuit(name);
  if (Date.now() < c.openUntil) return true;
  // janela terminou: permitir tentativa (half-open)
  return false;
}
function recordSuccess(name) {
  const c = ensureCircuit(name);
  c.failures = 0;
  c.openUntil = 0;
  c.lastError = null;
  c.state = 'closed';
}
function recordFailure(name, errMessage) {
  const c = ensureCircuit(name);
  c.failures += 1;
  c.lastError = errMessage || 'unknown';
  if (c.failures >= MAX_FAILURES) {
    c.openUntil = Date.now() + OPEN_MS;
    c.state = 'open';
  }
}

// fetch (Node >= 18 usa global; se <18, instalar node-fetch@2 e ajustar)
let _fetch = globalThis.fetch;
if (!_fetch) {
  _fetch = (...args) => import('node-fetch').then(m => m.default(...args));
}

// Proxy mínimo para serviços
function proxyHandler(serviceName) {
  return async (req, res) => {
    const baseUrl = getServiceUrl(serviceName);
    if (!baseUrl) return res.status(503).json({ error: `Serviço ${serviceName} não registrado` });

    // Circuit breaker
    if (isOpen(serviceName)) {
      const c = ensureCircuit(serviceName);
      return res.status(503).json({ error: 'Circuit open', retryAfterMs: Math.max(0, c.openUntil - Date.now()), lastError: c.lastError });
    }

    // Reescreve removendo apenas /api
    const destPath = req.originalUrl.replace(/^\/api/, '');
    const targetUrl = baseUrl + destPath;

    try {
      const method = req.method;
      const headers = {
        'content-type': req.headers['content-type'] || 'application/json',
        'authorization': req.headers['authorization'] || ''
      };
      const hasBody = !['GET', 'HEAD'].includes(method);
      const body = hasBody ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})) : undefined;

      const r = await _fetch(targetUrl, { method, headers, body });
      const text = await r.text();

      // Considera falha para 5xx apenas (4xx são erros do cliente e não devem abrir o circuito)
      if (r.status >= 500) recordFailure(serviceName, `upstream status ${r.status}`);
      else recordSuccess(serviceName);

      res.status(r.status);
      const ct = r.headers.get('content-type') || 'application/json';
      res.set('content-type', ct);
      return res.send(text);
    } catch (e) {
      recordFailure(serviceName, e.message);
      return res.status(502).json({ error: 'Bad gateway', detail: e.message });
    }
  };
}

// Roteamento necessário
app.use('/api/auth', proxyHandler('user-service'));
app.use('/api/users', proxyHandler('user-service'));
app.use('/api/items', proxyHandler('item-service'));
app.use('/api/lists', proxyHandler('list-service'));

// Health checks automáticos a cada 30s
async function checkService(name, path = '/health') {
  const base = getServiceUrl(name);
  if (!base) return;
  try {
    const r = await _fetch(base + path);
    if (r.ok) recordSuccess(name);
    else recordFailure(name, `health status ${r.status}`);
  } catch (e) {
    recordFailure(name, e.message);
  }
}
setInterval(() => {
  checkService('user-service', '/health');
  checkService('item-service', '/health');
  checkService('list-service', '/health');
}, 30_000);

// Helpers para endpoints agregados
function decodeJwtIdFromAuth(header) {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && payload.id ? String(payload.id) : null;
  } catch {
    return null;
  }
}

// Endpoints do gateway
app.get('/health', async (_req, res) => {
  const now = Date.now();
  const status = {};
  for (const name of Object.keys(circuits)) {
    const c = ensureCircuit(name);
    status[name] = {
      state: c.state,
      failures: c.failures,
      openForMs: Math.max(0, c.openUntil - now),
      lastError: c.lastError
    };
  }
  res.json({ service: 'api-gateway', status: 'ok', circuits: status });
});

app.get('/registry', (_req, res) => {
  res.json(readRegistry());
});

// Dashboard simples: agrega dados do usuário + contagens
app.get('/api/dashboard', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const userId = decodeJwtIdFromAuth(authHeader);
  const REG = readRegistry();
  const userBase = REG['user-service'];
  const itemBase = REG['item-service'];
  const listBase = REG['list-service'];

  if (!itemBase || !listBase || !userBase) {
    return res.status(503).json({ error: 'Serviços ausentes no registry' });
  }

  try {
    const fetches = [];

    // Items count
    if (!isOpen('item-service')) {
      fetches.push(_fetch(itemBase + '/items')
        .then(async r => {
          const arr = r.ok ? await r.json() : [];
          if (r.status >= 500) recordFailure('item-service', `status ${r.status}`); else recordSuccess('item-service');
          return { itemsCount: Array.isArray(arr) ? arr.length : 0 };
        })
        .catch(e => { recordFailure('item-service', e.message); return { itemsCount: 0 }; }));
    } else {
      const c = ensureCircuit('item-service');
      fetches.push(Promise.resolve({ itemsCount: 0, itemCircuit: { open: true, retryAfterMs: Math.max(0, c.openUntil - Date.now()) } }));
    }

    // Lists count (requer auth). Sem token, devolve 0 sem consultar o serviço
    if (authHeader && !isOpen('list-service')) {
      fetches.push(_fetch(listBase + '/lists', { headers: { authorization: authHeader } })
        .then(async r => {
          if (r.status === 401 || r.status === 403) { recordSuccess('list-service'); return { listsCount: 0 }; }
          const arr = r.ok ? await r.json() : [];
          if (r.status >= 500) recordFailure('list-service', `status ${r.status}`); else recordSuccess('list-service');
          return { listsCount: Array.isArray(arr) ? arr.length : 0 };
        })
        .catch(e => { recordFailure('list-service', e.message); return { listsCount: 0 }; }));
    } else if (isOpen('list-service')) {
      const c = ensureCircuit('list-service');
      fetches.push(Promise.resolve({ listsCount: 0, listCircuit: { open: true, retryAfterMs: Math.max(0, c.openUntil - Date.now()) } }));
    } else {
      fetches.push(Promise.resolve({ listsCount: 0 }));
    }

    // User info (se houver token com id)
    if (userId && !isOpen('user-service')) {
      fetches.push(_fetch(`${userBase}/users/${encodeURIComponent(userId)}`, { headers: { authorization: authHeader } })
        .then(async r => {
          const data = await r.json().catch(() => null);
          if (r.status >= 500) recordFailure('user-service', `status ${r.status}`); else recordSuccess('user-service');
          return { user: data, userStatus: r.status };
        })
        .catch(e => { recordFailure('user-service', e.message); return { user: null }; }));
    } else if (isOpen('user-service')) {
      const c = ensureCircuit('user-service');
      fetches.push(Promise.resolve({ user: null, userCircuit: { open: true, retryAfterMs: Math.max(0, c.openUntil - Date.now()) } }));
    } else {
      fetches.push(Promise.resolve({ user: null }));
    }

    const parts = await Promise.all(fetches);
    const out = Object.assign({}, ...parts);
    return res.json({
      service: 'api-gateway',
      dashboard: {
        user: out.user || null,
        stats: { items: out.itemsCount || 0, lists: out.listsCount || 0 }
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'dashboard_failed', detail: e.message });
  }
});

// Busca global simples: itens (via /search) + listas (filtro por nome)
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ items: [], lists: [] });
  const REG = readRegistry();
  const itemBase = REG['item-service'];
  const listBase = REG['list-service'];
  const authHeader = req.headers['authorization'] || '';
  if (!itemBase || !listBase) return res.status(503).json({ error: 'Serviços ausentes no registry' });

  try {
    const promises = [];
    // Items: usa endpoint próprio de search do item-service
    if (!isOpen('item-service')) {
      promises.push(_fetch(`${itemBase}/search?q=${encodeURIComponent(q)}`)
        .then(async r => { const data = r.ok ? await r.json() : []; if (r.status >= 500) recordFailure('item-service', `status ${r.status}`); else recordSuccess('item-service'); return { items: Array.isArray(data) ? data : [] }; })
        .catch(e => { recordFailure('item-service', e.message); return { items: [] }; }));
    } else {
      promises.push(Promise.resolve({ items: [] }));
    }

    // Lists: requer auth; puxa todas e filtra por nome
    if (authHeader && !isOpen('list-service')) {
      promises.push(_fetch(`${listBase}/lists`, { headers: { authorization: authHeader } })
        .then(async r => {
          if (r.status === 401 || r.status === 403) { recordSuccess('list-service'); return { lists: [] }; }
          const data = r.ok ? await r.json() : [];
          if (r.status >= 500) recordFailure('list-service', `status ${r.status}`); else recordSuccess('list-service');
          const term = q.toLowerCase();
          const lists = Array.isArray(data) ? data.filter(l => String(l.name || '').toLowerCase().includes(term)) : [];
          return { lists };
        })
        .catch(e => { recordFailure('list-service', e.message); return { lists: [] }; }));
    } else if (isOpen('list-service')) {
      promises.push(Promise.resolve({ lists: [] }));
    } else {
      promises.push(Promise.resolve({ lists: [] }));
    }

    const parts = await Promise.all(promises);
    const merged = parts.reduce((acc, p) => ({ items: acc.items.concat(p.items || []), lists: acc.lists.concat(p.lists || []) }), { items: [], lists: [] });
    return res.json(merged);
  } catch (e) {
    return res.status(500).json({ error: 'search_failed', detail: e.message });
  }
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`API Gateway ouvindo na porta ${PORT}`);
});

