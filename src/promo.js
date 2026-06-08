// InvoiceForge Promotion Engine
// Social media templates, content calendar, and automated sharing

const BASE_URL = process.env.BASE_URL || 'https://invoiceforge-production-3495.up.railway.app';

/**
 * Social media post templates for different platforms.
 * Each template has platform-specific character limits and hashtag strategies.
 */
const postTemplates = {
  // Twitter/X (280 chars)
  twitter: [
    {
      hook: 'Stop sending invoices made in Word.',
      body: 'Create professional, PDF-ready invoices in seconds.\n\nFree tier: 3 invoices/month. No sign-up.\n\n',
      hashtags: ['freelance', 'invoicing', 'smallbusiness', 'productivity'],
      cta: BASE_URL,
    },
    {
      hook: 'Freelancers: how long do you wait to get paid?',
      body: 'The right invoice format can cut your wait time in half.\n\nProfessional invoices → faster payments.\n\n',
      hashtags: ['freelancetips', 'getpaid', 'invoicing'],
      cta: BASE_URL,
    },
    {
      hook: 'Tired of invoicing tools that cost $30/month?',
      body: 'InvoiceForge Pro is $9.99/month.\n\nUnlimited invoices, custom branding, recurring billing.\n\n',
      hashtags: ['freelance', 'solopreneur', 'SaaS'],
      cta: BASE_URL + '/app',
    },
    {
      hook: '3 free invoices every month.',
      body: 'No credit card. No sign-up. No time limit.\n\nJust open InvoiceForge and start creating.\n\n',
      hashtags: ['freelance', 'freebie', 'tools'],
      cta: BASE_URL + '/app',
    },
    {
      hook: 'New blog post: How to Create a Professional Invoice That Gets You Paid Faster',
      body: '7 essential elements + PDF export tips.\n\n',
      hashtags: ['invoicing', 'freelancing', 'smallbiz'],
      cta: BASE_URL + '/blog/how-to-create-professional-invoice',
    },
  ],

  // LinkedIn (3000 chars, but keep it punchy)
  linkedin: [
    {
      hook: 'I built a free invoice generator. Here\'s why.',
      body: 'As a freelancer, I was tired of:\n\n\u2022 Overpaying for invoicing software I barely used\n\u2022 Word-document invoices that looked unprofessional\n\u2022 Tools that required sign-ups before I could even try them\n\nSo I built InvoiceForge — a clean, fast invoice generator.\n\nFree tier: 3 invoices/month. PDF export. Client management. No sign-up.\n\nPro tier: $9.99/month for unlimited everything.\n\nTry it: ' + BASE_URL,
      hashtags: ['freelancing', 'invoicing', 'microSaaS', 'buildinpublic'],
    },
    {
      hook: 'The #1 reason freelancers don\'t get paid on time?',
      body: 'Unprofessional invoices.\n\nWhen your invoice looks like a hastily-typed document, clients deprioritize it. Fair or not, it\'s reality.\n\n\u2022 Use numbered invoices\n\u2022 Include clear payment terms\n\u2022 Export as PDF (not editable Word docs)\n\u2022 Follow up professionally\n\nI wrote a full guide on creating invoices that get paid: ' + BASE_URL + '/blog/how-to-create-professional-invoice',
      hashtags: ['freelancing', 'consulting', 'businessbasics'],
    },
    {
      hook: 'Free vs Paid Invoice Generators — an honest comparison.',
      body: 'When should you stay free? When should you upgrade?\n\nFree tools (like InvoiceForge) are perfect when:\n\u2022 You send < 5 invoices/month\n\u2022 You\'re just starting out\n\u2022 You don\'t need custom branding yet\n\nUpgrade when:\n\u2022 You\'re hitting free-tier limits\n\u2022 You want your logo on invoices\n\u2022 You need recurring billing for retainers\n\nFull breakdown: ' + BASE_URL + '/blog/free-vs-paid-invoice-generators',
      hashtags: ['freelancing', 'smallbusiness', 'SaaS'],
    },
  ],

  // Short-form (Reddit, product hunt, indie hackers style)
  shortForm: [
    {
      title: 'InvoiceForge — Free online invoice generator, no sign-up',
      body: 'Create professional invoices in seconds. PDF export, client management, invoice tracking. Free tier: 3 invoices/month. Pro: $9.99/mo unlimited.\n\nBuilt this because I was tired of bloated invoicing tools. Would love feedback.',
      link: BASE_URL,
    },
    {
      title: 'I made a free invoice generator with PDF export',
      body: 'No sign-up, no credit card, no time limit. Just open and create. 3 free invoices/month, upgrade to Pro ($9.99) for unlimited.\n\nFeatures: invoice builder, client manager, dashboard tracking, one-click PDF export.',
      link: BASE_URL + '/app',
    },
  ],

  // Email newsletter / cold outreach template
  email: {
    subject: 'Your invoices deserve better than Word',
    body: `Hi {{name}},

I noticed you're running a {{business_type}} — and if you're like most small business owners, invoicing is probably not your favorite task.

InvoiceForge makes it fast:
  \u2022 Create professional invoices in under 60 seconds
  \u2022 Export as print-ready PDF
  \u2022 Track paid, sent, and overdue invoices from one dashboard
  \u2022 Free tier: 3 invoices/month (no credit card)

Try it: ${BASE_URL}/app

Cheers,
InvoiceForge`,
  },
};

