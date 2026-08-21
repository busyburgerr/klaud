import { Router } from "express";
import bcrypt from "bcryptjs";
import { get, run } from "../db/index.js";
import { badRequest, conflict, wrap } from "../lib/http.js";
import { queryListings } from "../lib/listings.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);

// GET /api/profile — данные шапки личного кабинета
profileRouter.get("/", async (req, res) => {
  res.json({ user: S.privateUser(req.user) });
});

// GET /api/profile/stats — плитка «активных лотов / в избранном / сделок / рейтинг»
profileRouter.get("/stats", async (req, res) => {
  const listings = await get(
    `SELECT
       COUNT(*)                                        AS total,
       SUM(CASE WHEN status = 'active'  THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'sold'    THEN 1 ELSE 0 END) AS sold,
       COALESCE(SUM(views), 0)                         AS views
     FROM listings WHERE seller_id = ?`,
    req.user.id,
  );
  const saved = (await get("SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?", req.user.id)).c;
  const unread = (await get(
    `SELECT COUNT(*) AS c FROM messages m
       JOIN threads t ON t.id = m.thread_id
      WHERE m.sender_id != ? AND m.read_at IS NULL AND (t.buyer_id = ? OR t.seller_id = ?)`,
    req.user.id, req.user.id, req.user.id,
  )).c;

  res.json({
    listings: {
      total: listings.total,
      active: listings.active ?? 0,
      pending: listings.pending ?? 0,
      sold: listings.sold ?? 0,
      views: listings.views,
    },
    saved,
    unreadMessages: unread,
    deals: req.user.deals,
    rating: Number(req.user.rating).toFixed(1),
  });
});

// GET /api/profile/listings — вкладка «Мои объявления» (все статусы)
profileRouter.get("/listings", async (req, res) => {
  res.json(
    await queryListings(
      { status: "all", ...req.query, seller: req.user.slug },
      { viewerId: req.user.id },
    ),
  );
});

// PATCH /api/profile — форма «Настройки»
profileRouter.patch(
  "/",
  wrap(async (req, res) => {
    const notify = req.body?.notify ?? {};
    const body = v({ ...req.body, ...prefixed(notify) })
      .str("name", { min: 2, max: 80 })
      .str("city", { max: 80 })
      .str("bio", { max: 1000 })
      .oneOf("type", ["Частное лицо", "Магазин"])
      .bool("notify_deals")
      .bool("notify_journal")
      .bool("notify_promo")
      .done();

    // Почта: пустая строка снимает привязку.
    if (req.body?.email !== undefined) {
      const raw = String(req.body.email ?? "").trim().toLowerCase();
      if (!raw) {
        body.email = null;
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw) || raw.length > 160) {
          throw badRequest("Проверьте адрес почты", { email: "Некорректный адрес" });
        }
        const taken = await get("SELECT id FROM users WHERE email = ? AND id != ?", raw, req.user.id);
        if (taken) throw conflict("Эта почта уже привязана к другому аккаунту");
        body.email = raw;
      }
    }

    if (req.body?.phone !== undefined) {
      const { phone } = v(req.body).phone("phone").done();
      const taken = await get("SELECT id FROM users WHERE phone = ? AND id != ?", phone, req.user.id);
      if (taken) throw conflict("Этот номер уже занят другим аккаунтом");
      body.phone = phone;
    }

    const fields = ["name", "city", "bio", "type", "phone", "email", "notify_deals", "notify_journal", "notify_promo"]
      .filter((f) => body[f] !== undefined);

    if (fields.length) {
      await run(
        `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`,
        ...fields.map((f) => (typeof body[f] === "boolean" ? Number(body[f]) : body[f])),
        req.user.id,
      );
    }

    res.json({ user: S.privateUser(await get("SELECT * FROM users WHERE id = ?", req.user.id)) });
  }),
);

// POST /api/profile/password
profileRouter.post(
  "/password",
  wrap(async (req, res) => {
    const body = v(req.body)
      .str("current", { required: true, max: 100, trim: false })
      .str("next", { required: true, min: 8, max: 100, trim: false })
      .done();

    if (!bcrypt.compareSync(body.current, req.user.password_hash)) {
      throw badRequest("Текущий пароль указан неверно", { current: "Неверный пароль" });
    }

    await run("UPDATE users SET password_hash = ? WHERE id = ?", bcrypt.hashSync(body.next, 10), req.user.id);
    res.json({ ok: true });
  }),
);

/** { deals, journal, promo } → { notify_deals, notify_journal, notify_promo } */
function prefixed(notify) {
  const out = {};
  for (const key of ["deals", "journal", "promo"]) {
    if (notify?.[key] !== undefined) out[`notify_${key}`] = notify[key];
  }
  return out;
}
