import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { blocksText, firstParagraph, parseBlocks } from "../lib/blocks.js";
import { formatRuDate, slugify } from "../lib/format.js";
import { badRequest, notFound, wrap } from "../lib/http.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { hasRole, requireRole } from "../middleware/auth.js";
import { logAction } from "./moderation.js";

export const articlesRouter = Router();

/** Рубрики-подсказки для автора. Список не закрыт: можно завести свою. */
export const RUBRICS = [
  "Гид продавца",
  "Репортаж",
  "Инструкция",
  "Мастерская",
  "Тренды",
  "Новости",
];

/** Черновики и редактирование доступны модераторам и администраторам. */
const isStaff = (req) => hasRole(req.user, "moderator");

// ── Чтение ──

articlesRouter.get("/", async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const where = [];
  const params = [];

  if (!isStaff(req)) {
    where.push("status = 'published'");
  } else if (req.query.status === "draft" || req.query.status === "published") {
    where.push("status = ?");
    params.push(req.query.status);
  }

  if (req.query.rubric) {
    where.push("rubric = ?");
    params.push(req.query.rubric);
  }

  const sql = `SELECT * FROM articles${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
               ORDER BY published_at DESC LIMIT ?`;

  res.json({
    items: (await all(sql, ...params, limit)).map(S.article),
    rubrics: (await all(
      `SELECT DISTINCT rubric FROM articles${isStaff(req) ? "" : " WHERE status = 'published'"}
        ORDER BY rubric`,
    )).map((r) => r.rubric),
    suggestedRubrics: RUBRICS,
    canEdit: isStaff(req),
    drafts: isStaff(req) ? (await get("SELECT COUNT(*) AS c FROM articles WHERE status = 'draft'")).c : 0,
  });
});

articlesRouter.get("/:slug", async (req, res) => {
  const row = await get("SELECT * FROM articles WHERE slug = ?", req.params.slug);
  // Черновик для постороннего не существует.
  if (!row || (row.status === "draft" && !isStaff(req))) throw notFound("Материал не найден");

  const more = (await all(
    `SELECT * FROM articles WHERE slug != ? AND status = 'published'
      ORDER BY published_at DESC LIMIT 3`,
    req.params.slug,
  )).map(S.article);

  res.json({ article: S.article(row), more, canEdit: isStaff(req) });
});

// ── Редакция: роль moderator или admin ──

/** Свободный адрес материала: «Как продать» → kak-prodat, kak-prodat-2, … */
async function uniqueSlug(title) {
  const base = slugify(title).slice(0, 60) || "material";
  let candidate = base;
  let i = 2;
  while (await get("SELECT 1 AS x FROM articles WHERE slug = ?", candidate)) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

/** Время чтения по объёму текста: около 1000 знаков в минуту. */
const readingTime = (blocks) =>
  `${Math.max(1, Math.round(blocksText(blocks).length / 1000))} мин`;

/** Разбор полей материала; при создании обязательные поля проверяются строго. */
function articleInput(body, { required = false } = {}) {
  return v(body)
    .str("title", { required, min: 6, max: 160 })
    .str("rubric", { required, min: 2, max: 40 })
    .str("excerpt", { max: 400 })
    .str("img", { max: 500 })
    .str("author", { max: 80 })
    .oneOf("status", ["draft", "published"])
    .done();
}

// POST /api/articles — новый материал
articlesRouter.post(
  "/",
  requireRole("moderator"),
  wrap(async (req, res) => {
    const input = articleInput(req.body, { required: true });
    const blocks = parseBlocks(req.body?.body ?? []);

    if (!blocks.length) {
      throw badRequest("Материал не может быть пустым", { body: "Добавьте хотя бы один блок" });
    }

    const slug = await uniqueSlug(input.title);
    const status = input.status ?? "published";

    await tx(async () => {
      await run(
        `INSERT INTO articles
           (slug, rubric, title, excerpt, author, author_id, date, read, img, body, status, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now_utc(), now_utc())`,
        slug,
        input.rubric,
        input.title,
        input.excerpt || firstParagraph(blocks).slice(0, 220),
        input.author || req.user.name,
        req.user.id,
        formatRuDate(new Date().toISOString()),
        readingTime(blocks),
        input.img ?? "",
        JSON.stringify(blocks),
        status,
      );
      await logAction(
        req.user.id,
        status === "draft" ? "article.draft" : "article.publish",
        "article", 0, null, input.title,
      );
    });

    res.status(201).json({ article: S.article(await get("SELECT * FROM articles WHERE slug = ?", slug)) });
  }),
);

// PATCH /api/articles/:slug — правка материала
articlesRouter.patch(
  "/:slug",
  requireRole("moderator"),
  wrap(async (req, res) => {
    const existing = await get("SELECT * FROM articles WHERE slug = ?", req.params.slug);
    if (!existing) throw notFound("Материал не найден");

    const input = articleInput(req.body);
    const updates = {};

    for (const field of ["title", "rubric", "excerpt", "img", "author", "status"]) {
      if (input[field] !== undefined) updates[field] = input[field];
    }

    if (req.body?.body !== undefined) {
      const blocks = parseBlocks(req.body.body);
      if (!blocks.length) {
        throw badRequest("Материал не может быть пустым", { body: "Добавьте хотя бы один блок" });
      }
      updates.body = JSON.stringify(blocks);
      updates.read = readingTime(blocks);
    }

    // Черновик, который публикуют впервые, датируется днём публикации.
    if (updates.status === "published" && existing.status === "draft") {
      updates.date = formatRuDate(new Date().toISOString());
      updates.published_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    }

    const keys = Object.keys(updates);
    if (!keys.length) throw badRequest("Нечего сохранять");

    await tx(async () => {
      await run(
        `UPDATE articles SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = now_utc()
          WHERE slug = ?`,
        ...keys.map((k) => updates[k]), existing.slug,
      );
      await logAction(req.user.id, "article.edit", "article", 0, null, updates.title ?? existing.title);
    });

    res.json({ article: S.article(await get("SELECT * FROM articles WHERE slug = ?", existing.slug)) });
  }),
);

// DELETE /api/articles/:slug
articlesRouter.delete(
  "/:slug",
  requireRole("moderator"),
  wrap(async (req, res) => {
    const existing = await get("SELECT * FROM articles WHERE slug = ?", req.params.slug);
    if (!existing) throw notFound("Материал не найден");

    await tx(async () => {
      await run("DELETE FROM articles WHERE slug = ?", existing.slug);
      await logAction(req.user.id, "article.delete", "article", 0, null, existing.title);
    });

    res.json({ ok: true, slug: existing.slug });
  }),
);
