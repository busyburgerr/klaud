import { Router } from "express";
import { all, get, run } from "../db/index.js";
import { notFound } from "../lib/http.js";
import { queryListings } from "../lib/listings.js";
import { requireAuth } from "../middleware/auth.js";

export const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

const requireListing = (id) => {
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || !get("SELECT 1 AS x FROM listings WHERE id = ?", listingId)) {
    throw notFound("Лот не найден");
  }
  return listingId;
};

// GET /api/favorites — вкладка «Избранное» личного кабинета
favoritesRouter.get("/", (req, res) => {
  res.json(
    queryListings(
      { status: "all", ...req.query },
      { viewerId: req.user.id, favoritedBy: req.user.id },
    ),
  );
});

// GET /api/favorites/ids — компактный список для подсветки сердечек
favoritesRouter.get("/ids", (req, res) => {
  const ids = all(
    "SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC",
    req.user.id,
  ).map((r) => r.listing_id);
  res.json({ ids });
});

// PUT /api/favorites/:listingId
favoritesRouter.put("/:listingId", (req, res) => {
  const listingId = requireListing(req.params.listingId);
  run(
    "INSERT INTO favorites (user_id, listing_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
    req.user.id, listingId,
  );
  res.json({ wished: true, listingId });
});

// DELETE /api/favorites/:listingId
favoritesRouter.delete("/:listingId", (req, res) => {
  const listingId = Number(req.params.listingId);
  run("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?", req.user.id, listingId);
  res.json({ wished: false, listingId });
});

// POST /api/favorites/:listingId/toggle — под сердечко на карточке лота
favoritesRouter.post("/:listingId/toggle", (req, res) => {
  const listingId = requireListing(req.params.listingId);
  const existing = get(
    "SELECT 1 AS x FROM favorites WHERE user_id = ? AND listing_id = ?",
    req.user.id, listingId,
  );

  if (existing) {
    run("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?", req.user.id, listingId);
    return res.json({ wished: false, listingId });
  }
  run("INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)", req.user.id, listingId);
  res.json({ wished: true, listingId });
});
