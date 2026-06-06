// InvoiceForge — SPA Application
(function () {
  const API = {
    async get(url) {
      const res = await fetch(url);
      if (!res.ok) throw await res.json();
      return res.json();
    },
    async post(url, data) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    async put(url, data) {
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    async del(url) {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw await res.json();
      return res.json();
    },
    async patch(url, data) {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw await res.json();
      return res.json();
    },
  };

  const main = document.getElementById('mainContent');
  const modalOverlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  const tierRemaining = document.getElementById('tierRemaining');
  const toastContainer = document.getElementById('toastContainer');

  // Navigation
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      navigate(link.dataset.view);
    });
  });

  function navigate(view, params) {
    switch (view) {
      case 'dashboard': return renderDashboard();
      case 'invoices': return params?.id ? renderInvoiceEditor(params.id) : renderInvoiceList();
      case 'clients': return renderClientList();
      case 'settings': return renderSettings();
    }
  }

  // Toast
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // Formatting
  function fmtCurrency(amount, currency = 'USD') {
    const syms = { USD: '$', EUR: '€', GBP: '£', CNY: '¥', JPY: '¥' };
    const s = syms[currency] || currency + ' ';
    return s + Number(amount).toFixed(2);
  }

  function fmtDate(d) {
    if (!d) return '--';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function statusBadge(status) {
    return `<span class="badge badge-${status}">${status}</span>`;
  }

  // Modal
  function openModal(title, bodyHtml, footerHtml) {
    modal.innerHTML = `
      <div class="modal-header">${title}</div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    `;
    modalOverlay.style.display = 'block';
    modal.style.display = 'block';
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
    modal.style.display = 'none';
  }

  modalOverlay.addEventListener('click', closeModal);

  // ========================
  // DASHBOARD
  // ========================
  async function renderDashboard() {
    main.innerHTML = '<div class="page-header"><h1 class="page-title">Dashboard</h1></div><p style="color:var(--text-muted)">Loading...</p>';

    try {
      const stats = await API.get('/api/dashboard');
      const tier = await API.get('/api/tier');

      tierRemaining.textContent = tier.remaining;

      main.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Dashboard</h1>
          <button class="btn btn-primary" onclick="window._nav('invoices')">+ New Invoice</button>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Revenue</div>
            <div class="stat-value">${fmtCurrency(stats.totalRevenue)}</div>
            <div class="stat-sub">${stats.paidInvoices} paid invoices</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">This Month</div>
            <div class="stat-value">${fmtCurrency(stats.monthlyRevenue)}</div>
            <div class="stat-sub">Revenue this month</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Outstanding</div>
            <div class="stat-value">${fmtCurrency(stats.outstanding)}</div>
            <div class="stat-sub">Unpaid invoices</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Invoices</div>
            <div class="stat-value">${stats.totalInvoices}</div>
            <div class="stat-sub">${stats.paidInvoices} paid · ${stats.totalInvoices - stats.paidInvoices} open</div>
          </div>
        </div>

        ${Object.keys(stats.revenueByMonth).length > 0 ? `
          <div class="card" style="margin-bottom:24px">
            <h3 style="font-size:13px;font-weight:600;margin-bottom:16px;color:var(--text-secondary)">Monthly Revenue</h3>
            <div id="revenueChart" style="display:flex;align-items:flex-end;gap:8px;height:140px;padding-top:8px">
              ${renderBarChart(stats.revenueByMonth)}
            </div>
          </div>
        ` : ''}

        <div class="card">
          <h3 style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-secondary)">Recent Invoices</h3>
          ${renderRecentInvoices()}
        </div>
      `;

      loadRecentInvoices();
    } catch (e) {
      main.innerHTML = `<div class="page-header"><h1 class="page-title">Dashboard</h1></div><div class="empty-state"><h3>Error loading dashboard</h3><p>${e.message || 'Unknown error'}</p></div>`;
    }
  }

  function renderBarChart(data) {
    const entries = Object.entries(data).sort().slice(-12);
    const maxVal = Math.max(...entries.map(([, v]) => v), 1);
    return entries.map(([month, val]) => {
      const h = (val / maxVal * 100).toFixed(0);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
        <span style="font-size:10px;color:var(--text-muted);font-weight:600">${fmtCurrency(val)}</span>
        <div style="width:100%;height:${h}%;background:var(--primary);border-radius:3px 3px 0 0;min-height:4px"></div>
        <span style="font-size:10px;color:var(--text-muted)">${month.slice(5)}</span>
      </div>`;
    }).join('');
  }

  async function loadRecentInvoices() {
    try {
      const invoices = await API.get('/api/invoices');
      const recent = invoices.slice(0, 5);
      const tbody = document.getElementById('recentInvoicesBody');
      if (!tbody) return;
      tbody.innerHTML = recent.map(inv => `
        <tr>
          <td><a href="#" onclick="window._nav('invoices','${inv.id}')">#${String(inv.number).padStart(4, '0')}</a></td>
          <td>${escHtml(inv.to.name || '--')}</td>
          <td>${fmtDate(inv.date)}</td>
          <td>${statusBadge(inv.status)}</td>
          <td class="amount">${fmtCurrency(inv.total, inv.currency)}</td>
        </tr>
      `).join('') || '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:20px">No invoices yet</td></tr>';
    } catch (e) { /* ignore */ }
  }

  function renderRecentInvoices() {
    return `<table class="data-table">
      <thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead>
      <tbody id="recentInvoicesBody"><tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:20px">Loading...</td></tr></tbody>
    </table>`;
  }

  // ========================
  // INVOICE LIST
  // ========================
  async function renderInvoiceList() {
    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Invoices</h1>
        <button class="btn btn-primary" onclick="window._nav('invoices','new')">+ New Invoice</button>
      </div>
      <div class="filter-bar">
        <select class="form-select" id="filterStatus" onchange="window._refreshInvoices()">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <input class="form-input" id="filterSearch" placeholder="Search invoices..." oninput="window._refreshInvoices()">
      </div>
      <div class="card">
        <table class="data-table">
          <thead><tr><th>Invoice</th><th>Client</th><th>Date</th><th>Due</th><th>Status</th><th>Amount</th><th></th></tr></thead>
          <tbody id="invoiceTableBody"><tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:20px">Loading...</td></tr></tbody>
        </table>
      </div>
    `;
    loadInvoiceList();
  }

  window._refreshInvoices = loadInvoiceList;

  async function loadInvoiceList() {
    const statusEl = document.getElementById('filterStatus');
    const searchEl = document.getElementById('filterSearch');
    const status = statusEl?.value || '';
    let invoices;
    try {
      invoices = await API.get(`/api/invoices${status ? '?status=' + status : ''}`);
    } catch (e) { return; }

    const search = (searchEl?.value || '').toLowerCase();
    if (search) {
      invoices = invoices.filter(i =>
        String(i.number).includes(search) ||
        (i.to.name || '').toLowerCase().includes(search)
      );
    }

    const tbody = document.getElementById('invoiceTableBody');
    if (!tbody) return;
    tbody.innerHTML = invoices.length === 0
      ? '<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:20px">No invoices found</td></tr>'
      : invoices.map(inv => `
        <tr>
          <td><a href="#" onclick="window._nav('invoices','${inv.id}')">#${String(inv.number).padStart(4, '0')}</a></td>
          <td>${escHtml(inv.to.name || '--')}</td>
          <td>${fmtDate(inv.date)}</td>
          <td>${fmtDate(inv.dueDate)}</td>
          <td>${statusBadge(inv.status)}</td>
          <td class="amount">${fmtCurrency(inv.total, inv.currency)}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();window._nav('invoices','${inv.id}')">Edit</button>
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();window._previewPDF('${inv.id}')">PDF</button>
            </div>
          </td>
        </tr>
      `).join('');
  }

  window._previewPDF = function (id) {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  };

  // ========================
  // INVOICE EDITOR
  // ========================
  async function renderInvoiceEditor(id) {
    const isNew = id === 'new';
    let invoice = null;

    if (!isNew) {
      try { invoice = await API.get(`/api/invoices/${id}`); }
      catch (e) { main.innerHTML = '<p>Invoice not found</p>'; return; }
    }

    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${isNew ? 'New Invoice' : 'Invoice #' + String(invoice.number).padStart(4, '0')}</h1>
        <div class="btn-group">
          ${!isNew ? `
            <button class="btn btn-secondary" onclick="window._previewPDF('${invoice.id}')">Preview PDF</button>
            <select class="form-select" id="statusSelect" style="width:140px" onchange="window._updateStatus('${invoice.id}', this.value)">
              <option value="draft" ${invoice.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="sent" ${invoice.status === 'sent' ? 'selected' : ''}>Sent</option>
              <option value="paid" ${invoice.status === 'paid' ? 'selected' : ''}>Paid</option>
              <option value="overdue" ${invoice.status === 'overdue' ? 'selected' : ''}>Overdue</option>
            </select>
            <button class="btn btn-secondary" onclick="window._duplicateInvoice('${invoice.id}')">Duplicate</button>
            <button class="btn btn-danger" onclick="window._deleteInvoice('${invoice.id}')">Delete</button>
          ` : ''}
          <button class="btn btn-primary" onclick="window._saveInvoice('${isNew ? 'new' : invoice.id}')">Save</button>
        </div>
      </div>

      <form id="invoiceForm" onsubmit="return false">
        <!-- From / To -->
        <div class="form-section">
          <div class="form-section-title">Bill From</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Your Name / Company</label>
              <input class="form-input" name="fromName" value="${escHtml(invoice?.from?.name || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-input" name="fromEmail" value="${escHtml(invoice?.from?.email || '')}">
            </div>
            <div class="form-group full">
              <label class="form-label">Address</label>
              <input class="form-input" name="fromAddress" value="${escHtml(invoice?.from?.address || '')}">
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Bill To</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Client Name</label>
              <input class="form-input" name="toName" value="${escHtml(invoice?.to?.name || '')}" list="clientList">
              <datalist id="clientList"></datalist>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-input" name="toEmail" value="${escHtml(invoice?.to?.email || '')}">
            </div>
            <div class="form-group full">
              <label class="form-label">Address</label>
              <input class="form-input" name="toAddress" value="${escHtml(invoice?.to?.address || '')}">
            </div>
          </div>
        </div>

        <!-- Details -->
        <div class="form-section">
          <div class="form-section-title">Invoice Details</div>
          <div class="form-grid form-grid-3">
            <div class="form-group">
              <label class="form-label">Date</label>
              <input class="form-input" type="date" name="date" value="${invoice?.date || new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label class="form-label">Due Date</label>
              <input class="form-input" type="date" name="dueDate" value="${invoice?.dueDate || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Currency</label>
              <select class="form-select" name="currency">
                ${['USD','EUR','GBP','CNY','JPY','CAD','AUD'].map(c =>
                  `<option value="${c}" ${(invoice?.currency || 'USD') === c ? 'selected' : ''}>${c}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Template</label>
              <select class="form-select" name="template">
                <option value="modern" ${(invoice?.template || 'modern') === 'modern' ? 'selected' : ''}>Modern</option>
                <option value="minimal" ${(invoice?.template) === 'minimal' ? 'selected' : ''}>Minimal</option>
                <option value="bold" ${(invoice?.template) === 'bold' ? 'selected' : ''}>Bold</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Line Items -->
        <div class="form-section">
          <div class="form-section-title">Items</div>
          <table class="items-table">
            <thead><tr>
              <th class="item-desc">Description</th>
              <th class="item-qty">Qty</th>
              <th class="item-rate">Rate</th>
              <th class="item-amount">Amount</th>
              <th class="item-action"></th>
            </tr></thead>
            <tbody id="itemsBody"></tbody>
          </table>
          <button class="btn btn-sm btn-secondary" type="button" onclick="window._addItem()">+ Add Item</button>

          <div class="totals-summary" id="totalsSummary"></div>
        </div>

        <!-- Notes & Tax -->
        <div class="form-section">
          <div class="form-section-title">Additional</div>
          <div class="form-grid form-grid-3">
            <div class="form-group">
              <label class="form-label">Tax Rate (%)</label>
              <input class="form-input" type="number" name="taxRate" value="${invoice?.taxRate || 0}" step="0.1" min="0" onchange="window._recalcTotals()">
            </div>
            <div class="form-group">
              <label class="form-label">Discount (%)</label>
              <input class="form-input" type="number" name="discount" value="${invoice?.discount || 0}" step="0.1" min="0" onchange="window._recalcTotals()">
            </div>
          </div>
          <div class="form-group" style="margin-top:12px">
            <label class="form-label">Notes</label>
            <textarea class="form-textarea" name="notes" rows="2">${escHtml(invoice?.notes || '')}</textarea>
          </div>
        </div>
      </form>
    `;

    // Populate items
    window._invoiceItems = invoice?.items || [{ description: '', quantity: 1, rate: 0 }];
    window._renderItems();
    window._recalcTotals();

    // Load client autocomplete
    loadClientAutocomplete();
  }

  window._invoiceItems = [];

  window._renderItems = function () {
    const tbody = document.getElementById('itemsBody');
    if (!tbody) return;
    tbody.innerHTML = window._invoiceItems.map((item, i) => `
      <tr>
        <td><input class="form-input" value="${escHtml(item.description)}" onchange="window._updateItem(${i},'description',this.value)" placeholder="Service or product"></td>
        <td><input class="form-input" type="number" value="${item.quantity}" min="1" onchange="window._updateItem(${i},'quantity',this.value);window._recalcTotals()"></td>
        <td><input class="form-input" type="number" value="${item.rate}" min="0" step="0.01" onchange="window._updateItem(${i},'rate',this.value);window._recalcTotals()"></td>
        <td><span class="item-amount-display">${fmtCurrency(item.quantity * item.rate)}</span></td>
        <td><button class="btn-icon" onclick="window._removeItem(${i})" title="Remove">✕</button></td>
      </tr>
    `).join('');
  };

  window._updateItem = function (i, field, value) {
    window._invoiceItems[i][field] = field === 'description' ? value : Number(value) || 0;
    window._renderItems();
    window._recalcTotals();
  };

  window._addItem = function () {
    window._invoiceItems.push({ description: '', quantity: 1, rate: 0 });
    window._renderItems();
  };

  window._removeItem = function (i) {
    if (window._invoiceItems.length <= 1) return;
    window._invoiceItems.splice(i, 1);
    window._renderItems();
    window._recalcTotals();
  };

  window._recalcTotals = function () {
    const subtotal = window._invoiceItems.reduce((s, item) => s + (item.quantity || 1) * (item.rate || 0), 0);
    const taxRate = Number(document.querySelector('[name="taxRate"]')?.value) || 0;
    const discount = Number(document.querySelector('[name="discount"]')?.value) || 0;
    const discountAmount = subtotal * discount / 100;
    const after = subtotal - discountAmount;
    const tax = after * taxRate / 100;
    const total = after + tax;
    const currency = document.querySelector('[name="currency"]')?.value || 'USD';

    const el = document.getElementById('totalsSummary');
    if (!el) return;
    el.innerHTML = `
      <div class="total-row"><span>Subtotal</span><span>${fmtCurrency(subtotal, currency)}</span></div>
      ${discount > 0 ? `<div class="total-row"><span>Discount (${discount}%)</span><span>-${fmtCurrency(discountAmount, currency)}</span></div>` : ''}
      ${taxRate > 0 ? `<div class="total-row"><span>Tax (${taxRate}%)</span><span>${fmtCurrency(tax, currency)}</span></div>` : ''}
      <div class="total-row grand"><span>Total</span><span>${fmtCurrency(total, currency)}</span></div>
    `;
  };

  window._saveInvoice = async function (id) {
    const form = document.getElementById('invoiceForm');
    const data = {
      from: {
        name: form.querySelector('[name="fromName"]')?.value || '',
        email: form.querySelector('[name="fromEmail"]')?.value || '',
        address: form.querySelector('[name="fromAddress"]')?.value || '',
      },
      to: {
        name: form.querySelector('[name="toName"]')?.value || '',
        email: form.querySelector('[name="toEmail"]')?.value || '',
        address: form.querySelector('[name="toAddress"]')?.value || '',
      },
      date: form.querySelector('[name="date"]')?.value,
      dueDate: form.querySelector('[name="dueDate"]')?.value,
      currency: form.querySelector('[name="currency"]')?.value,
      template: form.querySelector('[name="template"]')?.value,
      items: window._invoiceItems,
      taxRate: Number(form.querySelector('[name="taxRate"]')?.value) || 0,
      discount: Number(form.querySelector('[name="discount"]')?.value) || 0,
      discountType: 'percent',
      notes: form.querySelector('[name="notes"]')?.value || '',
    };

    try {
      let result;
      if (id === 'new') {
        result = await API.post('/api/invoices', data);
        toast('Invoice created!', 'success');
        window._nav('invoices', result.id);
      } else {
        result = await API.put(`/api/invoices/${id}`, data);
        toast('Invoice saved!', 'success');
      }
      refreshTier();
    } catch (e) {
      toast(e.message || 'Error saving invoice', 'error');
    }
  };

  window._updateStatus = async function (id, status) {
    try {
      await API.patch(`/api/invoices/${id}/status`, { status });
      toast(`Invoice marked as ${status}`, 'success');
    } catch (e) {
      toast(e.message || 'Error', 'error');
    }
  };

  window._duplicateInvoice = async function (id) {
    try {
      const result = await API.post(`/api/invoices/${id}/duplicate`);
      toast('Invoice duplicated!', 'success');
      window._nav('invoices', result.id);
      refreshTier();
    } catch (e) {
      toast(e.message || 'Error duplicating', 'error');
    }
  };

  window._deleteInvoice = async function (id) {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      await API.del(`/api/invoices/${id}`);
      toast('Invoice deleted', 'success');
      window._nav('invoices');
    } catch (e) {
      toast(e.message || 'Error deleting', 'error');
    }
  };

  // ========================
  // CLIENTS
  // ========================
  async function renderClientList() {
    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Clients</h1>
        <button class="btn btn-primary" onclick="window._openClientModal()">+ Add Client</button>
      </div>
      <div class="filter-bar">
        <input class="form-input" id="clientSearch" placeholder="Search clients..." oninput="window._loadClients()">
      </div>
      <div class="client-list" id="clientListContainer">
        <div class="empty-state"><p>Loading...</p></div>
      </div>
    `;
    window._loadClients();
  }

  window._loadClients = async function () {
    const search = document.getElementById('clientSearch')?.value || '';
    try {
      const clients = await API.get(`/api/clients${search ? '?search=' + encodeURIComponent(search) : ''}`);
      const container = document.getElementById('clientListContainer');
      if (!container) return;
      container.innerHTML = clients.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">●</div><h3>No clients yet</h3><p>Add your first client to get started</p></div>`
        : clients.map(c => `
          <div class="client-card" onclick="window._openClientModal('${c.id}')">
            <div class="client-name">${escHtml(c.name)}</div>
            <div class="client-detail">
              ${c.company ? escHtml(c.company) + '<br>' : ''}
              ${c.email || ''} ${c.phone ? ' · ' + c.phone : ''}
            </div>
          </div>
        `).join('');
    } catch (e) { /* ignore */ }
  };

  window._openClientModal = async function (id) {
    let client = null;
    if (id) {
      try { client = await API.get(`/api/clients/${id}`); } catch (e) { return; }
    }

    openModal(
      id ? 'Edit Client' : 'New Client',
      `
        <div class="form-grid" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input class="form-input" id="clientName" value="${escHtml(client?.name || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Company</label>
            <input class="form-input" id="clientCompany" value="${escHtml(client?.company || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" id="clientEmail" value="${escHtml(client?.email || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-input" id="clientPhone" value="${escHtml(client?.phone || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <textarea class="form-textarea" id="clientAddress">${escHtml(client?.address || '')}</textarea>
          </div>
        </div>
      `,
      `
        ${id ? '<button class="btn btn-danger btn-sm" onclick="window._deleteClient(\'' + id + '\')">Delete</button>' : ''}
        <button class="btn btn-secondary" onclick="window._closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="window._saveClient('${id || ''}')">Save</button>
      `
    );
  };

  window._saveClient = async function (id) {
    const data = {
      name: document.getElementById('clientName')?.value || '',
      company: document.getElementById('clientCompany')?.value || '',
      email: document.getElementById('clientEmail')?.value || '',
      phone: document.getElementById('clientPhone')?.value || '',
      address: document.getElementById('clientAddress')?.value || '',
    };

    try {
      if (id) {
        await API.put(`/api/clients/${id}`, data);
        toast('Client updated!', 'success');
      } else {
        await API.post('/api/clients', data);
        toast('Client added!', 'success');
      }
      closeModal();
      window._loadClients();
    } catch (e) {
      toast(e.message || 'Error saving client', 'error');
    }
  };

  window._deleteClient = async function (id) {
    if (!confirm('Delete this client?')) return;
    try {
      await API.del(`/api/clients/${id}`);
      closeModal();
      toast('Client deleted', 'success');
      window._loadClients();
    } catch (e) {
      toast(e.message || 'Error', 'error');
    }
  };

  window._closeModal = closeModal;

  // ========================
  // SETTINGS
  // ========================
  async function renderSettings() {
    const tier = await API.get('/api/tier');

    main.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="settings-section">
        <h3>Your Plan</h3>
        <div class="stats-grid" style="margin-bottom:20px">
          <div class="stat-card">
            <div class="stat-label">Current Plan</div>
            <div class="stat-value" style="font-size:18px;text-transform:uppercase">${tier.tier}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Invoices This Month</div>
            <div class="stat-value">${tier.used} / ${tier.limit}</div>
            <div class="stat-sub">${tier.remaining} remaining</div>
          </div>
        </div>
      </div>

      <div class="pro-plan">
        <h3>InvoiceForge Pro</h3>
        <div class="price">${tier.proPrice}</div>
        <ul class="features">
          <li>✓ Unlimited invoices</li>
          <li>✓ Custom branding & logo</li>
          <li>✓ All premium templates</li>
          <li>✓ Recurring invoices</li>
          <li>✓ Priority support</li>
        </ul>
        <button class="btn btn-primary" onclick="window._upgrade()">Upgrade to Pro</button>
      </div>
    `;
  }

  window._upgrade = function () {
    toast('Pro upgrade coming soon! Subscribe to get notified.', 'success');
  };

  // ========================
  // HELPERS
  // ========================
  async function loadClientAutocomplete() {
    try {
      const list = await API.get('/api/clients');
      const datalist = document.getElementById('clientList');
      if (!datalist) return;
      datalist.innerHTML = list.map(c => `<option value="${escHtml(c.name)}">${c.company ? escHtml(c.company) : ''}</option>`).join('');
    } catch (e) { /* ignore */ }
  }

  async function refreshTier() {
    try {
      const tier = await API.get('/api/tier');
      const el = document.getElementById('tierRemaining');
      if (el) el.textContent = tier.remaining;
    } catch (e) { /* ignore */ }
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ========================
  // Global nav helpers
  // ========================
  window._nav = function (view, id) {
    // Update sidebar
    document.querySelectorAll('.nav-item').forEach(l => {
      l.classList.remove('active');
      if (l.dataset.view === view) l.classList.add('active');
    });
    navigate(view, { id });
  };

  // Start
  renderDashboard();
})();
