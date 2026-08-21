import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, conflict, forbidden, notFound, wrap } from "../lib/http.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const reviewsRouter = Router();

const REVIEW_SELECT = `
  SELECT r.*,
         a.name AS author_name, a.slug AS author_slug,
         t.name AS target_name, t.slug AS target_slug,
         l.title AS listing_title, l.lot AS listing_lot
    FROM reviews r
    JOIN users a    ON a.id = r.author_id
    JOIN users t    ON t.id = r.target_id
    JOIN listings l ON l.id = r.listing_id`;

/**
 * Пересчитывает рейтинг и число сделок пользователя по его отзывам.
 * Рейтинг — среднее по оценкам, сделки — число успешных.
 */
export async function recalcRating(userId) {
  const stats = await get(
    `SELECT COUNT(*) AS total,
            COALESCE(AVG(rating), 0) AS avg,
            COALESCE(SUM(deal_success), 0) AS deals
       FROM reviews WHERE target_id = ?`,
    userId,
  );

  await run(
    "UPDATE users SET rating = ?, deals = ? WHERE id = ?",
    stats.total ? Math.round(stats.avg * 10) / 10 : 0,
    stats.deals,
    userId,
  );
  return stats;
}

// GET /api/reviews/user/:slug — отзывы о продавце
reviewsRouter.get("/user/:slug", async (req, res) => {
  const user = await get("SELECT id, rating, deals FROM users WHERE slug = ?", req.params.slug);
  if (!user) throw notFound("Пользователь не найден");

  const rows = await all(`${REVIEW_SELECT} WHERE r.target_id = ? ORDER BY r.created_at DESC LIMIT 100`, user.id);
  const summary = await get(
    `SELECT COUNT(*) AS total,
            COALESCE(AVG(rating), 0) AS avg,
            COALESCE(SUM(deal_success), 0) AS successful
       FROM reviews WHERE target_id = ?`,
    user.id,
  );
  // Разбивка по оценкам одним запросом вместо пяти отдельных COUNT.
  const byStar = await all(
    "SELECT rating, COUNT(*) AS c FROM reviews WHERE target_id = ? GROUP BY rating",
    user.id,
  );

  res.json({
    items: rows.map(S.review),
    summary: {
      total: summary.total,
      rating: summary.total ? (Math.round(summary.avg * 10) / 10).toFixed(1) : null,
      successful: summary.successful,
      failed: summary.total - summary.successful,
      breakdown: [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: byStar.find((r) => r.rating === star)?.c ?? 0,
      })),
    },
  });
});

// GET /api/reviews/listing/:id — отзыв по конкретному лоту
reviewsRouter.get("/listing/:id", async (req, res) => {
  const rows = await all(`${REVIEW_SELECT} WHERE r.listing_id = ? ORDER BY r.created_at DESC`, Number(req.params.id));
  res.json({ items: rows.map(S.review) });
});

// GET /api/reviews/pending — сделки, по которым можно оставить отзыв
reviewsRouter.get("/pending", requireAuth, async (req, res) => {
  const rows = await all(
    `SELECT l.id, l.lot, l.title, l.price, l.sold_at,
            u.name AS seller_name, u.slug AS seller_slug,
            (SELECT url FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position LIMIT 1) AS img
       FROM listings l
       JOIN users u ON u.id = l.seller_id
      WHERE l.sold_to = ? AND l.status = 'sold'
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.listing_id = l.id AND r.author_id = ?)
      ORDER BY l.sold_at DESC`,
    req.user.id, req.user.id,
  );

  res.json({
    items: rows.map((r) => ({
      listingId: r.id,
      lot: r.lot,
      title: r.title,
      img: r.img ?? "",
      seller: { name: r.seller_name, id: r.seller_slug },
      soldAt: r.sold_at,
    })),
  });
});

// POST /api/reviews — отзыв покупателя о продавце после сделки
reviewsRouter.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const body = v(req.body)
      .int("listingId", { required: true, min: 1 })
      .int("rating", { required: true, min: 1, max: 5 })
      .bool("dealSuccess", { fallback: true })
      .str("text", { max: 1000, fallback: "" })
      .done();

    const listing = await get("SELECT * FROM listings WHERE id = ?", body.listingId);
    if (!listing) throw notFound("Лот не найден");
    if (listing.status !== "sold") throw badRequest("Отзыв можно оставить только по завершённой сделке");
    if (listing.sold_to !== req.user.id) throw forbidden("Отзыв оставляет покупатель этого лота");

    const existing = await get(
      "SELECT 1 AS x FROM reviews WHERE listing_id = ? AND author_id = ?",
      listing.id, req.user.id,
    );
    if (existing) throw conflict("Вы уже оставили отзыв по этой сделке");

    const id = await tx(async () => {
      const { id: created } = await get(
        `INSERT INTO reviews (listing_id, author_id, target_id, rating, deal_success, text)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`,
        listing.id, req.user.id, listing.seller_id, body.rating, body.dealSuccess ? 1 : 0, body.text,
      );
      await recalcRating(listing.seller_id);
      return created;
    });

    res.status(201).json({ review: S.review(await get(`${REVIEW_SELECT} WHERE r.id = ?`, id)) });
  }),
);

// DELETE /api/reviews/:id — автор может забрать свой отзыв
reviewsRouter.delete(
  "/:id",
  requireAuth,
  wrap(async (req, res) => {
    const review = await get("SELECT * FROM reviews WHERE id = ?", Number(req.params.id));
    if (!review) throw notFound("Отзыв не найден");
    if (review.author_id !== req.user.id) throw forbidden("Это чужой отзыв");

    await tx(async () => {
      await run("DELETE FROM reviews WHERE id = ?", review.id);
      await recalcRating(review.target_id);
    });

    res.json({ ok: true, id: review.id });
  }),
);
