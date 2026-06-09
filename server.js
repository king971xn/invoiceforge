// InvoiceForge Server
const express = require('express');
const path = require('path');
const fs = require('fs');
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

// --- Markdown front matter parser (reads YAML-like --- blocks) ---
function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val.startsWith('[') && val.endsWith(']')) {
      try { val = JSON.parse(val); } catch {}
    }
    fm[m[1]] = val;
  }
  return fm;
}

// --- Lightweight Markdown-to-HTML converter (no external deps) ---
function mdToHtml(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^---$/gm, '<hr>');

  const blocks = html.split('\n');
  const out = [];
  let inList = false, inParagraph = false;

  for (const rawLine of blocks) {
    let line = rawLine;
    const isTagLine = /^<(h[1-4]|ul|ol|li|hr|div|p|blockquote|pre|table|script)/.test(line);
    const isListItem = /^[-*]\s/.test(line);
    const isOrderedItem = /^\d+\.\s/.test(line);
    const isEmpty = line.trim() === '';

    if (isListItem) {
      if (!inList) { out.push('<ul>'); inList = 'ul'; }
      if (inParagraph) { out.push('</p>'); inParagraph = false; }
      line = '<li>' + line.replace(/^[-*]\s+/, '') + '</li>';
    } else if (isOrderedItem) {
      if (!inList) { out.push('<ol>'); inList = 'ol'; }
      if (inParagraph) { out.push('</p>'); inParagraph = false; }
      line = '<li>' + line.replace(/^\d+\.\s+/, '') + '</li>';
    } else {
      if (inList) { out.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = false; }
    }

    if (isTagLine) {
      if (inParagraph) { out.push('</p>'); inParagraph = false; }
      out.push(line);
    } else if (isEmpty) {
      if (inParagraph) { out.push('</p>'); inParagraph = false; }
    } else if (!isListItem && !isOrderedItem) {
      if (!inParagraph) { out.push('<p>'); inParagraph = true; } else { out.push(' '); }
      out.push(line);
    }
  }
  if (inParagraph) out.push('</p>');
  if (inList) out.push(inList === 'ul' ? '</ul>' : '</ol>');

  return out.join('\n');
}

// --- Article page HTML template ---
function articlePageHtml(title, description, bodyHtml) {
  const desc = escapeXml(description || '');
  const t = escapeXml(title || 'Blog Post');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t} | InvoiceForge Blog</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index, follow">
<link rel="stylesheet" href="/css/landing.css">
<link rel="stylesheet" href="/css/blog.css">
</head>
<body>
<header class="nav">
<div class="nav-inner">
<a href="/" class="logo"><span class="logo-icon">&#9670;</span> InvoiceForge</a>
<nav class="nav-links">
<a href="/app">Open App</a>
<a href="/blog">Blog</a>
</nav>
</div>
</header>
<article class="blog-article">
<div class="section-inner">
<h1>${t}</h1>
${bodyHtml}
</div>
</article>
<footer class="footer"><div class="footer-inner"><div class="footer-bottom"><p>&copy; 2026 InvoiceForge</p></div></div></footer>
</body></html>`;
}

// --- Landing Page (SEO-optimized marketing page) ---

// --- Privacy & Terms ---
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// --- Blog listing page ---
app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html'));
});

// --- Blog API: dynamic post list from content/blog/*.md ---
app.get('/api/blog-list', (req, res) => {
  const blogDir = path.join(__dirname, 'content', 'blog');
  const posts = [];
  try {
    if (!fs.existsSync(blogDir)) { res.json(posts); return; }
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(blogDir, file), 'utf-8');
      const fm = parseFrontMatter(content);
      if (fm && fm.title) {
        const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
        const body = content.replace(/^---[\s\S]*?---\r?\n*/, '');
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        posts.push({
          slug,
          title: fm.title,
          excerpt: fm.description || '',
          date: fm.date || file.slice(0, 10),
          category: (fm.keywords && fm.keywords[0])
            ? fm.keywords[0].replace(/\b\w/g, c => c.toUpperCase())
            : 'Guide',
          readTime: Math.max(1, Math.ceil(wordCount / 200)) + ' min read',
        });
      }
    }
    posts.sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) { /* content/blog/ may not exist */ }
  res.json(posts);
});

// --- Blog dynamic article: read MD from content/blog/, render as HTML ---
app.get('/blog/post/:slug', (req, res) => {
  const slug = req.params.slug;
  const blogDir = path.join(__dirname, 'content', 'blog');
  try {
    const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));
    const file = files.find(f => f.includes(slug));
    if (!file) throw new Error('not found');
    const raw = fs.readFileSync(path.join(blogDir, file), 'utf-8');
    const fm = parseFrontMatter(raw);
    const body = raw.replace(/^---[\s\S]*?---\r?\n*/, '');
    const html = mdToHtml(body);
    res.send(articlePageHtml(
      fm ? fm.title : slug.replace(/-/g, ' '),
      fm ? (fm.description || '') : '',
      html,
    ));
  } catch (e) {
    res.status(404).sendFile(path.join(__dirname, 'public', 'blog', '404.html'));
  }
});

// --- Blog static article (backward compat for pre-existing HTML files) ---
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
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
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
    <text x="200" y="376" font-family="system-ui,sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">Start Free 鈫?/text>
    <text x="80" y="480" font-family="system-ui,sans-serif" font-size="22" fill="#6b7280">3 free invoices/month 鈥?No sign-up 鈥?PDF export</text>
    <text x="80" y="560" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#818cf8">鈼?InvoiceForge</text>
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
