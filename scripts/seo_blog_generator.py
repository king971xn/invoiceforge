#!/usr/bin/env python3
"""
InvoiceForge 全自动 SEO 博客内容生成与部署脚本
==============================================
功能：
  1. 从内置长尾关键词库中随机选取一个关键词
  2. 调用 DeepSeek API（兼容 OpenAI SDK）生成一篇英文 SEO 博客文章
  3. 部署到 king971xn/invoiceforge 仓库的 content/blog/ 目录
     - 本地模式：通过 PyGithub API 推送（需 GITHUB_TOKEN）
     - CI 模式：通过 git commit + push 推送（用于 GitHub Actions）

环境变量：
  DEEPSEEK_API_KEY  — DeepSeek API 密钥（必填）
  GITHUB_TOKEN      — GitHub PAT（本地模式必填，CI 模式不需要）

用法：
  python scripts/seo_blog_generator.py              # 本地模式：随机关键词 → PyGithub 推送
  python scripts/seo_blog_generator.py --ci           # CI 模式：git commit + push
  python scripts/seo_blog_generator.py --dry-run      # 只生成不推送，保存到 scripts/output/
  python scripts/seo_blog_generator.py --keyword "..." # 指定关键词
"""

import os
import sys
import random
import argparse
import textwrap
import re
import logging
import subprocess
from datetime import datetime, timezone

from openai import OpenAI

# ============================================================
# 日志配置
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("seo_blog_generator")

# ============================================================
# 配置常量
# ============================================================
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"          # DeepSeek V3 通用对话模型

GITHUB_REPO_OWNER = "king971xn"
GITHUB_REPO_NAME = "invoiceforge"
GITHUB_BRANCH = "master"
GITHUB_CONTENT_PATH = "content/blog"      # 推送目标目录

ARTICLE_MIN_WORDS = 700
ARTICLE_MAX_WORDS = 900
TEMPERATURE = 0.8

# CI 模式下历史记录文件路径（会随博客一起提交到仓库）
CI_HISTORY_FILE = "scripts/seo_history.txt"

# ============================================================
# 长尾关键词库（高意向、低竞争、面向海外自由职业者）
# ============================================================
SEO_KEYWORDS = [
    # 免注册 / 无需登录
    "free invoice generator no sign up required 2026",
    "create invoice without registration free tool",
    "best free invoicing software no account needed",

    # Stripe / 支付集成
    "invoice generator for Stripe non residents",
    "how to invoice international clients via Stripe",
    "freelance invoice with Stripe payment link",

    # 自由职业者身份（无公司实体）
    "how to invoice as freelancer without company",
    "freelancer invoice template no business license",
    "send professional invoice as sole proprietor",

    # 特定职业
    "freelance developer invoice template free",
    "graphic designer invoice maker no sign up",
    "independent consultant billing best practices",

    # 快速出单
    "create and download invoice instantly free",
    "fast invoice generator for last minute billing",
    "online invoice maker PDF download no email",

    # 税务 / 合规
    "self employed invoice requirements for taxes",
    "what to include on freelance invoice legally",
    "tax compliant invoice template for contractors",

    # 跨国 / 多币种
    "multi currency invoice generator for remote freelancers",
    "invoice European clients as US freelancer VAT",
    "cross border freelance invoicing guide 2026",

    # 对比 / 最佳
    "best free alternatives to QuickBooks for freelancers",
    "InvoiceForge vs traditional invoicing software",
    "top invoice tools for solo business owner 2026",
    # === ?????????3x/??????????===

    # ????
    "one time invoice for freelance project template",
    "invoice maker for occasional freelancers",
    "send invoice after completing gig no software",
    "how to bill client for freelance web development",
    "emergency invoice template when client demands one",

    # PDF / ??
    "download invoice as PDF without account",
    "print ready invoice template free download",
    "professional PDF invoice generator online",

    # ???
    "create invoice on mobile phone free no app",
    "mobile friendly invoice generator for freelancers",

    # ??
    "invoice with payment link for freelancers",
    "how to accept payment with invoice Stripe PayPal",
    "get paid faster with professional freelance invoice",

    # ?? / ???
    "custom branded invoice for freelance business",
    "make freelance invoices look professional free tool",
    "white label invoice generator for agencies",

    # ?? / ??
    "simplest invoice tool for solo freelancers 2026",
    "lightweight invoice generator no bloatware",
    "minimalist invoice maker for independent workers",

    # ????
    "free invoice generator for UK freelancers no sign up",
    "Australian freelancer invoice template GST",
    "Canadian contractor invoice template free",
    "invoice generator for Indian freelancers international clients",

    # ?? freelancer
    "invoice template for Upwork freelancers off platform",
    "Fiverr freelancer invoice outside platform free",
    "direct client invoice for platform freelancers",

    # ?? / ????
    "Invoice Simple alternative free no sign up",
    "Wave invoicing alternative no account required",
    "Zoho Invoice alternative lightweight free",

]

