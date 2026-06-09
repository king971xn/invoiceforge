/**
 * InvoiceForge Analytics Worker (Cloudflare Workers)
 * ==================================================
 * 免费部署到 Cloudflare Workers（10 万次/天免费额度）
 *
 * 部署步骤：
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler kv:namespace create INVOICEFORGE_ANALYTICS
 *   4. 将返回的 namespace ID 填入下方的 wrangler.toml
 *   5. wrangler deploy
 *
 * 数据生命周期：
 *   - KV 自动过期：每日数据保留 90 天，总计数据永久保留
 *   - 写入延迟：KV 最终一致性，60 秒内可读
 */

// ============================================================
// 配置（部署时修改）
// ============================================================
const CORS_ORIGIN = "*"; // 生产环境改为 "https://invoiceforge.app"

// ============================================================
// 工具函数
// ============================================================
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-06-09"
}

// ============================================================
// 路由处理
// ============================================================
async function handleTrack(request, env) {
  /** POST /track — 记录一次页面浏览 */
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { slug, referrer, visitor, title } = body;
  if (!slug) return json({ error: "slug required" }, 400);

  const date = todayKey();
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

  // 并发写入 KV（不阻塞响应）
  const writes = [];

  // 1. 当日计数（自增）
  const dailyKey = `pv:${slug}:${date}`;
  writes.push(incrKV(env.ANALYTICS_KV, dailyKey));

  // 2. 总计计数
  const totalKey = `pv:${slug}:total`;
  writes.push(incrKV(env.ANALYTICS_KV, totalKey));

  // 3. 记录 slug 到索引（用于 /stats 列出所有页面）
  writes.push(addSlugToIndex(env.ANALYTICS_KV, slug));

  // 4. 原始访问日志（最近 1000 条，用于详细分析）
  writes.push(logHit(env.ANALYTICS_KV, slug, { date, referrer, visitor, title, ip: clientIP }));

  // 不等待写入完成，立即返回（KV 最终一致性）
  request.ctx?.waitUntil(Promise.all(writes));

  return json({ ok: true, slug });
}

async function handleStats(request, env) {
  /** GET /stats — 返回所有页面的聚合统计数据 */
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  // 获取所有已知 slug
  const slugsJson = await env.ANALYTICS_KV.get("slugs", "json");
  const slugs = slugsJson || [];

  // 为每个 slug 拉取数据
  const pages = [];
  for (const slug of slugs.slice(0, limit)) {
    const total = parseInt((await env.ANALYTICS_KV.get(`pv:${slug}:total`)) || "0", 10);
    if (total === 0) continue;

    // 拉取最近 N 天的每日数据
    let recentTotal = 0;
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const daily = parseInt((await env.ANALYTICS_KV.get(`pv:${slug}:${dateKey}`)) || "0", 10);
      recentTotal += daily;
    }

    pages.push({ slug, total, recent: recentTotal, periodDays: days });
  }

  // 按近期流量降序
  pages.sort((a, b) => b.recent - a.recent);

  return json({
    generatedAt: new Date().toISOString(),
    periodDays: days,
    totalPages: slugs.length,
    pages,
  });
}

async function handlePageStats(request, env, slug) {
  /** GET /stats/:slug — 返回单个页面的详细统计 */
  const total = parseInt((await env.ANALYTICS_KV.get(`pv:${slug}:total`)) || "0", 10);

  // 拉取最近 30 天每日数据
  const daily = {};
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const count = parseInt((await env.ANALYTICS_KV.get(`pv:${slug}:${dateKey}`)) || "0", 10);
    if (count > 0) daily[dateKey] = count;
  }

  return json({ slug, total, daily });
}

// ============================================================
// KV 辅助函数
// ============================================================
async function incrKV(kv, key) {
  /** KV 原子自增。KV 不支持原生 incr，用 get+put 模拟。 */
  const prev = parseInt((await kv.get(key)) || "0", 10);
  await kv.put(key, String(prev + 1));
}

async function addSlugToIndex(kv, slug) {
  /** 将新 slug 追加到索引。 */
  const raw = await kv.get("slugs");
  const list = raw ? JSON.parse(raw) : [];
  if (!list.includes(slug)) {
    list.push(slug);
    await kv.put("slugs", JSON.stringify(list));
  }
}

async function logHit(kv, slug, entry) {
  /** 追加访问日志（保留最近 1000 条）。 */
  const key = `log:${slug}`;
  const raw = await kv.get(key);
  const log = raw ? JSON.parse(raw) : [];
  log.push({ ...entry, time: new Date().toISOString() });
  // 只保留最近 1000 条
  if (log.length > 1000) log.splice(0, log.length - 1000);
  await kv.put(key, JSON.stringify(log));
}

// ============================================================
// Worker 入口
// ============================================================
export default {
  async fetch(request, env, ctx) {
    // 将 ctx 注入 request 供 handleTrack 使用
    request.ctx = ctx;

    const url = new URL(request.url);

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 路由分发
    if (request.method === "POST" && url.pathname === "/track") {
      return handleTrack(request, env);
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      return handleStats(request, env);
    }

    const pageMatch = url.pathname.match(/^\/stats\/(.+)$/);
    if (request.method === "GET" && pageMatch) {
      return handlePageStats(request, env, pageMatch[1]);
    }

    // 健康检查
    if (url.pathname === "/health") {
      return json({ status: "ok", timestamp: new Date().toISOString() });
    }

    return json({ error: "not found" }, 404);
  },
};
