import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireRole } from "../middleware/auth.js";
import { logAction } from "./moderation.js";

export const adminRouter = Router();

adminRouter.use(requireRole("admin"));

const ROLES = ["user", "moderator", "admin"];

const USER_SELECT = `
  SELECT u.*,
         (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id) AS listing_count
    FROM users u`;

function targetUser(id) {
  const row = get(`${USER_SELECT} WHERE u.id = ?`, Number(id));
  if (!row) throw notFound("Пользователь не найден");
  return row;
}

// GET /api/admin/users?q=&role= — список аккаунтов
adminRouter.get("/users", (req, res) => {
  const where = [];
  const params = [];

  if (ROLES.includes(req.query.role)) {
    where.push("u.role = ?");
    params.push(req.query.role);
  }
  const q = String(req.query.q || "").trim();
  if (q) {
    where.push("(u.name LIKE ? OR u.phone LIKE ? OR u.slug LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql = `${USER_SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
               ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
                        u.created_at DESC
               LIMIT 200`;

  res.json({ items: all(sql, ...params).map(S.staffUser), roles: ROLES });
});

// GET /api/admin/stats — сводка для панели администратора
adminRouter.get("/stats", (_req, res) => {
  const roles = all("SELECT role, COUNT(*) AS c FROM users GROUP BY role");
  res.json({
    users: get("SELECT COUNT(*) AS c FROM users").c,
    admins: roles.find((r) => r.role === "admin")?.c ?? 0,
    moderators: roles.find((r) => r.role === "moderator")?.c ?? 0,
    blocked: get("SELECT COUNT(*) AS c FROM users WHERE blocked_at IS NOT NULL").c,
  });
});

// PATCH /api/admin/users/:id/role — назначение и снятие модератора
adminRouter.patch(
  "/users/:id/role",
  wrap((req, res) => {
    const user = targetUser(req.params.id);
    const body = v(req.body).oneOf("role", ROLES, { required: true }).done();

    if (user.id === req.user.id) throw badRequest("Нельзя изменить собственную роль");
    if (user.role === body.role) throw badRequest("У пользователя уже эта роль");

    // Последний администратор не должен исчезнуть — иначе панель станет недоступна.
    if (user.role === "admin" && body.role !== "admin") {
      const admins = get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").c;
      if (admins <= 1) throw badRequest("Это последний администратор — сначала назначьте другого");
    }

    tx(() => {
      run("UPDATE users SET role = ? WHERE id = ?", body.role, user.id);
      logAction(req.user.id, "user.role", "user", user.id, null, `${user.role} → ${body.role}`);
    });

    res.json({ user: S.staffUser(targetUser(user.id)) });
  }),
);

// POST /api/admin/users/:id/block — блокировка аккаунта
adminRouter.post(
  "/users/:id/block",
  wrap((req, res) => {
    const user = targetUser(req.params.id);
    const body = v(req.body).str("reason", { required: true, min: 5, max: 300 }).done();

    if (user.id === req.user.id) throw badRequest("Нельзя заблокировать самого себя");
    if (user.role === "admin") throw forbidden("Администратора нельзя заблокировать");

    tx(() => {
      run(
        "UPDATE users SET blocked_at = datetime('now'), blocked_reason = ? WHERE id = ?",
        body.reason, user.id,
      );
      // Лоты заблокированного продавца уходят из каталога.
      run("UPDATE listings SET status = 'archived' WHERE seller_id = ? AND status = 'active'", user.id);
      logAction(req.user.id, "user.block", "user", user.id, body.reason);
    });

    res.json({ user: S.staffUser(targetUser(user.id)) });
  }),
);

// POST /api/admin/users/:id/unblock
adminRouter.post(
  "/users/:id/unblock",
  wrap((req, res) => {
    const user = targetUser(req.params.id);
    if (!user.blocked_at) throw badRequest("Пользователь не заблокирован");

    tx(() => {
      run("UPDATE users SET blocked_at = NULL, blocked_reason = NULL WHERE id = ?", user.id);
      logAction(req.user.id, "user.unblock", "user", user.id);
    });

    res.json({ user: S.staffUser(targetUser(user.id)) });
  }),
);