# ============================================================
# DeepSeek 系统提示词
# ============================================================
SYSTEM_PROMPT = textwrap.dedent("""\
You are an SEO expert specializing in freelance billing and financial content for English-speaking freelancers worldwide.

Your task: write a practical, SEO-optimized English guide based on a target keyword. The article must follow this structure:

1. **Pain Point Introduction (痛点引入)** — Open with a relatable freelancer frustration or real-world billing problem tied to the keyword. Make the reader feel understood.
2. **Detailed How-To / Solution (具体解决方案)** — Provide a step-by-step, actionable guide. Use bullet points for clarity where appropriate. Include concrete tips, best practices, and warnings about common mistakes.
3. **InvoiceForge Integration (工具植入)** — Naturally introduce InvoiceForge (a free, no-sign-up invoice generator at invoiceforge.app) as the recommended solution. Explain exactly how it solves the reader's problem — notably its zero-registration workflow, instant PDF download, and built-in professional templates. Do NOT make this section sound like a hard-sell ad; weave it in as helpful advice.
4. **Conclusion / Call to Action** — Summarize key takeaways and encourage the reader to try InvoiceForge.

Rules:
- Write in fluent, natural English at a 9th-grade reading level.
- Target approximately {min_words}–{max_words} words.
- Use Markdown formatting: h2/h3 headings, bullet lists, and a single H1 title.
- Include SEO-friendly Front Matter at the very top:

---
title: "SEO Title Here (include the keyword naturally)"
description: "Meta description under 160 characters with keyword"
keywords: ["keyword1", "keyword2", "keyword3"]
date: {date}
---

- The `date` field must use ISO 8601 format (e.g., 2026-06-09).
- The filename-safe slug will be derived from the title automatically; you do not need to output it.
- - At the end of the article, add an "Explore More" section with 2-3 internal links to related InvoiceForge blog posts. Use the format: `[Post Title](/blog/slug)` ? invent realistic slugs like `/blog/free-invoice-generator-no-sign-up` or `/blog/freelance-invoice-template` that match the existing content strategy.
- Do NOT wrap the entire response in a markdown code block — output raw Markdown.
- At the very end of the article, add this exact HTML snippet before the closing content (do NOT alter it):

<script defer src="/js/analytics-beacon.js" data-endpoint="ANALYTICS_ENDPOINT_PLACEHOLDER"></script>

- Do NOT include the slug or filename in the output.
""")

# ============================================================
# 工具函数
# ============================================================

def slugify(text: str, max_length: int = 70) -> str:
    """将文本转换为 URL 友好的 slug。"""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    text = text.strip("-")[:max_length].rstrip("-")
    return text



