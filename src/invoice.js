// Invoice engine - core business logic
const Storage = require('./storage');

const invoices = new Storage('invoices');

// Default invoice templates
const TEMPLATES = {
  modern: {
    name: 'Modern',
    colors: { primary: '#1a1a2e', accent: '#16213e', text: '#0f3460', highlight: '#e94560' },
  },
  minimal: {
    name: 'Minimal',
    colors: { primary: '#ffffff', accent: '#f8f9fa', text: '#212529', highlight: '#0d6efd' },
  },
  bold: {
    name: 'Bold',
    colors: { primary: '#0d1117', accent: '#161b22', text: '#e6edf3', highlight: '#3fb950' },
  },
};

// Free tier: 3 invoices/month
const FREE_LIMIT = 3;

class InvoiceEngine {
  getTemplates() {
    return Object.entries(TEMPLATES).map(([id, t]) => ({ id, ...t }));
  }

  create(data) {
    const invoice = {
      number: this._nextNumber(),
      status: 'draft',
      template: data.template || 'modern',
      currency: data.currency || 'USD',
      date: data.date || new Date().toISOString().split('T')[0],
      dueDate: data.dueDate || this._dueDate(30),
      from: {
        name: data.from?.name || '',
        email: data.from?.email || '',
        address: data.from?.address || '',
        phone: data.from?.phone || '',
        logo: data.from?.logo || '',
      },
      to: {
        name: data.to?.name || '',
        email: data.to?.email || '',
        address: data.to?.address || '',
        phone: data.to?.phone || '',
      },
      items: (data.items || []).map(item => ({
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        rate: Number(item.rate) || 0,
        amount: (Number(item.quantity) || 1) * (Number(item.rate) || 0),
      })),
      taxRate: Number(data.taxRate) || 0,
      discount: Number(data.discount) || 0,
      discountType: data.discountType || 'percent',
      notes: data.notes || '',
      ...this._calcTotals(data),
    };

    return invoices.create(invoice);
  }

  update(id, data) {
    const existing = invoices.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...data };

    // Recalculate items
    if (data.items) {
      merged.items = data.items.map(item => ({
        description: item.description || '',
        quantity: Number(item.quantity) || 1,
        rate: Number(item.rate) || 0,
        amount: (Number(item.quantity) || 1) * (Number(item.rate) || 0),
      }));
    }

    const totals = this._calcTotals(merged);
    return invoices.update(id, { ...merged, ...totals });
  }

  delete(id) { return invoices.delete(id); }

  get(id) { return invoices.get(id); }

  list(filter = {}) {
    let all = invoices.all();
    if (filter.status) all = all.filter(i => i.status === filter.status);
    if (filter.clientId) all = all.filter(i => i.to?.id === filter.clientId);
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return all;
  }

  getStats() {
    const all = invoices.all();
    const paid = all.filter(i => i.status === 'paid');
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthly = paid.filter(i => {
      const d = new Date(i.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });

    const monthlyRevenue = {};
    paid.forEach(i => {
      const d = new Date(i.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + i.total;
    });

    return {
      totalInvoices: all.length,
      paidInvoices: paid.length,
      totalRevenue: paid.reduce((s, i) => s + i.total, 0),
      monthlyRevenue: monthly.reduce((s, i) => s + i.total, 0),
      outstanding: all.filter(i => i.status === 'sent' || i.status === 'draft')
        .reduce((s, i) => s + i.total, 0),
      byCurrency: this._groupByCurrency(paid),
      revenueByMonth: monthlyRevenue,
    };
  }

  // Free tier check
  canCreate() {
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthly = invoices.all().filter(i => {
      const d = new Date(i.createdAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    return monthly.length < FREE_LIMIT;
  }

  remainingFree() {
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthly = invoices.all().filter(i => {
      const d = new Date(i.createdAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    return Math.max(0, FREE_LIMIT - monthly.length);
  }

  _calcTotals(data) {
    const subtotal = (data.items || []).reduce((s, item) => {
      return s + (Number(item.quantity) || 1) * (Number(item.rate) || 0);
    }, 0);

    let discountAmount = 0;
    if (data.discountType === 'percent') {
      discountAmount = subtotal * (Number(data.discount) || 0) / 100;
    } else {
      discountAmount = Number(data.discount) || 0;
    }

    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (Number(data.taxRate) || 0) / 100;
    const total = afterDiscount + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  _nextNumber() {
    const all = invoices.all();
    const max = all.reduce((m, i) => Math.max(m, i.number || 0), 0);
    return max + 1;
  }

  _dueDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  _groupByCurrency(paid) {
    const groups = {};
    paid.forEach(i => {
      const c = i.currency || 'USD';
      groups[c] = (groups[c] || 0) + i.total;
    });
    return groups;
  }
}

module.exports = new InvoiceEngine();
module.exports.TEMPLATES = TEMPLATES;
