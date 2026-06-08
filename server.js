// InvoiceForge Server
const express = require('express');
const path = require('path');
const invoiceEngine = require('./src/invoice');
const clients = require('./src/clients');
const { renderInvoice } = require('./src/pdf');
const promo = require('./src/promo');
const analytics = require('./src/analytics');
const app = express();
const PORT = process.env.PORT || 3457;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Track page views (lightweight analytics)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/css') && !req.path.startsWith('/js')) {
    try { analytics.track(req.path); } catch {}
  }
  next();
});

// Simple XML escape helper
function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Landing Page (SEO-optimized marketing page) ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// --- Privacy & Terms ---
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// --- Blog ---
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html'));
});
app.get('/blog/:slug', (req, res) => {
  const slug = req.params.slug;
  const blogDir = path.join(__dirname, 'public', 'blog');
  res.sendFile(path.join(blogDir, `${slug}.html`), (err) => {
    if (err) res.status(404).sendFile(path.join(blogDir, '404.html'));
  });
});

// --- Sitemap ---
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = process.env.BASE_URL || 'https://invoiceforge-production-3495.up.railway.app';
  const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/app', priority: '0.9', changefreq: 'monthly' },
    { loc: '/blog', priority: '0.8', changefreq: 'weekly' },
  ];
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map(p => `  <url><loc>${baseUrl}${p.loc}</loc><priority>${p.priority}</priority><changefreq>${p.changefreq}</changefreq></url>`),
    '</urlset>',
  ].join('\n');
  res.type('application/xml').send(xml);
});

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
// Serve the SPA app at /app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// SPA nested routes under /app

// --- robots.txt ---
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.BASE_URL || 'https://invoiceforge-production-3495.up.railway.app';
  const txt = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join('\n');
  res.type('text/plain').send(txt);
});

// --- Promotion API (social media templates) ---
app.get('/api/promo/weekly', (req, res) => {
  res.json({
    posts: promo.generateWeeklyPosts(),
    calendar: promo.getCalendar(),
  });
});
app.get('/api/promo/post', (req, res) => {
  const platform = req.query.platform || 'twitter';
  const index = parseInt(req.query.index) || 0;
  res.json({
    platform,
    content: promo.generatePost(platform, index),
  });
});

// --- OG Image (dynamic social share image) ---
app.get('/og-image.png', (req, res) => {
  const title = req.query.title || 'Professional Invoice Generator';
  const subtitle = req.query.subtitle || 'Create, manage, and export invoices as PDF. Free to start.';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#4f46e5"/><stop offset="100%" style="stop-color:#7c3aed"/></linearGradient></defs>
    <rect width="1200" height="630" fill="#1a1a2e"/>
    <rect width="1200" height="630" fill="url(#g)" opacity="0.15"/>
    <text x="80" y="180" font-family="system-ui,sans-serif" font-size="64" font-weight="800" fill="#ffffff">${escapeXml(title)}</text>
    <text x="80" y="240" font-family="system-ui,sans-serif" font-size="28" fill="#a5b4fc">${escapeXml(subtitle)}</text>
    <rect x="80" y="340" width="240" height="56" rx="8" fill="#4f46e5"/>
    <text x="200" y="376" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">Start Free →</text>
    <text x="80" y="480" font-family="system-ui,sans-serif" font-size="22" fill="#6b7280">3 free invoices/month • No sign-up • PDF export</text>
    <text x="80" y="560" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#818cf8">◆ InvoiceForge</text>
  </svg>`;
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

// Export for Vercel; listen for local dev

// --- Analytics API ---
app.get('/api/analytics', (req, res) => {
  res.json(analytics.summary());
});

// --- Promo Dashboard (for operator use) ---
app.get('/promo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'promo.html'));
});
module.exports = app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`InvoiceForge running on http://localhost:${PORT}`);
    console.log(`Free tier: 3 invoices/month`);
  });
}
