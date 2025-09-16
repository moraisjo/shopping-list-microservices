// Banco NoSQL simplificado baseado em arquivos JSON (uma coleção = um arquivo)
// Uso:
// const { JsonCollection } = require('../../shared/JsonDatabase');
// const users = new JsonCollection('users');
// users.insert({...});
// users.findOne({ email: 'a@a.com' });

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto'); // substitui uuid

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

class JsonCollection {
  constructor(name) {
    this.name = name;
    this.file = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, '[]');
    }
    this._cache = null;
    this._lastLoad = 0;
    this.maxCacheMs = 1000; // simples cache de 1s para reduzir I/O
  }

  _load(force = false) {
    if (
      force ||
      !this._cache ||
      (Date.now() - this._lastLoad) > this.maxCacheMs
    ) {
      const raw = fs.readFileSync(this.file, 'utf-8');
      try {
        this._cache = JSON.parse(raw);
      } catch {
        this._cache = [];
      }
      this._lastLoad = Date.now();
    }
    return this._cache;
  }

  _persist() {
    fs.writeFileSync(this.file, JSON.stringify(this._cache, null, 2));
  }

  findAll(filterFn = null) {
    const data = this._load();
    return filterFn ? data.filter(filterFn) : [...data];
  }

  findById(id) {
    return this._load().find(d => d.id === id) || null;
  }

  findOne(queryObj) {
    const keys = Object.keys(queryObj);
    return this._load().find(doc =>
      keys.every(k => doc[k] === queryObj[k])
    ) || null;
  }

  insert(doc) {
    const data = this._load();
    const now = Date.now();
    const newDoc = {
      id: doc.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...doc
    };
    data.push(newDoc);
    this._persist();
    return newDoc;
  }

  update(id, patch) {
    const data = this._load();
    const idx = data.findIndex(d => d.id === id);
    if (idx === -1) return null;
    data[idx] = {
      ...data[idx],
      ...patch,
      updatedAt: Date.now()
    };
    this._persist();
    return data[idx];
  }

  delete(id) {
    const data = this._load();
    const idx = data.findIndex(d => d.id === id);
    if (idx === -1) return false;
    data.splice(idx, 1);
    this._persist();
    return true;
  }
}

module.exports = {
  JsonCollection
};