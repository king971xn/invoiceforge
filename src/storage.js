// JSON file-based storage
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

class Storage {
  constructor(name) {
    this.file = path.join(DATA_DIR, `${name}.json`);
    this._ensure();
  }

  _ensure() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, '[]');
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return [];
    }
  }

  _write(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }

  all() { return this._read(); }

  get(id) {
    return this._read().find(item => item.id === id) || null;
  }

  create(item) {
    const data = this._read();
    item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    item.createdAt = new Date().toISOString();
    item.updatedAt = item.createdAt;
    data.push(item);
    this._write(data);
    return item;
  }

  update(id, updates) {
    const data = this._read();
    const idx = data.findIndex(item => item.id === id);
    if (idx === -1) return null;
    data[idx] = { ...data[idx], ...updates, id, updatedAt: new Date().toISOString() };
    this._write(data);
    return data[idx];
  }

  delete(id) {
    const data = this._read();
    const filtered = data.filter(item => item.id !== id);
    this._write(filtered);
    return filtered.length < data.length;
  }

  count() { return this._read().length; }
}

module.exports = Storage;