def expand_keywords(api_key: str, count: int = 10) -> list:
    """?? DeepSeek ??????????????????

    ?????????????AI ??????????????
    ????????????????

    Args:
        api_key: DeepSeek API ??
        count: ???????????

    Returns:
        ???????????????????????
    """
    existing = "\n".join(f"- {kw}" for kw in SEO_KEYWORDS)

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
    prompt = f"""Here are the existing SEO keywords I'm targeting for an invoice generator tool:

{existing}

Suggest {count} NEW long-tail keywords that:
1. Target freelance billing / invoicing pain points NOT yet covered above
2. Are low-competition, high-intent (someone searching these wants to solve a billing problem NOW)
3. Each 4-10 words long, in natural English search query style
4. Cover gaps: different professions, regions, platforms, edge cases, seasonal needs

Output ONLY the keywords, one per line, no numbers, no bullets, no explanation."""

    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=1.0,
            max_tokens=1024,
        )
        raw = response.choices[0].message.content
        new_keywords = [
            line.strip().lstrip("-* 0123456789.").strip()
            for line in raw.split("\n")
            if line.strip() and len(line.strip()) > 10
        ]
        # ?????????????
        existing_lower = {kw.lower() for kw in SEO_KEYWORDS}
        unique_new = [kw for kw in new_keywords if kw.lower() not in existing_lower]

        log.info(f"AI ?? {len(new_keywords)} ??????????? {len(unique_new)} ?")
        return unique_new[:count]
    except Exception as e:
        log.warning(f"???????: {e}")
        return []


def pick_keyword(exclude: list = None) -> str:
    """从关键词库中随机选取一个，支持排除已用词。"""
    pool = SEO_KEYWORDS[:]
    if exclude:
        pool = [kw for kw in pool if kw not in exclude]
    if not pool:
        pool = SEO_KEYWORDS[:]
        log.warning("所有关键词已用完，重置关键词池")
    return random.choice(pool)


def load_history(history_file: str = "scripts/seo_history.txt") -> list:
    """读取历史记录文件，返回已用关键词列表。"""
    if not os.path.exists(history_file):
        return []
    try:
        with open(history_file, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except Exception:
        log.warning("无法读取历史记录文件，将忽略历史")
        return []


def save_history(keyword: str, filename: str, history_file: str = "scripts/seo_history.txt"):
    """将本次生成的关键词追加到历史记录。"""
    try:
        with open(history_file, "a", encoding="utf-8") as f:
            f.write(f"{keyword}|{filename}|{datetime.now(timezone.utc).isoformat()}\n")
    except Exception as e:
        log.warning(f"保存历史记录失败: {e}")


# ============================================================
# 核心：调用 DeepSeek API 生成文章
# ============================================================

def generate_article(keyword: str, api_key: str) -> tuple:
    """调用 DeepSeek API 生成一篇 SEO 博客文章。

    Returns:
        (markdown_content, suggested_title) 元组
    Raises:
        RuntimeError: API 调用失败或返回内容为空
    """
    log.info(f"正在调用 DeepSeek API，关键词: 「{keyword}」")

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
    today_str = datetime.now().strftime("%Y-%m-%d")

    user_prompt = (
        f'Target keyword: "{keyword}"\n'
        f"Please write a complete, ready-to-publish SEO blog post targeting this keyword."
    )

    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT.format(
                        min_words=ARTICLE_MIN_WORDS,
                        max_words=ARTICLE_MAX_WORDS,
                        date=today_str,
                    ),
                },
                {"role": "user", "content": user_prompt},
            ],
            temperature=TEMPERATURE,
            max_tokens=4096,
        )
    except Exception as e:
        raise RuntimeError(f"DeepSeek API 调用失败: {e}")

    content = response.choices[0].message.content
    if not content or not content.strip():
        raise RuntimeError("DeepSeek 返回了空内容")

    title_match = re.search(r'title:\s*"([^"]+)"', content)
    suggested_title = title_match.group(1) if title_match else keyword

    word_count = len(re.findall(r"\b\w+\b", content))
    log.info(f"文章生成成功，约 {word_count} 词")
    if word_count < 300:
        log.warning(f"文章字数偏少（{word_count} 词），但继续处理")

    return content.strip(), suggested_title


