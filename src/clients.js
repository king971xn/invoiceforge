// Client management
const Storage = require('./storage');

const clients = new Storage('clients');

class ClientManager {
  create(data) {
    return clients.create({
      name: data.name || '',
      company: data.company || '',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address || '',
      notes: data.notes || '',
    });
  }

  update(id, data) { return clients.update(id, data); }

  delete(id) { return clients.delete(id); }

  get(id) { return clients.get(id); }

  list() {
    return clients.all().sort((a, b) => a.name.localeCompare(b.name));
  }

  search(query) {
    const q = query.toLowerCase();
    return clients.all().filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }

  count() { return clients.count(); }
}

module.exports = new ClientManager();
