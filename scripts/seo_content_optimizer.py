#!/usr/bin/env python3
"""
InvoiceForge 全自动 SEO 内容优化器（Agent #2）
=============================================
功能：
  1. 扫描 content/blog/ 下所有已发布的 Markdown 博客文章
  2. 识别超过 N 天未更新的"老化"文章（默认 14 天）
  3. 调用 DeepSeek API 对老化文章进行 SEO 优化：
     - 优化标题和 meta description（提高搜索点击率）
     - 补充内部链接指向更新的相关文章
     - 更新 Front Matter 中的 date、keywords
  4. 通过 git commit + push 提交优化结果
  5. 触发 Vercel 自动重新部署

用法：
  仅 CI 模式（GitHub Actions）：
    python scripts/seo_content_optimizer.py

环境变量：
  DEEPSEEK_API_KEY — DeepSeek API 密钥
"""

import os
import sys
import re
import logging
import subprocess
import textwrap
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import urllib.request
import json as json_mod

from openai import OpenAI

# ============================================================
# 日志
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("seo_optimizer")

# ============================================================
# 配置
# ============================================================
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"

CONTENT_DIR = "content/blog"
# 多少天未更新视为"老化"
STALE_DAYS = 14
# 每次运行最多优化几篇文章（控制 API 成本 + 避免过度修改）
MAX_OPTIMIZE_PER_RUN = 2

# ============================================================
# Front Matter 解析
# ============================================================

def parse_front_matter(filepath: str) -> dict:
    """解析 Markdown 文件的 YAML Front Matter。

    Returns:
        {
            "path": str,
            "title": str,
            "description": str,
            "keywords": list,
            "date": str,       # ISO 8601
            "body": str,       # Front Matter 之后的正文
            "raw_front": str,  # 原始 Front Matter 文本（含 --- 分隔线）
        }
        解析失败返回 None
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return None

    # 匹配 --- ... --- 块
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", content, re.DOTALL)
    if not match:
        return None

    front_raw = match.group(1)
    body = match.group(2)

    # 提取字段（容错：允许冒号前后的空格差异）
    def extract(key: str) -> str:
        m = re.search(rf"^{key}:\s*[\"']?(.+?)[\"']?\s*$", front_raw, re.MULTILINE)
        return m.group(1).strip() if m else ""

    keywords_raw = extract("keywords")
    # keywords 可能是 ["a", "b"] 或 [a, b] 或 a, b
    kw_list = []
    if keywords_raw:
        kw_list = [k.strip().strip("\"'") for k in re.findall(r'"([^"]*)"', keywords_raw)]
        if not kw_list:
            kw_list = [k.strip() for k in keywords_raw.strip("[]").split(",") if k.strip()]

    return {
        "path": filepath,
        "title": extract("title"),
        "description": extract("description"),
        "keywords": kw_list,
        "date": extract("date"),
        "body": body,
        "raw_front": front_raw,
    }


def is_stale(post: dict, threshold_days: int = STALE_DAYS) -> bool:
    """判断文章是否超过老化阈值。"""
    if not post["date"]:
        return True  # 无日期视为老化
    try:
        post_date = datetime.fromisoformat(post["date"].replace("Z", "+00:00"))
        age = datetime.now(timezone.utc) - post_date
        return age > timedelta(days=threshold_days)
    except Exception:
        return True


# ============================================================
# 核心优化逻辑
# ============================================================

def optimize_post(post: dict, all_posts: list, api_key: str) -> str | None:
    """调用 DeepSeek 优化一篇老化文章。

    优化策略：
    - 如果标题不包含 2026，更新为含年份的版本
    - 优化 meta description 使其更具点击率（加入数字、紧迫感、利益点）
    - 建议 2-3 个内部链接指向更新的文章
    - 在文章末尾追加 "Last updated" 行

    Returns:
        优化后的完整 Markdown 内容，失败返回 None
    """
    # 选取 2-3 篇更新的文章作为内链目标
    newer_posts = sorted(
        [p for p in all_posts if p["path"] != post["path"] and p["date"]],
        key=lambda p: p["date"], reverse=True,
    )[:3]
    newer_links = "\n".join(
        f"- [{p['title']}](/blog/{os.path.splitext(os.path.basename(p['path']))[0]})"
        for p in newer_posts
    )

    log.info(f"正在优化: {post['title'][:60]}...")

    prompt = textwrap.dedent(f"""\
You are an SEO editor optimizing an existing blog post for better search performance.

=== CURRENT ARTICLE FRONT MATTER ===
title: "{post['title']}"
description: "{post['description']}"
keywords: {post['keywords']}
date: {post['date']}

=== AVAILABLE NEWER POSTS FOR INTERNAL LINKS ===
{newer_links or '(none)'}

=== ARTICLE BODY (truncated) ===
{post['body'][:2000]}

=== TASK ===
1. Optimize the title: if the current title feels clickbait-free but boring, make it more compelling while keeping the keyword. Consider adding the current year (2026) if missing.
2. Optimize the meta description: keep it under 160 characters, include a number or specific benefit, make someone scanning search results WANT to click.
3. Add an "Explore More" section at the end of the article with internal links to related posts (use the newer posts above if relevant, or invent realistic InvoiceForge blog slugs like /blog/free-invoice-generator).
4. Add a "Last updated: {datetime.now().strftime('%Y-%m-%d')}" line after the article body, before the Explore More section.