# ============================================================
# 部署方式 A：本地模式 — PyGithub API
# ============================================================

def deploy_via_pygithub(content: str, filename: str, github_token: str) -> str:
    """通过 GitHub Contents API 创建/更新文件。"""
    from github import Github, GithubException

    gh = Github(github_token)
    try:
        repo = gh.get_repo(f"{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}")
    except GithubException as e:
        raise RuntimeError(f"无法访问 GitHub 仓库: {e}")

    file_path = f"{GITHUB_CONTENT_PATH}/{filename}"
    commit_message = f"docs(blog): auto-generate SEO article — {filename}"

    log.info(f"正在推送文件: {file_path}")

    try:
        try:
            existing = repo.get_contents(file_path, ref=GITHUB_BRANCH)
            result = repo.update_file(
                path=file_path,
                message=commit_message,
                content=content,
                sha=existing.sha,
                branch=GITHUB_BRANCH,
            )
            log.info(f"文件已更新: {file_path}")
        except GithubException as e:
            if e.status == 404:
                result = repo.create_file(
                    path=file_path,
                    message=commit_message,
                    content=content,
                    branch=GITHUB_BRANCH,
                )
                log.info(f"新文件已创建: {file_path}")
            else:
                raise

        commit_sha = result["commit"].sha[:7]
        file_url = f"https://github.com/{GITHUB_REPO_OWNER}/{GITHUB_REPO_NAME}/blob/{GITHUB_BRANCH}/{file_path}"
        log.info(f"推送成功！Commit: {commit_sha}")
        return file_url
    except GithubException as e:
        detail = e.data.get("message", str(e)) if hasattr(e, "data") else str(e)
        raise RuntimeError(f"GitHub API 错误 (HTTP {e.status}): {detail}")
    finally:
        gh.close()


# ============================================================
# 部署方式 B：CI 模式 — 本地 git commit + push
# ============================================================

def deploy_via_git(content: str, filename: str, keyword: str) -> str:
    """在 GitHub Actions 环境中：写文件到本地仓库 → git add → commit → push。

    同时将历史记录文件一并提交，保证下次 run 能读到去重列表。

    Returns:
        生成的文件相对路径
    """
    # 1. 确保 content/blog/ 目录存在
    target_dir = GITHUB_CONTENT_PATH
    os.makedirs(target_dir, exist_ok=True)

    # 2. 写入博客 Markdown 文件
    file_path = os.path.join(target_dir, filename)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    log.info(f"文章已写入本地: {file_path}")

    # 3. 更新历史记录（与博客文件一同提交）
    save_history(keyword, filename, CI_HISTORY_FILE)
    log.info(f"历史记录已更新: {CI_HISTORY_FILE}")

    # 4. 配置 git 用户（GitHub Actions 需要）
    git_user = os.getenv("GIT_USER_NAME", "invoiceforge-bot")
    git_email = os.getenv("GIT_USER_EMAIL", "bot@invoiceforge.app")
    subprocess.run(["git", "config", "user.name", git_user], check=True)
    subprocess.run(["git", "config", "user.email", git_email], check=True)

    # 5. git add → commit → push
    subprocess.run(["git", "add", file_path, CI_HISTORY_FILE], check=True)

    # 检查是否有改动（如果 AI 返回空或用过相同关键词生成了同名文件，可能无 diff）
    diff_result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        capture_output=True,
    )
    if diff_result.returncode == 0:
        log.warning("没有文件改动（可能同名文件内容未变），跳过 commit")
        return file_path

    commit_msg = f"docs(blog): auto-generate SEO article — {filename}"
    subprocess.run(["git", "commit", "-m", commit_msg], check=True)
    subprocess.run(["git", "push", "origin", GITHUB_BRANCH], check=True)

    log.info(f"CI 推送成功！文件: {file_path}")
    return file_path


# ============================================================
# 本地保存（dry-run 模式）
# ============================================================

