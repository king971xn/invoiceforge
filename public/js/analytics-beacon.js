/**
 * InvoiceForge Analytics Beacon — 轻量追踪脚本
 * =============================================
 * 嵌入每篇 SEO 博客页面，收集页面浏览量。
 *
 * 双模式运行：
 *   A) 有 Worker：发送信标到 Cloudflare Worker，获得服务端聚合统计
 *   B) 无 Worker：仅本地 localStorage 计数，不报错
 *
 * 使用方式：
 *   在博客 Markdown 中插入：
 *   <script defer src="/js/analytics-beacon.js" data-endpoint="https://your-worker.workers.dev"></script>
 *
 * 暴露的 API（供 Worker 后端消费）：
 *   POST {endpoint}/track
 *     Body: { "slug": "2025-01-15-how-to-invoice", "referrer": "...", "visitor": "uuid" }
 */

(function () {
  "use strict";

  const script = document.currentScript;
  const endpoint = script?.dataset?.endpoint || null;

  // 从 URL 路径提取 slug（如 /blog/2025-01-15-my-post → 2025-01-15-my-post）
  const path = window.location.pathname;
  const slugMatch = path.match(/\/blog\/([^/?#]+)/);
  const slug = slugMatch ? slugMatch[1] : path.replace(/\//g, "_");

  // 匿名访客 ID（localStorage 持久化，不清除）
  const VISITOR_KEY = "_if_visitor";
  let visitor = localStorage.getItem(VISITOR_KEY);
  if (!visitor) {
    visitor = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem(VISITOR_KEY, visitor);
  }

  // 同一访客、同一页面、5 分钟内不重复计数
  const dedupKey = `_if_pv_${slug}`;
  const lastHit = parseInt(localStorage.getItem(dedupKey) || "0", 10);
  const now = Date.now();
  if (now - lastHit < 300000) return; // 5 分钟去重
  localStorage.setItem(dedupKey, String(now));

  // 发送信标到 Worker
  if (endpoint) {
    const payload = {
      slug: slug,
      referrer: document.referrer || "",
      visitor: visitor,
      title: document.title || "",
      timestamp: new Date().toISOString(),
    };

    try {
      fetch(endpoint + "/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // keepalive 确保页面关闭时也能发送
        keepalive: true,
      }).catch(function () {
        /* Worker 不可达时静默失败 */
      });
    } catch (_) {
      /* 静默失败 */
    }
  }

  // 本地计数（debug 用，在控制台可见）
  const localTotal = parseInt(localStorage.getItem("_if_total") || "0", 10);
  localStorage.setItem("_if_total", String(localTotal + 1));
})();
