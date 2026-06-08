// Generate PDF-ready HTML for invoices
const { TEMPLATES } = require('./invoice');

function renderInvoice(invoice) {
  const t = TEMPLATES[invoice.template] || TEMPLATES.modern;
  const c = t.colors;
  const currencySymbol = getCurrencySymbol(invoice.currency);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice #${invoice.number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: ${c.text};
    background: #fff;
    padding: 48px 56px;
    max-width: 800px;
    margin: 0 auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 48px;
    padding-bottom: 32px;
    border-bottom: 2px solid ${c.highlight};
  }
  .header-left h1 {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: ${c.text};
    margin-bottom: 4px;
  }
  .header-left .invoice-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: ${c.highlight};
    font-weight: 700;
  }
  .header-right {
    text-align: right;
    font-size: 13px;
    line-height: 1.6;
  }
  .header-right .company {
    font-weight: 700;
    font-size: 16px;
    margin-bottom: 4px;
  }
  .parties {
    display: flex;
    gap: 64px;
    margin-bottom: 40px;
  }
  .party {
    flex: 1;
  }
  .party h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #888;
    margin-bottom: 8px;
    font-weight: 700;
  }
  .party .name {
    font-weight: 700;
    font-size: 15px;
    margin-bottom: 4px;
  }
  .party .detail {
    font-size: 12px;
    color: #555;
    line-height: 1.5;
  }
  .meta {
    display: flex;
    gap: 48px;
    margin-bottom: 32px;
    font-size: 12px;
  }
  .meta-item { }
  .meta-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #888;
    font-weight: 600;
  }
  .meta-value {
    font-weight: 600;
    font-size: 13px;
    margin-top: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 32px;
  }
  th {
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #888;
    padding: 10px 0;
    border-bottom: 1px solid #e0e0e0;
  }
  th.right, td.right { text-align: right; }
  td {
    padding: 10px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
  }
  td .item-desc { font-weight: 500; }
  .totals {
    margin-left: auto;
    width: 280px;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;
    border-bottom: 1px solid #f0f0f0;
  }
  .totals-row.total {
    border-top: 2px solid ${c.text};
    border-bottom: none;
    font-weight: 800;
    font-size: 18px;
    padding-top: 10px;
    margin-top: 4px;
  }
  .notes {
    margin-top: 40px;
    font-size: 12px;
    color: #888;
    line-height: 1.5;
  }
  .notes strong {
    color: #555;
  }
  .footer {
    margin-top: 56px;
    padding-top: 16px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    font-size: 11px;
    color: #aaa;
  }
  @media print {
    body { padding: 24px; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    <span class="invoice-label">Invoice</span>
    <h1>#${String(invoice.number).padStart(4, '0')}</h1>
  </div>
  <div class="header-right">
    ${invoice.from.logo ? `<img src="${invoice.from.logo}" style="max-height:40px;margin-bottom:8px;"><br>` : ''}
    <div class="company">${esc(invoice.from.name)}</div>
    <div>${esc(invoice.from.email)}</div>
    <div>${esc(invoice.from.address)}</div>
    ${invoice.from.phone ? `<div>${esc(invoice.from.phone)}</div>` : ''}
  </div>
</div>

<div class="parties">
  <div class="party">
    <h3>Bill To</h3>
    <div class="name">${esc(invoice.to.name)}</div>
    <div class="detail">
      ${invoice.to.email ? esc(invoice.to.email) + '<br>' : ''}
      ${esc(invoice.to.address)}<br>
      ${invoice.to.phone ? esc(invoice.to.phone) : ''}
    </div>
  </div>
  <div class="party">
    <h3>From</h3>
    <div class="name">${esc(invoice.from.name)}</div>
    <div class="detail">
      ${esc(invoice.from.email)}<br>
      ${esc(invoice.from.address)}
    </div>
  </div>
</div>

<div class="meta">
  <div class="meta-item">
    <div class="meta-label">Date</div>
    <div class="meta-value">${fmtDate(invoice.date)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Due Date</div>
    <div class="meta-value">${fmtDate(invoice.dueDate)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Status</div>
    <div class="meta-value" style="color:${invoice.status==='paid'?'#3fb950':'#d2991d'};text-transform:uppercase">${invoice.status}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th class="right">Qty</th>
      <th class="right">Rate</th>
      <th class="right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${(invoice.items || []).map(item => `
      <tr>
        <td><span class="item-desc">${esc(item.description)}</span></td>
        <td class="right">${item.quantity}</td>
        <td class="right">${currencySymbol}${item.rate.toFixed(2)}</td>
        <td class="right">${currencySymbol}${item.amount.toFixed(2)}</td>
      </tr>
    `).join('')}
  </tbody>
</table>

<div class="totals">
  <div class="totals-row">
    <span>Subtotal</span>
    <span>${currencySymbol}${invoice.subtotal.toFixed(2)}</span>
  </div>
  ${invoice.discountAmount > 0 ? `
  <div class="totals-row">
    <span>Discount</span>
    <span>-${currencySymbol}${invoice.discountAmount.toFixed(2)}</span>
  </div>` : ''}
  ${invoice.taxAmount > 0 ? `
  <div class="totals-row">
    <span>Tax (${invoice.taxRate}%)</span>
    <span>${currencySymbol}${invoice.taxAmount.toFixed(2)}</span>
  </div>` : ''}
  <div class="totals-row total">
    <span>Total</span>
    <span>${currencySymbol}${invoice.total.toFixed(2)}</span>
  </div>
</div>

${invoice.notes ? `
<div class="notes">
  <strong>Notes</strong><br>
  ${esc(invoice.notes)}
</div>` : ''}

<div class="footer">
  Created with <strong>InvoiceForge</strong> &mdash; Free invoice generator &middot; invoiceforge-production-3495.up.railway.app
</div>

</body></html>`;
}

function getCurrencySymbol(code) {
  const symbols = {
    USD: '$', EUR: '€', GBP: '£', CNY: '¥', JPY: '¥',
    CAD: 'C$', AUD: 'A$', INR: '₹', KRW: '₩',
  };
  return symbols[code] || code + ' ';
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

module.exports = { renderInvoice };