def save_locally(content: str, filename: str, output_dir: str = "scripts/output"):
    """将生成的文章保存到本地目录（用于预览或调试）。"""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    log.info(f"文章已保存到本地: {filepath}")
    return filepath


# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="InvoiceForge 全自动 SEO 博客生成与部署脚本",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="CI 模式：通过 git commit + push 部署（用于 GitHub Actions），不依赖 PyGithub",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只生成文章并保存到本地 scripts/output/，不推送到 GitHub",
    )
    parser.add_argument(
        "--keyword",
        type=str,
        default=None,
        help="指定关键词（默认从词库随机选择）",
    )
    parser.add_argument(
        "--no-history",
        action="store_true",
        help="不使用历史记录避免重复",
    )
    args = parser.parse_args()

    # ---------- 1. 读取环境变量 ----------
    deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    if not deepseek_key:
        log.error("未设置环境变量 DEEPSEEK_API_KEY")
        log.error("  PowerShell: $env:DEEPSEEK_API_KEY='sk-xxxxxxxx'")
        log.error("  CMD:        set DEEPSEEK_API_KEY=sk-xxxxxxxx")
        log.error("  GitHub Actions: Settings → Secrets and variables → Actions → DEEPSEEK_API_KEY")
        sys.exit(1)

    # 本地模式需要 GITHUB_TOKEN；CI 模式不需要（用 git credential）
    if not args.ci and not args.dry_run:
        github_token = os.getenv("GITHUB_TOKEN")
        if not github_token:
            log.error("未设置环境变量 GITHUB_TOKEN（本地模式必须）")
            log.error("  PowerShell: $env:GITHUB_TOKEN='ghp_xxxxxxxx'")
            sys.exit(1)

    # ---------- 2. 选取关键词 ----------
    if args.keyword:
        keyword = args.keyword.strip()
        log.info(f"使用指定关键词: 「{keyword}」")
    else:
        # CI 模式使用仓库中的 history 文件；本地模式用 scripts/seo_history.txt
        history_file = CI_HISTORY_FILE if args.ci else "scripts/seo_history.txt"
        exclude_list = [] if args.no_history else load_history(history_file)
        keyword = pick_keyword(exclude=exclude_list)
        log.info(f"从词库随机选取关键词: 「{keyword}」")

    # ---------- 3. 生成文章 ----------
    try:
        markdown_content, article_title = generate_article(keyword, deepseek_key)
    except RuntimeError as e:
        log.error(f"文章生成失败: {e}")
        sys.exit(1)

    # ---------- 4. 生成文件名 ----------
    date_prefix = datetime.now().strftime("%Y-%m-%d")
    slug = slugify(article_title)
    filename = f"{date_prefix}-{slug}.md"
    log.info(f"文件名: {filename}")

    # ---------- 5. 部署 ----------
    if args.dry_run:
        filepath = save_locally(markdown_content, filename)
        print(f"\n✅ Dry-run 完成！文章已保存到: {filepath}")
        print(f"   关键词: {keyword}")
        print(f"   文章标题: {article_title}")

    elif args.ci:
        try:
            file_path = deploy_via_git(markdown_content, filename, keyword)
            print(f"\n✅ CI 部署成功！")
            print(f"   关键词: {keyword}")
            print(f"   文章标题: {article_title}")
            print(f"   文件路径: {file_path}")
        except subprocess.CalledProcessError as e:
            log.error(f"Git 操作失败: {e}")
            save_locally(markdown_content, filename)
            sys.exit(1)

    else:
        try:
            file_url = deploy_via_pygithub(markdown_content, filename, github_token)
            print(f"\n✅ 文章已成功推送到 GitHub！")
            print(f"   关键词: {keyword}")
            print(f"   文章标题: {article_title}")
            print(f"   在线查看: {file_url}")
            save_history(keyword, filename)
        except RuntimeError as e:
            log.error(f"GitHub 部署失败: {e}")
            save_locally(markdown_content, filename)
            sys.exit(1)


if __name__ == "__main__":
    main()
