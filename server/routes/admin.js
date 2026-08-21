import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import * as S from "../lib/serialize.js";
import { hasStorefront, isPublisher, PLANS, PLAN_KEYS } from "../lib/plans.js";
import { PERIODS, monthlyTrend, periodStats, projectStats } from "../lib/stats.js";
import { v } from "../lib/validate.js";
import { requireRole } from "../middleware/auth.js";
import { logAction } from "./moderation.js";

export const adminRouter = Router();

adminRouter.use(requireRole("admin"));

const ROLES = ["user", "moderator", "admin"];

const USER_SELECT = `
  SELECT u.*,
         (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id) AS listing_count,
         (SELECT p.publisher_id FROM publisher_shops p WHERE p.member_id = u.id) AS publisher_id
    FROM users u`;

async function targetUser(id) {
  const row = await get(`${USER_SELECT} WHERE u.id = ?`, Number(id));
  if (!row) throw notFound("Пользователь не найден");
  return row;
}

// GET /api/admin/users?q=&role= — список аккаунтов
adminRouter.get("/users", async (req, res) => {
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

  // Списки для выпадающих меню: издатели и сотрудники редакции.
  const publishers = await all(
    `SELECT u.id, u.name, COALESCE(s.brand, u.name) AS brand
       FROM users u LEFT JOIN storefronts s ON s.user_id = u.id
      WHERE u.plan = 'edition' ORDER BY u.name`,
  );
  const staff = await all(
    "SELECT id, name, role FROM users WHERE role IN ('moderator', 'admin') ORDER BY name",
  );

  res.json({
    items: (await all(sql, ...params)).map(S.staffUser),
    roles: ROLES,
    publishers: publishers.map((p) => ({ userId: p.id, name: p.brand })),
    staff: staff.map((p) => ({ userId: p.id, name: p.name, role: p.role })),
  });
});

// GET /api/admin/stats — сводка для панели администратора
adminRouter.get("/stats", async (_req, res) => {
  const roles = await all("SELECT role, COUNT(*) AS c FROM users GROUP BY role");
  res.json({
    users: (await get("SELECT COUNT(*) AS c FROM users")).c,
    admins: roles.find((r) => r.role === "admin")?.c ?? 0,
    moderators: roles.find((r) => r.role === "moderator")?.c ?? 0,
    blocked: (await get("SELECT COUNT(*) AS c FROM users WHERE blocked_at IS NOT NULL")).c,
  });
});

// GET /api/admin/overview — статистика проекта за всё время и по периодам
adminRouter.get("/overview", async (_req, res) => {
  res.json({
    ...(await projectStats()),
    trend: await monthlyTrend(12),
    periodKeys: Object.entries(PERIODS).map(([key, p]) => ({ key, label: p.label })),
  });
});

// GET /api/admin/overview/:period — показатели одного периода
adminRouter.get(
  "/overview/:period",
  wrap(async (req, res) => {
    if (!PERIODS[req.params.period]) throw badRequest("Неизвестный период");
    res.json({ stats: await periodStats(req.params.period) });
  }),
);

