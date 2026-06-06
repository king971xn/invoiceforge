# InvoiceForge — Professional Invoice Generator

> A production-ready micro SaaS. Deploy in 5 minutes. Start earning.

## Quick Start

```bash
npm install && npm start
# Open http://localhost:3457
```

---

## Step 1: Deploy to Vercel (5 min)

### Option A: Via Vercel Website (easiest)

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. Click **"New Project"**
3. Import this folder (upload as ZIP, or connect GitHub repo)
4. Set:
   - **Framework Preset**: Other
   - **Build Command**: *(leave empty)*
   - **Output Directory**: *(leave empty)*
   - **Install Command**: `npm install`
5. Add Environment Variable: `DATA_DIR` = `/tmp/data`
6. Click **Deploy**

You'll get a URL like `https://invoiceforge-xxxx.vercel.app`

### Option B: Via CLI

```bash
npx vercel login        # Opens browser to authenticate
npx vercel              # Deploy from project folder
```

### Option C: Render.com

1. [render.com](https://render.com) → New Web Service
2. Connect repo or upload
3. Start command: `node server.js`
4. Free tier includes persistent disk — no DATA_DIR needed

### After Deploying

Your app is live at a public URL. Anyone in the world can access it.

⚠️ **Important**: Vercel's filesystem is ephemeral. Data saved to `/tmp` may be lost on cold starts. For production with paying users, upgrade to:
- **Vercel KV** (free tier: 256MB) — add 10 lines of code
- **Supabase** (free tier: 500MB Postgres) — full database

---

## Step 2: Add Payments (30 min)

### Recommended: Lemon Squeezy

1. Sign up at [lemonsqueezy.com](https://lemonsqueezy.com)
2. Create a product: "InvoiceForge Pro" — $9/month
3. Get your store URL (looks like `https://YOURSTORE.lemonsqueezy.com`)
4. Add this button to `public/index.html` sidebar:

```html
<a href="https://YOURSTORE.lemonsqueezy.com/checkout/buy/xxx" 
   class="nav-item" style="color:#4f46e5;font-weight:700">
  ⬆ Upgrade to Pro
</a>
```

5. For webhook verification (auto-enable Pro after payment), add 3 lines to `server.js`

### Payment flow:
```
User clicks "Upgrade" → Pays $9 on Lemon Squeezy
→ Lemon Squeezy sends webhook to your server
→ Your server upgrades their account
→ Money goes to your bank/PayPal
```

Lemon Squeezy handles: taxes (VAT/GST), receipts, refunds, chargebacks.

---

## Step 3: Get Users

### Day 1-3: Launch
| Action | Where | Time |
|--------|-------|------|
| Post launch | [Product Hunt](https://producthunt.com) | 30 min |
| Write post | [Indie Hackers](https://indiehackers.com) | 20 min |
| Share | Reddit r/SaaS, r/freelance, r/smallbusiness | 15 min |
| Tweet | Twitter/X with #buildinpublic | 5 min |

### Day 4-30: Build Presence
| Action | Where | Time |
|--------|-------|------|
| Write 3 blog posts | Your blog + Medium + Dev.to | 2 hr each |
| Answer questions | Reddit, Quora ("best invoice tool?") | 15 min/day |
| Build in public | Twitter/X daily updates | 10 min/day |

### Long-term: SEO
- "free invoice generator" — 50K searches/month
- "invoice template PDF" — 30K searches/month
- "freelance invoice maker" — 10K searches/month

### Can I automate marketing?

**Partially.** Here's what can be automated vs what can't:

| Task | Automatable? | How |
|------|:---:|------|
| Post to social media | ✅ | Buffer, Hootsuite, Typefully |
| SEO blog posts | ✅ | I can write them for you |
| Reply to Reddit/Quora | ❌ | Needs human touch |
| Build audience on Twitter | ❌ | Requires personality |
| Run Google Ads | ✅ | Set budget, target keywords |
| Cold email outreach | ✅ | Instantly.ai, Lemlist |

**The one thing you can't automate**: being a real person that other real people trust. That's why "build in public" works — people buy from people.

---

## Cost Breakdown

| Item | Cost |
|------|------|
| Vercel hosting | $0 (free tier) |
| Domain (optional) | $10/year |
| Lemon Squeezy | 5% per transaction |
| **Total to start** | **$0** |
| **Total with domain** | **$10/year** |

At $9/month per Pro user:
- 1 user = $108/year revenue → $102 net
- 10 users = $1,080/year → $1,026 net
- 100 users = $10,800/year → $10,260 net

---

## Legal

InvoiceForge is a **document generation tool**, not a financial service. Users are responsible for tax compliance in their jurisdiction. The platform does not process payments, issue invoices, or provide tax advice.