// InvoiceForge Analytics — lightweight, privacy-friendly page tracking
const fs = require('fs');
const path = require('path');

const ANALYTICS_FILE = path.join(__dirname, '..', 'data', 'analytics.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
  } catch {
    return { pageViews: {}, totalViews: 0, startedAt: new Date().toISOString() };
  }
}

function save(data) {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Track a page view.
 */
function track(page) {
  const data = load();
  data.totalViews++;
  data.pageViews[page] = (data.pageViews[page] || 0) + 1;
  data.lastView = new Date().toISOString();
  save(data);
  return data;
}

/**
 * Get current analytics summary.
 */
function summary() {
  return load();
}

module.exports = { track, summary };