// PATCH /api/admin/users/:id/role — назначение и снятие модератора
adminRouter.patch(
  "/users/:id/role",
  wrap(async (req, res) => {
    const user = await targetUser(req.params.id);
    const body = v(req.body).oneOf("role", ROLES, { required: true }).done();

    if (user.id === req.user.id) throw badRequest("Нельзя изменить собственную роль");
    if (user.role === body.role) throw badRequest("У пользователя уже эта роль");

    // Последний администратор не должен исчезнуть — иначе панель станет недоступна.
    if (user.role === "admin" && body.role !== "admin") {
      const admins = (await get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")).c;
      if (admins <= 1) throw badRequest("Это последний администратор — сначала назначьте другого");
    }

    await tx(async () => {
      await run("UPDATE users SET role = ? WHERE id = ?", body.role, user.id);
      await logAction(req.user.id, "user.role", "user", user.id, null, `${user.role} → ${body.role}`);
    });

    res.json({ user: S.staffUser(await targetUser(user.id)) });
  }),
);

// PATCH /api/admin/users/:id/plan — назначение тарифа продавцу
// Оплата не подключена, поэтому тариф ставит администратор вручную.
adminRouter.patch(
  "/users/:id/plan",
  wrap(async (req, res) => {
    const user = await targetUser(req.params.id);
    const body = v(req.body)
      .oneOf("plan", PLAN_KEYS, { required: true })
      .int("months", { min: 1, max: 36 })
      .done();

    // «Полка» бессрочна, платный тариф считаем от сегодняшнего дня.
    const months = body.plan === "shelf" ? null : (body.months || 12);

    await tx(async () => {
      await run(
        `UPDATE users SET plan = ?, plan_until = CASE WHEN ?::int IS NULL THEN NULL
                                                      ELSE now_utc() + ?::int * interval '1 month' END
          WHERE id = ?`,
        body.plan, months, months, user.id,
      );
      await logAction(
        req.user.id, "user.plan", "user", user.id, null,
        `${PLANS[user.plan]?.label ?? user.plan} → ${PLANS[body.plan].label}`
          + (months ? ` на ${months} мес.` : ""),
      );
    });

    res.json({ user: S.staffUser(await targetUser(user.id)) });
  }),
);

// PATCH /api/admin/users/:id/publisher — включить витрину в издательский дом
adminRouter.patch(
  "/users/:id/publisher",
  wrap(async (req, res) => {
    const user = await targetUser(req.params.id);
    const publisherId = req.body?.publisherId == null ? null : Number(req.body.publisherId);

    if (publisherId === null) {
      await tx(async () => {
        await run("DELETE FROM publisher_shops WHERE member_id = ?", user.id);
        await logAction(req.user.id, "user.publisher", "user", user.id, null, "витрина вне издания");
      });
      return res.json({ user: S.staffUser(await targetUser(user.id)) });
    }

    const publisher = await get("SELECT * FROM users WHERE id = ?", publisherId);
    if (!publisher || !isPublisher(publisher)) {
      throw badRequest("Издателем может быть только аккаунт на тарифе «Издание»");
    }
    if (publisher.id === user.id) throw badRequest("Издатель уже ведёт собственную витрину");
    if (!hasStorefront(user)) throw badRequest("Сначала подключите витрине тариф «Витрина» или «Издание»");

    await tx(async () => {
      // Витрина принадлежит одному изданию — прежнюю связь снимаем.
      await run("DELETE FROM publisher_shops WHERE member_id = ?", user.id);
      await run(
        `INSERT INTO publisher_shops (publisher_id, member_id, position)
         VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM publisher_shops WHERE publisher_id = ?))`,
        publisher.id, user.id, publisher.id,
      );
      await logAction(
        req.user.id, "user.publisher", "user", user.id, null, `витрина вошла в издание «${publisher.name}»`,
      );
    });

    res.json({ user: S.staffUser(await targetUser(user.id)) });
  }),
);

// PATCH /api/admin/users/:id/editor — закрепить личного редактора за изданием
adminRouter.patch(
  "/users/:id/editor",
  wrap(async (req, res) => {
    const user = await targetUser(req.params.id);
    const editorId = req.body?.editorId == null ? null : Number(req.body.editorId);

    if (editorId !== null) {
      const editor = await get("SELECT * FROM users WHERE id = ?", editorId);
      if (!editor || editor.role === "user") {
        throw badRequest("Редактором издания может быть модератор или администратор");
      }
    }

    await tx(async () => {
      await run("UPDATE users SET editor_id = ? WHERE id = ?", editorId, user.id);
      await logAction(req.user.id, "user.editor", "user", user.id, null,
        editorId ? "назначен редактор издания" : "редактор издания снят");
    });

    res.json({ user: S.staffUser(await targetUser(user.id)) });
  }),
);

// POST /api/admin/users/:id/block — блокировка аккаунта
adminRouter.post(
  "/users/:id/block",
  wrap(async (req, res) => {
    const user = await targetUser(req.params.id);
    const body = v(req.body).str("reason", { required: true, min: 5, max: 300 }).done();

    if (user.id === req.user.id) throw badRequest("Нельзя заблокировать самого себя");
    if (user.role === "admin") throw forbidden("Администратора нельзя заблокировать");

    await tx(async () => {
      await run(
        "UPDATE users SET blocked_at = now_utc(), blocked_reason = ? WHERE id = ?",
        body.reason, user.id,
      );
      // Лоты заблокированного продавца уходят из каталога.
      await run("UPDATE listings SET status = 'archived' WHERE seller_id = ? AND status = 'active'", user.id);
      await logAction(req.user.id, "user.block", "user", user.id, body.reason);
    });

    res.json({ user: S.staffUser(await targetUser(user.id)) });
  }),
);

// POST /api/admin/users/:id/unblock
adminRouter.post(
  "/users/:id/unblock",
  wrap(async (req, res) => {
    const user = await targetUser(req.params.id);
    if (!user.blocked_at) throw badRequest("Пользователь не заблокирован");

    await tx(async () => {
      await run("UPDATE users SET blocked_at = NULL, blocked_reason = NULL WHERE id = ?", user.id);
      await logAction(req.user.id, "user.unblock", "user", user.id);
    });

    res.json({ user: S.staffUser(await targetUser(user.id)) });
  }),
);
