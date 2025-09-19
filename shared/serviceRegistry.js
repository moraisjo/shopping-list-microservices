// Registro de serviços simples baseado em arquivo JSON.
// Cada serviço chama register(serviceName, host, port).
// get(serviceName) retorna instâncias (array).
// list() retorna o snapshot completo.

const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, 'service-registry.json');

if (!fs.existsSync(REGISTRY_FILE)) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ services: {} }, null, 2));
}

function _load() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return { services: {} };
  }
}

function _save(data) {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

function register(name, host, port, meta = {}) {
  const data = _load();
  if (!data.services[name]) data.services[name] = [];
  const existingIdx = data.services[name].findIndex(
    s => s.host === host && s.port === port
  );
  const now = Date.now();
  const entry = {
    name,
    host,
    port,
    meta,
    lastHeartbeat: now
  };
  if (existingIdx >= 0) {
    data.services[name][existingIdx] = entry;
  } else {
    data.services[name].push(entry);
  }
  _save(data);
  return entry;
}

function heartbeat(name, host, port) {
  const data = _load();
  const list = data.services[name] || [];
  const svc = list.find(s => s.host === host && s.port === port);
  if (svc) {
    svc.lastHeartbeat = Date.now();
    _save(data);
    return true;
  }
  return false;
}

function unregister(name, host, port) {
  const data = _load();
  if (!data.services[name]) return false;
  const before = data.services[name].length;
  data.services[name] = data.services[name].filter(s => !(s.host === host && s.port === port));
  if (data.services[name].length === 0) delete data.services[name];
  _save(data);
  return data.services[name] ? data.services[name].length < before : before > 0;
}

function get(name) {
  const data = _load();
  return data.services[name] || [];
}

function list() {
  return _load().services;
}

function cleanup(ttlMs = 60_000) {
  const data = _load();
  const now = Date.now();
  Object.keys(data.services).forEach(name => {
    data.services[name] = data.services[name].filter(
      s => (now - s.lastHeartbeat) < ttlMs
    );
    if (data.services[name].length === 0) {
      delete data.services[name];
    }
  });
  _save(data);
}

function startHeartbeat(name, host, port, url, intervalMs = 30_000) {
  async function tick() {
    let healthy = true;
    try {
      const _f = globalThis.fetch || (await import('node-fetch').then(m => m.default));
      const r = await _f(`${url}/health`);
      healthy = r.ok;
    } catch {
      healthy = false;
    }
    // Reutiliza register para atualizar meta + heartbeat
    register(name, host, port, { url, healthy });
  }
  tick();
  const id = setInterval(tick, intervalMs);
  return id;
}

module.exports = {
  register,
  heartbeat,
  unregister,
  get,
  list,
  cleanup,
  startHeartbeat
};