/**
 * Content calendar — automated posting schedule.
 * Each entry represents a social media post to be published.
 */
const contentCalendar = [
  { day: 'Monday',    platform: 'twitter',  template: 0, time: '09:00 EST' },
  { day: 'Monday',    platform: 'linkedin', template: 0, time: '10:00 EST' },
  { day: 'Wednesday', platform: 'twitter',  template: 1, time: '09:00 EST' },
  { day: 'Wednesday', platform: 'linkedin', template: 1, time: '10:00 EST' },
  { day: 'Friday',    platform: 'twitter',  template: 2, time: '09:00 EST' },
  { day: 'Friday',    platform: 'reddit',   template: 0, time: '11:00 EST' },
];

/**
 * Generate a formatted social media post from a template.
 * @param {'twitter'|'linkedin'|'shortForm'} platform
 * @param {number} templateIndex
 * @returns {string} formatted post
 */
function generatePost(platform, templateIndex = 0) {
  const templates = postTemplates[platform];
  if (!templates || !templates[templateIndex]) {
    return `Platform "${platform}" template #${templateIndex} not found.`;
  }
  const t = templates[templateIndex];

  if (platform === 'shortForm') {
    return `${t.title}\n\n${t.body}\n\n${t.link}`;
  }

  const hashtagStr = t.hashtags ? '\n\n' + t.hashtags.map(h => `#${h}`).join(' ') : '';
  return `${t.hook}\n\n${t.body}\n${t.cta}${hashtagStr}`;
}

/**
 * Generate a full week of social media posts.
 * @returns {Array<{day, platform, content}>}
 */
function generateWeeklyPosts() {
  return contentCalendar.map(entry => {
    let platform = entry.platform;
    // Map 'reddit' to shortForm template format
    if (platform === 'reddit') platform = 'shortForm';
    return {
      day: entry.day,
      platform: entry.platform,
      content: generatePost(platform, entry.template),
    };
  });
}

/**
 * Get the content calendar as structured data.
 */
function getCalendar() {
  return contentCalendar;
}

/**
 * Get all available templates.
 */
function getTemplates() {
  return postTemplates;
}

// Export for API use
module.exports = {
  generatePost,
  generateWeeklyPosts,
  getCalendar,
  getTemplates,
  postTemplates,
  contentCalendar,
  BASE_URL,
};
