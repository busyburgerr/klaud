import { Router } from "express";
import { all, get, run } from "../db/index.js";
import { notFound } from "../lib/http.js";
import { queryListings } from "../lib/listings.js";
import { requireAuth } from "../middleware/auth.js";

export const favoritesRouter = Router();

favoritesRouter.use(requireAuth);

const requireListing = async (id) => {
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || !await get("SELECT 1 AS x FROM listings WHERE id = ?", listingId)) {
    throw notFound("Лот не найден");
  }
  return listingId;
};

// GET /api/favorites — вкладка «Избранное» личного кабинета
favoritesRouter.get("/", async (req, res) => {
  res.json(
    await queryListings(
      { status: "all", ...req.query },
      { viewerId: req.user.id, favoritedBy: req.user.id },
    ),
  );
});

// GET /api/favorites/ids — компактный список для подсветки сердечек
favoritesRouter.get("/ids", async (req, res) => {
  const ids = (await all(
    "SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC",
    req.user.id,
  )).map((r) => r.listing_id);
  res.json({ ids });
});

// PUT /api/favorites/:listingId
favoritesRouter.put("/:listingId", async (req, res) => {
  const listingId = await requireListing(req.params.listingId);
  await run(
    "INSERT INTO favorites (user_id, listing_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
    req.user.id, listingId,
  );
  res.json({ wished: true, listingId });
});

// DELETE /api/favorites/:listingId
favoritesRouter.delete("/:listingId", async (req, res) => {
  const listingId = Number(req.params.listingId);
  await run("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?", req.user.id, listingId);
  res.json({ wished: false, listingId });
});

// POST /api/favorites/:listingId/toggle — под сердечко на карточке лота
favoritesRouter.post("/:listingId/toggle", async (req, res) => {
  const listingId = await requireListing(req.params.listingId);
  const existing = await get(
    "SELECT 1 AS x FROM favorites WHERE user_id = ? AND listing_id = ?",
    req.user.id, listingId,
  );

  if (existing) {
    await run("DELETE FROM favorites WHERE user_id = ? AND listing_id = ?", req.user.id, listingId);
    return res.json({ wished: false, listingId });
  }
  await run("INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)", req.user.id, listingId);
  res.json({ wished: true, listingId });
});
