import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, notFound, wrap } from "../lib/http.js";
import { LISTING_SELECT, imagesFor, pagination } from "../lib/listings.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireRole } from "../middleware/auth.js";

export const moderationRouter = Router();

moderationRouter.use(requireRole("moderator"));

/** Причины жалоб, из которых выбирает покупатель. */
export const REPORT_REASONS = [
  "Подозрение на мошенничество",
  "Запрещённый товар",
  "Неверная категория или описание",
  "Спам или реклама",
  "Оскорбительный контент",
];

/** Запись действия в журнал модерации. */
export function logAction(actorId, action, targetType, targetId, reason = null, details = null) {
  run(
    `INSERT INTO moderation_log (actor_id, action, target_type, target_id, reason, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    actorId, action, targetType, targetId, reason, details,
  );
}

const listingRow = (id) => {
  const row = get(`${LISTING_SELECT} WHERE l.id = ?`, Number(id));
  if (!row) throw notFound("Лот не найден");
  return row;
};

const serialize = (row) => S.listing(row, { images: imagesFor([row.id]).get(row.id) || [] });

// GET /api/moderation/stats — счётчики для панели
moderationRouter.get("/stats", (_req, res) => {
  res.json({
    pending: get("SELECT COUNT(*) AS c FROM listings WHERE status = 'pending'").c,
    rejected: get("SELECT COUNT(*) AS c FROM listings WHERE status = 'rejected'").c,
    active: get("SELECT COUNT(*) AS c FROM listings WHERE status = 'active'").c,
    openReports: get("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").c,
    today: get(
      `SELECT COUNT(*) AS c FROM moderation_log WHERE date(created_at) = date('now')`,
    ).c,
  });
});

// GET /api/moderation/queue?status=pending — очередь проверки
moderationRouter.get("/queue", (req, res) => {
  const status = ["pending", "rejected", "active", "archived", "sold"].includes(req.query.status)
    ? req.query.status
    : "pending";
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 30 });

  const total = get("SELECT COUNT(*) AS c FROM listings WHERE status = ?", status).c;
  const rows = all(
    `${LISTING_SELECT} WHERE l.status = ? ORDER BY l.created_at ASC LIMIT ? OFFSET ?`,
    status, limit, offset,
  );
  const images = imagesFor(rows.map((r) => r.id));

  res.json({
    items: rows.map((r) => S.listing(r, { images: images.get(r.id) || [] })),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

// POST /api/moderation/listings/:id/approve — публикация лота
moderationRouter.post(
  "/listings/:id/approve",
  wrap((req, res) => {
    const row = listingRow(req.params.id);
    if (row.status === "active") throw badRequest("Лот уже опубликован");

    tx(() => {
      run(
        `UPDATE listings
            SET status = 'active', reject_reason = NULL, moderated_by = ?,
                moderated_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?`,
        req.user.id, row.id,
      );
      logAction(req.user.id, "listing.approve", "listing", row.id);
    });

    res.json({ listing: serialize(listingRow(row.id)) });
  }),
);

// POST /api/moderation/listings/:id/reject — отклонение с причиной
moderationRouter.post(
  "/listings/:id/reject",
  wrap((req, res) => {
    const row = listingRow(req.params.id);
    const body = v(req.body).str("reason", { required: true, min: 5, max: 500 }).done();

    tx(() => {
      run(
        `UPDATE listings
            SET status = 'rejected', reject_reason = ?, moderated_by = ?,
                moderated_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?`,
        body.reason, req.user.id, row.id,
      );
      logAction(req.user.id, "listing.reject", "listing", row.id, body.reason);
    });

    res.json({ listing: serialize(listingRow(row.id)) });
  }),
);

// POST /api/moderation/listings/:id/archive — снятие опубликованного лота
moderationRouter.post(
  "/listings/:id/archive",
  wrap((req, res) => {
    const row = listingRow(req.params.id);
    const body = v(req.body).str("reason", { max: 500, fallback: "" }).done();

    tx(() => {
      run(
        `UPDATE listings
            SET status = 'archived', moderated_by = ?, moderated_at = datetime('now'),
                updated_at = datetime('now')
          WHERE id = ?`,
        req.user.id, row.id,
      );
      logAction(req.user.id, "listing.archive", "listing", row.id, body.reason || null);
    });

    res.json({ listing: serialize(listingRow(row.id)) });
  }),
);

// GET /api/moderation/reports?status=open — жалобы покупателей
moderationRouter.get("/reports", (req, res) => {
  const status = ["open", "resolved", "dismissed"].includes(req.query.status)
    ? req.query.status
    : "open";

  const rows = all(
    `SELECT r.*,
            l.title AS listing_title, l.lot AS listing_lot, l.status AS listing_status,
            u.name AS reporter_name, u.slug AS reporter_slug,
            m.name AS resolver_name
       FROM reports r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u    ON u.id = r.reporter_id
       LEFT JOIN users m ON m.id = r.resolved_by
      WHERE r.status = ?
      ORDER BY r.created_at DESC
      LIMIT 100`,
    status,
  );

  res.json({ items: rows.map(S.report), reasons: REPORT_REASONS });
});

// POST /api/moderation/reports/:id/resolve — жалоба обработана или отклонена
moderationRouter.post(
  "/reports/:id/resolve",
  wrap((req, res) => {
    const report = get("SELECT * FROM reports WHERE id = ?", Number(req.params.id));
    if (!report) throw notFound("Жалоба не найдена");

    const body = v(req.body)
      .oneOf("status", ["resolved", "dismissed"], { required: true })
      .str("comment", { max: 500, fallback: "" })
      .done();

    tx(() => {
      run(
        `UPDATE reports SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?`,
        body.status, req.user.id, report.id,
      );
      logAction(
        req.user.id,
        body.status === "resolved" ? "report.resolve" : "report.dismiss",
        "report", report.id, body.comment || null,
      );
    });

    res.json({ ok: true, id: report.id, status: body.status });
  }),
);

// GET /api/moderation/log — журнал действий персонала
moderationRouter.get("/log", (req, res) => {
  const { limit, page, offset } = pagination(req.query, { defaultLimit: 50 });

  const total = get("SELECT COUNT(*) AS c FROM moderation_log").c;
  const rows = all(
    `SELECT g.*, u.name AS actor_name, u.slug AS actor_slug, u.role AS actor_role
       FROM moderation_log g
       LEFT JOIN users u ON u.id = g.actor_id
      ORDER BY g.created_at DESC, g.id DESC
      LIMIT ? OFFSET ?`,
    limit, offset,
  );

  res.json({
    items: rows.map(S.logEntry),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});