Output the COMPLETE revised article with updated Front Matter, in valid Markdown. Do NOT wrap in a code block. Keep the article body largely intact — only optimize title, description, add internal links, and add last-updated line.""")

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert SEO editor. Output clean Markdown with front matter. No code blocks."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
            max_tokens=4096,
        )
        raw = response.choices[0].message.content
        if not raw or not raw.strip():
            log.warning("AI 返回空内容，跳过优化")
            return None

        # 清理可能的代码块包裹
        raw = re.sub(r"^```markdown\s*\n?", "", raw)
        raw = re.sub(r"\n```\s*$", "", raw)
        return raw.strip()
    except Exception as e:
        log.warning(f"优化 API 调用失败: {e}")
        return None


# ============================================================
# 部署
# ============================================================

def write_and_commit(optimized_content: str, filepath: str) -> bool:
    """将优化后的内容写回文件并 git commit + push。返回 True 表示成功。"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(optimized_content)

    log.info(f"优化后内容已写入: {filepath}")

    git_user = os.getenv("GIT_USER_NAME", "invoiceforge-bot")
    git_email = os.getenv("GIT_USER_EMAIL", "bot@invoiceforge.app")
    subprocess.run(["git", "config", "user.name", git_user], check=False)
    subprocess.run(["git", "config", "user.email", git_email], check=False)

    add_result = subprocess.run(["git", "add", filepath], capture_output=True)
    if add_result.returncode != 0:
        log.error(f"git add 失败: {add_result.stderr.decode().strip()}")
        return False

    diff_result = subprocess.run(["git", "diff", "--cached", "--quiet"], capture_output=True)
    if diff_result.returncode == 0:
        log.info("优化后内容无变化，跳过 commit")
        return True

    filename = os.path.basename(filepath)
    commit_result = subprocess.run(
        ["git", "commit", "-m", f"seo(optimize): refresh content & meta - {filename}"],
        capture_output=True,
    )
    if commit_result.returncode != 0:
        log.error(f"git commit 失败: {commit_result.stderr.decode().strip()}")
        return False

    push_result = subprocess.run(["git", "push", "origin", "master"], capture_output=True)
    if push_result.returncode != 0:
        stderr_msg = push_result.stderr.decode().strip()
        log.error(f"git push 失败: {stderr_msg}")
        # push 失败但 commit 已生成，不算完全失败 — 下次运行会一起推
        log.info("commit 已在本地，下次 workflow 运行会一并推送")
        return True

    log.info(f"优化推送成功: {filename}")
    return True


# ============================================================
# 主流程
# ============================================================

def main():
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        log.error("DEEPSEEK_API_KEY 未设置")
        sys.exit(1)

    # ---------- 1. 扫描所有文章 ----------
    if not os.path.isdir(CONTENT_DIR):
        log.warning(f"目录 {CONTENT_DIR} 不存在，跳过优化")
        sys.exit(0)

    md_files = [
        os.path.join(CONTENT_DIR, f)
        for f in os.listdir(CONTENT_DIR)
        if f.endswith(".md")
    ]
    if not md_files:
        log.info("没有找到任何博客文章，跳过优化")
        sys.exit(0)

    posts = [p for p in (parse_front_matter(f) for f in md_files) if p]
    log.info(f"扫描到 {len(posts)} 篇文章")

    # ---------- 2. 筛选老化文章 ----------
    stale = [p for p in posts if is_stale(p)]
    if not stale:
        log.info("所有文章都在新鲜期内，无需优化")
        sys.exit(0)

    # 按旧到新排序，优先优化最老的文章
    def sort_key(p):
        try:
            return datetime.fromisoformat(p["date"].replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    stale.sort(key=sort_key)
    log.info(f"{len(stale)} 篇文章已老化（>{STALE_DAYS} 天未更新），本次最多优化 {MAX_OPTIMIZE_PER_RUN} 篇")

    # ---------- 3. 逐篇优化 ----------
    optimized_count = 0
    for post in stale[:MAX_OPTIMIZE_PER_RUN]:
        new_content = optimize_post(post, posts, api_key)
        if new_content:
            if write_and_commit(new_content, post["path"]):
                optimized_count += 1
        else:
            log.warning(f"优化失败，跳过: {os.path.basename(post['path'])}")

    # ---------- 4. 汇总报告 ----------
    print(f"\n📊 本次优化报告")
    print(f"   总文章数: {len(posts)}")
    print(f"   老化文章: {len(stale)}")
    print(f"   已优化:   {optimized_count}")
    print(f"   跳过:     {len(stale) - optimized_count}")

    # 如果还有更多老化文章未优化，给出提示
    remaining = len(stale) - MAX_OPTIMIZE_PER_RUN
    if remaining > 0:
        print(f"   ⏳ 剩余 {remaining} 篇老化文章将在后续运行中逐步优化")


if __name__ == "__main__":
    main()
