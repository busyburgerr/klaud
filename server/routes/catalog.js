import { Router } from "express";
import { all, get } from "../db/index.js";
import { notFound } from "../lib/http.js";
import { queryListings } from "../lib/listings.js";
import * as S from "../lib/serialize.js";

export const categoriesRouter = Router();
export const sellersRouter = Router();

const CATEGORY_SELECT = `
  SELECT c.*,
         (SELECT COUNT(*) FROM listings l WHERE l.cat = c.slug AND l.status = 'active') AS listing_count
    FROM categories c`;

// ── Категории ──

categoriesRouter.get("/", (_req, res) => {
  const rows = all(`${CATEGORY_SELECT} ORDER BY c.position, c.n`);
  res.json({ items: rows.map((r) => S.category(r)) });
});

categoriesRouter.get("/:slug", (req, res) => {
  const row = get(`${CATEGORY_SELECT} WHERE c.slug = ?`, req.params.slug);
  if (!row) throw notFound("Раздел не найден");
  res.json({ category: S.category(row) });
});

// ── Продавцы ──

const SELLER_SELECT = "SELECT * FROM users";

sellersRouter.get("/", (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 20);
  const rows = all(`${SELLER_SELECT} ORDER BY deals DESC, rating DESC LIMIT ?`, limit);
  res.json({ items: rows.map(S.publicUser) });
});

sellersRouter.get("/:slug", (req, res) => {
  const row = get(`${SELLER_SELECT} WHERE slug = ?`, req.params.slug);
  if (!row) throw notFound("Продавец не найден");

  const stats = get(
    `SELECT COUNT(*) AS active FROM listings WHERE seller_id = ? AND status = 'active'`,
    row.id,
  );
  res.json({ seller: { ...S.publicUser(row), activeListings: stats.active } });
});

sellersRouter.get("/:slug/listings", (req, res) => {
  const row = get("SELECT id FROM users WHERE slug = ?", req.params.slug);
  if (!row) throw notFound("Продавец не найден");

  res.json(
    queryListings(
      { ...req.query, seller: req.params.slug },
      { viewerId: req.user?.id },
    ),
  );
});
