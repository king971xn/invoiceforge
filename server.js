// InvoiceForge Server
const express = require('express');
const path = require('path');
const invoiceEngine = require('./src/invoice');
const clients = require('./src/clients');
const { renderInvoice } = require('./src/pdf');

const app = express();
const PORT = process.env.PORT || 3457;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Invoice API ---
app.get('/api/invoices', (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.clientId) filter.clientId = req.query.clientId;
  res.json(invoiceEngine.list(filter));
});

app.get('/api/invoices/:id', (req, res) => {
  const inv = invoiceEngine.get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

app.post('/api/invoices', (req, res) => {
  if (!invoiceEngine.canCreate()) {
    return res.status(429).json({
      error: 'Free tier limit reached',
      message: 'You\'ve created 3 invoices this month. Upgrade to Pro for unlimited invoices.',
      limit: 3,
      remaining: 0,
    });
  }
  const inv = invoiceEngine.create(req.body);
  res.status(201).json(inv);
});

app.put('/api/invoices/:id', (req, res) => {
  const inv = invoiceEngine.update(req.params.id, req.body);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

app.delete('/api/invoices/:id', (req, res) => {
  const ok = invoiceEngine.delete(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ success: true });
});

app.get('/api/invoices/:id/pdf', (req, res) => {
  const inv = invoiceEngine.get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const html = renderInvoice(inv);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.patch('/api/invoices/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['draft', 'sent', 'paid', 'overdue'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const inv = invoiceEngine.update(req.params.id, { status });
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

app.post('/api/invoices/:id/duplicate', (req, res) => {
  const original = invoiceEngine.get(req.params.id);
  if (!original) return res.status(404).json({ error: 'Invoice not found' });
  if (!invoiceEngine.canCreate()) {
    return res.status(429).json({ error: 'Free tier limit reached' });
  }
  const copy = { ...original };
  delete copy.id; delete copy.createdAt; delete copy.updatedAt;
  copy.status = 'draft';
  copy.date = new Date().toISOString().split('T')[0];
  copy.dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const inv = invoiceEngine.create(copy);
  res.status(201).json(inv);
});

// --- Client API ---
app.get('/api/clients', (req, res) => {
  if (req.query.search) return res.json(clients.search(req.query.search));
  res.json(clients.list());
});

app.get('/api/clients/:id', (req, res) => {
  const c = clients.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Client not found' });
  res.json(c);
});

app.post('/api/clients', (req, res) => {
  const c = clients.create(req.body);
  res.status(201).json(c);
});

app.put('/api/clients/:id', (req, res) => {
  const c = clients.update(req.params.id, req.body);
  if (!c) return res.status(404).json({ error: 'Client not found' });
  res.json(c);
});

app.delete('/api/clients/:id', (req, res) => {
  const ok = clients.delete(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Client not found' });
  res.json({ success: true });
});

// --- Dashboard ---
app.get('/api/dashboard', (req, res) => {
  res.json(invoiceEngine.getStats());
});

// --- Tier Info ---
app.get('/api/tier', (req, res) => {
  res.json({
    tier: 'free',
    limit: 3,
    used: 3 - invoiceEngine.remainingFree(),
    remaining: invoiceEngine.remainingFree(),
    features: {
      invoicesPerMonth: 3,
      clients: 'unlimited',
      templates: 3,
      pdfExport: true,
      dashboard: true,
      customBranding: false,
      recurringInvoices: false,
      teamAccess: false,
    },
    proPrice: '$9/month',
  });
});

// --- SPA fallback ---
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export for Vercel; listen for local dev
module.exports = app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`InvoiceForge running on http://localhost:${PORT}`);
    console.log(`Free tier: 3 invoices/month`);
  });
}
