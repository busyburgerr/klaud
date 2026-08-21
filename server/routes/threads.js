import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const threadsRouter = Router();

threadsRouter.use(requireAuth);

/** Диалог + собеседники + карточка лота одним запросом. */
const THREAD_SELECT = `
  SELECT t.*,
         l.lot, l.title, l.price,
         (SELECT url FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS img,
         b.slug AS buyer_slug,  b.name AS buyer_name,  b.last_seen_at AS buyer_last_seen_at,
         s.slug AS seller_slug, s.name AS seller_name, s.last_seen_at AS seller_last_seen_at,
         (SELECT COUNT(*) FROM messages m
           WHERE m.thread_id = t.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM threads t
    JOIN listings l ON l.id = t.listing_id
    JOIN users b    ON b.id = t.buyer_id
    JOIN users s    ON s.id = t.seller_id`;

async function loadThread(id, userId) {
  const row = await get(`${THREAD_SELECT} WHERE t.id = ?`, userId, Number(id));
  if (!row) throw notFound("Диалог не найден");
  if (row.buyer_id !== userId && row.seller_id !== userId) throw forbidden("Это чужой диалог");
  return row;
}

const messagesOf = async (threadId) =>
  all("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at, id", threadId);

// GET /api/threads — список диалогов с последним сообщением
threadsRouter.get("/", async (req, res) => {
  const rows = await all(
    `${THREAD_SELECT} WHERE t.buyer_id = ? OR t.seller_id = ? ORDER BY t.updated_at DESC`,
    req.user.id, req.user.id, req.user.id,
  );

  const items = await Promise.all(rows.map(async (row) => {
    const last = await get(
      "SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      row.id,
    );
    return S.thread(row, req.user.id, last ? [last] : []);
  }));

  res.json({ items, unread: items.reduce((sum, t) => sum + t.unread, 0) });
});

// GET /api/threads/:id — диалог целиком (и отметка сообщений прочитанными)
threadsRouter.get("/:id", async (req, res) => {
  const row = await loadThread(req.params.id, req.user.id);
  await run(
    "UPDATE messages SET read_at = now_utc() WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL",
    row.id, req.user.id,
  );
  res.json({ thread: S.thread({ ...row, unread: 0 }, req.user.id, await messagesOf(row.id)) });
});

// POST /api/threads — начать переписку по лоту («Написать продавцу»)
threadsRouter.post(
  "/",
  wrap(async (req, res) => {
    const body = v(req.body)
      .int("listingId", { required: true, min: 1 })
      .str("text", { max: 4000, fallback: "" })
      .done();

    const listing = await get("SELECT * FROM listings WHERE id = ?", body.listingId);
    if (!listing) throw notFound("Лот не найден");
    if (listing.seller_id === req.user.id) throw badRequest("Нельзя написать самому себе");

    const threadId = await tx(async () => {
      await run(
        `INSERT INTO threads (listing_id, buyer_id, seller_id) VALUES (?, ?, ?)
         ON CONFLICT (listing_id, buyer_id) DO NOTHING`,
        listing.id, req.user.id, listing.seller_id,
      );
      const id = (await get(
        "SELECT id FROM threads WHERE listing_id = ? AND buyer_id = ?",
        listing.id, req.user.id,
      )).id;

      if (body.text) {
        await run("INSERT INTO messages (thread_id, sender_id, text) VALUES (?, ?, ?)", id, req.user.id, body.text);
        await run("UPDATE threads SET updated_at = now_utc() WHERE id = ?", id);
      }
      return id;
    });

    const row = await loadThread(threadId, req.user.id);
    res.status(201).json({ thread: S.thread(row, req.user.id, await messagesOf(threadId)) });
  }),
);

// POST /api/threads/:id/messages — отправка сообщения
threadsRouter.post(
  "/:id/messages",
  wrap(async (req, res) => {
    const row = await loadThread(req.params.id, req.user.id);
    const body = v(req.body).str("text", { required: true, min: 1, max: 4000 }).done();

    const messageId = await tx(async () => {
      const { id } = await get(
        "INSERT INTO messages (thread_id, sender_id, text) VALUES (?, ?, ?) RETURNING id",
        row.id, req.user.id, body.text,
      );
      await run("UPDATE threads SET updated_at = now_utc() WHERE id = ?", row.id);
      return id;
    });

    const message = await get("SELECT * FROM messages WHERE id = ?", messageId);
    res.status(201).json({ message: S.message(message, req.user.id) });
  }),
);

// GET /api/threads/:id/messages?after=<id> — опрос новых сообщений
threadsRouter.get("/:id/messages", async (req, res) => {
  const row = await loadThread(req.params.id, req.user.id);
  const after = Number(req.query.after) || 0;

  const rows = await all(
    "SELECT * FROM messages WHERE thread_id = ? AND id > ? ORDER BY created_at, id",
    row.id, after,
  );
  res.json({ items: rows.map((m) => S.message(m, req.user.id)) });
});
