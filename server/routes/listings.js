import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, conflict, forbidden, notFound, wrap } from "../lib/http.js";
import { findListing, queryListings } from "../lib/listings.js";
import { v } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { REPORT_REASONS } from "./moderation.js";

export const listingsRouter = Router();

const CONDITIONS = ["Новое", "Отличное", "Хорошее", "Требует ремонта"];
/**
 * Статусы, которые владелец может выставить сам. Публикация (`active`) и отказ
 * (`rejected`) — только через модерацию, см. routes/moderation.js.
 */
const OWNER_STATUSES = ["sold", "archived"];

/** Следующий номер лота: 0417 → 0418. */
function nextLotNumber() {
  const max = get("SELECT MAX(CAST(lot AS INTEGER)) AS m FROM listings")?.m ?? 400;
  return String(max + 1).padStart(4, "0");
}

function ownedListing(id, userId) {
  const row = get("SELECT * FROM listings WHERE id = ?", Number(id));
  if (!row) throw notFound("Лот не найден");
  if (row.seller_id !== userId) throw forbidden("Это чужой лот");
  return row;
}

// GET /api/listings — каталог с фильтрами и поиском
listingsRouter.get("/", (req, res) => {
  res.json(queryListings(req.query, { viewerId: req.user?.id }));
});

// GET /api/listings/:id
listingsRouter.get("/:id", (req, res) => {
  const item = findListing(req.params.id, { viewerId: req.user?.id });
  if (!item) throw notFound("Лот не найден");

  run("UPDATE listings SET views = views + 1 WHERE id = ?", item.id);
  res.json({ listing: { ...item, views: item.views + 1 } });
});

// GET /api/listings/:id/related — похожие лоты того же раздела
listingsRouter.get("/:id/related", (req, res) => {
  const item = get("SELECT cat FROM listings WHERE id = ?", Number(req.params.id));
  if (!item) throw notFound("Лот не найден");

  const limit = Math.min(12, Number(req.query.limit) || 4);
  const { items } = queryListings(
    { cat: item.cat, limit: limit + 1 },
    { viewerId: req.user?.id },
  );
  res.json({ items: items.filter((l) => l.id !== Number(req.params.id)).slice(0, limit) });
});

// POST /api/listings — форма «Разместить лот»
listingsRouter.post(
  "/",
  requireAuth,
  wrap((req, res) => {
    const body = v(req.body)
      .str("title", { required: true, min: 4, max: 140 })
      .int("price", { required: true, min: 0, max: 1_000_000_000 })
      .str("cat", { required: true, max: 40 })
      .oneOf("cond", CONDITIONS, { required: true })
      .str("description", { max: 4000, fallback: "" })
      .str("location", { max: 80, fallback: req.user.city })
      .strArray("images", { max: 10, fallback: [] })
      .done();

    if (!get("SELECT 1 AS x FROM categories WHERE slug = ?", body.cat)) {
      throw badRequest("Неизвестный раздел каталога", { cat: "Раздел не найден" });
    }

    const id = tx(() => {
      run(
        `INSERT INTO listings (lot, title, price, location, cond, description, cat, seller_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        nextLotNumber(), body.title, body.price, body.location, body.cond,
        body.description, body.cat, req.user.id,
      );
      const created = get("SELECT id FROM listings WHERE rowid = last_insert_rowid()").id;
      body.images.forEach((url, i) => {
        run("INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, ?)", created, url, i);
      });
      return created;
    });

    res.status(201).json({ listing: findListing(id, { viewerId: req.user.id }) });
  }),
);

// PATCH /api/listings/:id
listingsRouter.patch(
  "/:id",
  requireAuth,
  wrap((req, res) => {
    const existing = ownedListing(req.params.id, req.user.id);

    const body = v(req.body)
      .str("title", { min: 4, max: 140 })
      .int("price", { min: 0, max: 1_000_000_000 })
      .str("cat", { max: 40 })
      .oneOf("cond", CONDITIONS)
      .str("description", { max: 4000 })
      .str("location", { max: 80 })
      .oneOf("status", OWNER_STATUSES)
      .strArray("images", { max: 10 })
      .done();

    if (body.cat && !get("SELECT 1 AS x FROM categories WHERE slug = ?", body.cat)) {
      throw badRequest("Неизвестный раздел каталога", { cat: "Раздел не найден" });
    }

    const fields = ["title", "price", "cat", "cond", "description", "location", "status"]
      .filter((f) => body[f] !== undefined);

    // Правка содержимого возвращает лот на проверку: иначе одобренный лот можно
    // было бы переписать во что угодно уже после модерации.
    const contentChanged = fields.some((f) => f !== "status") || body.images !== undefined;
    const backToQueue = contentChanged && ["active", "rejected"].includes(existing.status);

    tx(() => {
      if (fields.length) {
        run(
          `UPDATE listings SET ${fields.map((f) => `${f} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
          ...fields.map((f) => body[f]), existing.id,
        );
      }
      if (backToQueue) {
        run(
          `UPDATE listings SET status = 'pending', reject_reason = NULL, moderated_by = NULL,
                               moderated_at = NULL, updated_at = datetime('now')
            WHERE id = ?`,
          existing.id,
        );
      }
      if (body.images) {
        run("DELETE FROM listing_images WHERE listing_id = ?", existing.id);
        body.images.forEach((url, i) => {
          run("INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, ?)", existing.id, url, i);
        });
      }
    });

    res.json({ listing: findListing(existing.id, { viewerId: req.user.id }) });
  }),
);

// DELETE /api/listings/:id — снятие лота с публикации
listingsRouter.delete(
  "/:id",
  requireAuth,
  wrap((req, res) => {
    const existing = ownedListing(req.params.id, req.user.id);
    run("DELETE FROM listings WHERE id = ?", existing.id);
    res.json({ ok: true, id: existing.id });
  }),
);

// POST /api/listings/:id/resubmit — отправить отклонённый лот на повторную проверку
listingsRouter.post(
  "/:id/resubmit",
  requireAuth,
  wrap((req, res) => {
    const existing = ownedListing(req.params.id, req.user.id);
    if (existing.status !== "rejected" && existing.status !== "archived") {
      throw badRequest("На проверку отправляются только отклонённые или снятые лоты");
    }

    run(
      `UPDATE listings SET status = 'pending', reject_reason = NULL, moderated_by = NULL,
                           moderated_at = NULL, updated_at = datetime('now')
        WHERE id = ?`,
      existing.id,
    );
    res.json({ listing: findListing(existing.id, { viewerId: req.user.id }) });
  }),
);

// POST /api/listings/:id/report — жалоба покупателя на лот
listingsRouter.post(
  "/:id/report",
  requireAuth,
  wrap((req, res) => {
    const listing = get("SELECT * FROM listings WHERE id = ?", Number(req.params.id));
    if (!listing) throw notFound("Лот не найден");
    if (listing.seller_id === req.user.id) throw badRequest("Нельзя пожаловаться на собственный лот");

    const body = v(req.body)
      .oneOf("reason", REPORT_REASONS, { required: true })
      .str("comment", { max: 500, fallback: "" })
      .done();

    const existing = get(
      "SELECT 1 AS x FROM reports WHERE listing_id = ? AND reporter_id = ?",
      listing.id, req.user.id,
    );
    if (existing) throw conflict("Вы уже жаловались на этот лот");

    run(
      "INSERT INTO reports (listing_id, reporter_id, reason, comment) VALUES (?, ?, ?, ?)",
      listing.id, req.user.id, body.reason, body.comment,
    );
    res.status(201).json({ ok: true });
  }),
);

// GET /api/listings/meta/report-reasons — варианты для формы жалобы
listingsRouter.get("/meta/report-reasons", (_req, res) => {
  res.json({ reasons: REPORT_REASONS });
});

// GET /api/listings/meta/filters — значения для фильтров каталога
listingsRouter.get("/meta/filters", (_req, res) => {
  res.json({
    conditions: CONDITIONS,
    locations: all("SELECT DISTINCT location FROM listings ORDER BY location").map((r) => r.location),
    sorts: [
      { key: "new", label: "Сначала новые" },
      { key: "price_asc", label: "Дешевле" },
      { key: "price_desc", label: "Дороже" },
      { key: "popular", label: "Популярные" },
    ],
    price: get("SELECT MIN(price) AS min, MAX(price) AS max FROM listings WHERE status = 'active'"),
  });
});
