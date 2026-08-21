import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import { imagesFor, LISTING_SELECT } from "../lib/listings.js";
import { effectivePlan, hasStorefront } from "../lib/plans.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { loadStorefront } from "./storefront.js";

export const publishersRouter = Router();
/** Кабинет издателя — монтируется в /api/profile/publisher. */
export const publisherCabinetRouter = Router();
/** Сторона витрины: приглашения в издание — /api/profile/edition. */
export const editionRouter = Router();

/**
 * Издательский дом — тариф «Издание».
 *
 * Издатель ведёт несколько витрин под одной обложкой и собирает подборку
 * «Выбор издания»: она же полоса на главной странице Клауд.
 */

/** Обложка издания берётся из витрины владельца — второй раз её не заводим. */
async function publisherCard(owner) {
  const shop = await loadStorefront(owner.id);
  return {
    ...S.publicUser(owner),
    brand: shop.brand || owner.name,
    tagline: shop.tagline || owner.bio,
    cover: shop.cover,
    about: shop.about || owner.bio,
  };
}

/** Витрины под обложкой: сам издатель и присоединённые к нему магазины. */
async function shopsOf(publisherId) {
  const rows = await all(
    `SELECT u.*, s.brand,
            (SELECT COUNT(*) FROM listings l WHERE l.seller_id = u.id AND l.status = 'active') AS lots,
            (SELECT COALESCE(SUM(l.views), 0) FROM listings l WHERE l.seller_id = u.id) AS views
       FROM users u
       LEFT JOIN storefronts s ON s.user_id = u.id
       LEFT JOIN publisher_shops p ON p.member_id = u.id
      WHERE u.id = ? OR p.publisher_id = ?
      ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END, p.position, u.id`,
    publisherId, publisherId, publisherId,
  );

  return rows
    .map((r) => ({
      id: r.slug,
      name: r.name,
      brand: r.brand || r.name,
      city: r.city,
      lots: r.lots,
      views: r.views,
      owner: r.id === publisherId,
    }))
    // Издательский дом может и не торговать сам — тогда среди витрин его нет.
    .filter((shop) => !shop.owner || shop.lots > 0);
}

/** id всех продавцов издания — по ним считаются лоты и показатели. */
const memberIds = async (publisherId) => [
  publisherId,
  ...(await all("SELECT member_id FROM publisher_shops WHERE publisher_id = ?", publisherId))
    .map((r) => r.member_id),
];

/** Лоты подборки в заданном издателем порядке. */
async function picksOf(publisherId) {
  const rows = await all(
    `${LISTING_SELECT}
       JOIN publisher_picks p ON p.listing_id = l.id AND p.publisher_id = ?
      WHERE l.status = 'active'
      ORDER BY p.position, l.id`,
    publisherId,
  );
  const images = await imagesFor(rows.map((r) => r.id));
  return rows.map((r) => S.listing(r, { images: images.get(r.id) || [] }));
}

// ── Публичная часть ──

// GET /api/publishers/featured — полоса издателя для главной страницы
// Показываем издание, которое последним обновляло подборку.
publishersRouter.get("/featured", async (_req, res) => {
  const row = await get(
    `SELECT u.* FROM users u
       JOIN publisher_picks p ON p.publisher_id = u.id
      WHERE u.plan = 'edition'
        AND (u.plan_until IS NULL OR u.plan_until > now_utc())
        AND u.blocked_at IS NULL
      GROUP BY u.id
      ORDER BY MAX(p.updated_at) DESC
      LIMIT 1`,
  );
  if (!row) return res.json({ publisher: null, items: [] });

  const items = await picksOf(row.id);
  if (!items.length) return res.json({ publisher: null, items: [] });

  const shops = await shopsOf(row.id);
  res.json({
    publisher: { ...(await publisherCard(row)), shops: shops.length },
    items,
  });
});

// GET /api/publishers/:slug — страница издательского дома
publishersRouter.get(
  "/:slug",
  wrap(async (req, res) => {
    const owner = await get("SELECT * FROM users WHERE slug = ?", req.params.slug);
    if (!owner) throw notFound("Издатель не найден");
    if (!effectivePlan(owner).publisher) throw notFound("У продавца нет издания");

    const shops = await shopsOf(owner.id);
    const ids = await memberIds(owner.id);
    const totals = await get(
      `SELECT COUNT(*) AS lots, COALESCE(SUM(views), 0) AS views
         FROM listings WHERE seller_id = ANY(?) AND status = 'active'`,
      ids,
    );

    res.json({
      publisher: await publisherCard(owner),
      shops,
      picks: await picksOf(owner.id),
      stats: { shops: shops.length, lots: totals.lots, views: totals.views, since: S.publicUser(owner).since },
    });
  }),
);

// ── Кабинет издателя ──

publisherCabinetRouter.use(requireAuth);

function requireEdition(user) {
  const plan = effectivePlan(user);
  if (!plan.publisher) throw forbidden("Кабинет издателя доступен на тарифе «Издание»");
  return plan;
}

/** Приглашённые витрины, которые ещё не ответили. */
const invitesOf = async (publisherId) =>
  (await all(
    `SELECT u.slug, u.name, u.city, COALESCE(s.brand, u.name) AS brand, i.created_at
       FROM publisher_invites i
       JOIN users u ON u.id = i.member_id
       LEFT JOIN storefronts s ON s.user_id = u.id
      WHERE i.publisher_id = ?
      ORDER BY i.created_at`,
    publisherId,
  )).map((r) => ({ id: r.slug, name: r.name, brand: r.brand, city: r.city, invitedAt: r.created_at }));

// GET /api/profile/publisher — показатели, витрины, подборка, редактор
publisherCabinetRouter.get(
  "/",
  wrap(async (req, res) => {
    const plan = requireEdition(req.user);
    const ids = await memberIds(req.user.id);

    const totals = await get(
      `SELECT COUNT(*) AS lots, COALESCE(SUM(views), 0) AS views
         FROM listings WHERE seller_id = ANY(?) AND status = 'active'`,
      ids,
    );
    const threads = (await get(
      "SELECT COUNT(*) AS c FROM threads WHERE seller_id = ANY(?)", ids,
    )).c;

    // Отклики и подача лотов по дням — то, что действительно есть в базе.
    // Историю просмотров площадка не хранит, поэтому её и не рисуем.
    const trend = await all(
      `SELECT to_char(d.day, 'DD.MM') AS day,
              (SELECT COUNT(*) FROM threads t
                WHERE t.seller_id = ANY(?) AND date_trunc('day', t.created_at) = d.day) AS responses,
              (SELECT COUNT(*) FROM listings l
                WHERE l.seller_id = ANY(?) AND date_trunc('day', l.created_at) = d.day) AS lots
         FROM generate_series(
                date_trunc('day', now_utc()) - interval '13 days',
                date_trunc('day', now_utc()),
                interval '1 day') AS d(day)
        ORDER BY d.day`,
      ids, ids,
    );

    const candidates = await all(
      `${LISTING_SELECT} WHERE l.seller_id = ANY(?) AND l.status = 'active'
        ORDER BY l.created_at DESC LIMIT 60`,
      ids,
    );
    const images = await imagesFor(candidates.map((r) => r.id));

    const editor = req.user.editor_id
      ? await get("SELECT * FROM users WHERE id = ?", req.user.editor_id)
      : null;

    res.json({
      publisher: await publisherCard(req.user),
      plan,
      shops: await shopsOf(req.user.id),
      invites: await invitesOf(req.user.id),
      picks: await picksOf(req.user.id),
      candidates: candidates.map((r) => S.listing(r, { images: images.get(r.id) || [] })),
      metrics: {
        views: totals.views,
        responses: threads,
        // Конверсия в диалог: сколько просмотров закончилось перепиской.
        conversion: totals.views ? Math.round((threads / totals.views) * 1000) / 10 : 0,
        lots: totals.lots,
      },
      trend,
      editor: editor
        ? {
            name: editor.name,
            initial: S.publicUser(editor).initial,
            role: editor.role === "admin" ? "Администрация Клауд" : "Личный редактор издания",
            bio: editor.bio,
            phone: S.privateUser(editor).phone,
          }
        : null,
    });
  }),
);

// PUT /api/profile/publisher/picks — обновить полосу «Выбор издания»
publisherCabinetRouter.put(
  "/picks",
  wrap(async (req, res) => {
    const plan = requireEdition(req.user);
    const listingIds = Array.isArray(req.body?.listingIds) ? req.body.listingIds : [];

    if (listingIds.length > plan.maxPicks) {
      throw badRequest(`На полосу помещается лотов: ${plan.maxPicks}`);
    }

    const ids = await memberIds(req.user.id);
    const own = await all(
      "SELECT id FROM listings WHERE id = ANY(?) AND seller_id = ANY(?) AND status = 'active'",
      listingIds.map(Number).filter(Number.isFinite), ids,
    );
    const allowed = new Set(own.map((r) => r.id));
    if (listingIds.some((id) => !allowed.has(Number(id)))) {
      throw badRequest("На полосу попадают только опубликованные лоты вашего издания");
    }

    await tx(async () => {
      await run("DELETE FROM publisher_picks WHERE publisher_id = ?", req.user.id);
      for (const [i, id] of listingIds.entries()) {
        await run(
          "INSERT INTO publisher_picks (publisher_id, listing_id, position) VALUES (?, ?, ?)",
          req.user.id, Number(id), i,
        );
      }
    });

    res.json({ picks: await picksOf(req.user.id) });
  }),
);

/**
 * Витрина по адресу страницы или телефону владельца.
 * Принимаем и то, что человек скопировал из адресной строки: «/shop/anna-k».
 */
async function findShop(handle) {
  const value = String(handle ?? "").trim();
  if (!value) return null;

  const slug = value.split("/").filter(Boolean).pop() ?? value;
  const bySlug = await get("SELECT * FROM users WHERE slug = ?", slug);
  if (bySlug) return bySlug;

  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return get("SELECT * FROM users WHERE phone = ?", digits.slice(-10));
}

// POST /api/profile/publisher/invites — позвать витрину под обложку издания
publisherCabinetRouter.post(
  "/invites",
  wrap(async (req, res) => {
    const plan = requireEdition(req.user);
    const body = v(req.body).str("shop", { required: true, min: 2, max: 80 }).done();

    const shop = await findShop(body.shop);
    if (!shop) {
      throw badRequest("Витрина не найдена", { shop: "Проверьте адрес страницы или телефон" });
    }
    if (shop.id === req.user.id) throw badRequest("Ваша собственная витрина уже под обложкой");
    if (!hasStorefront(shop)) {
      throw badRequest(`У «${shop.name}» нет тарифа с витриной — пригласить можно только оформленный магазин`);
    }

    const taken = await get("SELECT publisher_id FROM publisher_shops WHERE member_id = ?", shop.id);
    if (taken) {
      throw badRequest(taken.publisher_id === req.user.id
        ? "Витрина уже под вашей обложкой"
        : "Витрина уже входит в другое издание");
    }

    const shops = await all("SELECT member_id FROM publisher_shops WHERE publisher_id = ?", req.user.id);
    if (shops.length >= plan.maxShops) {
      throw badRequest(`На тарифе «${plan.label}» под обложкой помещается витрин: ${plan.maxShops}`);
    }

    await run(
      `INSERT INTO publisher_invites (publisher_id, member_id) VALUES (?, ?)
       ON CONFLICT (publisher_id, member_id) DO UPDATE SET created_at = now_utc()`,
      req.user.id, shop.id,
    );

    res.status(201).json({ invites: await invitesOf(req.user.id) });
  }),
);

// DELETE /api/profile/publisher/invites/:slug — отозвать приглашение
publisherCabinetRouter.delete(
  "/invites/:slug",
  wrap(async (req, res) => {
    requireEdition(req.user);
    await run(
      `DELETE FROM publisher_invites
        WHERE publisher_id = ? AND member_id = (SELECT id FROM users WHERE slug = ?)`,
      req.user.id, req.params.slug,
    );
    res.json({ invites: await invitesOf(req.user.id) });
  }),
);

// DELETE /api/profile/publisher/shops/:slug — убрать витрину из издания
publisherCabinetRouter.delete(
  "/shops/:slug",
  wrap(async (req, res) => {
    requireEdition(req.user);
    const shop = await get("SELECT id FROM users WHERE slug = ?", req.params.slug);
    if (!shop) throw notFound("Витрина не найдена");

    await run(
      "DELETE FROM publisher_shops WHERE publisher_id = ? AND member_id = ?",
      req.user.id, shop.id,
    );
    // Лоты ушедшей витрины не должны остаться на полосе издания.
    await run(
      "DELETE FROM publisher_picks WHERE publisher_id = ? AND listing_id IN (SELECT id FROM listings WHERE seller_id = ?)",
      req.user.id, shop.id,
    );

    res.json({ shops: await shopsOf(req.user.id) });
  }),
);

// POST /api/profile/publisher/import — массовая загрузка каталога таблицей
publisherCabinetRouter.post(
  "/import",
  wrap(async (req, res) => {
    requireEdition(req.user);
    const body = v(req.body).str("csv", { required: true, min: 10, max: 200_000, trim: false }).done();
    const result = await importCatalog(req.user, body.csv);
    res.status(201).json(result);
  }),
);

/** Колонки таблицы каталога — первая строка файла. */
const COLUMNS = ["title", "price", "cat", "cond", "location", "description", "image"];

const CONDS = ["Новое", "Отличное", "Хорошее", "Требует ремонта"];

/**
 * Разбор таблицы каталога и постановка лотов в очередь модерации.
 * Строки с ошибками не отменяют импорт — они попадают в отчёт.
 */
export async function importCatalog(owner, csv) {
  const lines = String(csv).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw badRequest("В таблице нет строк с лотами");
  if (lines.length > 201) throw badRequest("За один раз принимаем не больше 200 строк");

  const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const missing = COLUMNS.slice(0, 4).filter((c) => !header.includes(c));
  if (missing.length) {
    throw badRequest(`В заголовке не хватает колонок: ${missing.join(", ")}`, {
      csv: `Ожидаются колонки: ${COLUMNS.join("; ")}`,
    });
  }

  const cats = new Set((await all("SELECT slug FROM categories")).map((c) => c.slug));
  const at = (row, name) => row[header.indexOf(name)]?.trim() ?? "";

  const rejected = [];
  const ready = [];

  for (const [i, line] of lines.slice(1).entries()) {
    const row = line.split(";");
    const title = at(row, "title");
    const price = Number(at(row, "price"));
    const cat = at(row, "cat");
    const cond = at(row, "cond") || "Хорошее";
    const image = at(row, "image");

    if (title.length < 6) { rejected.push([i + 2, "слишком короткое название"]); continue; }
    if (!Number.isFinite(price) || price <= 0) { rejected.push([i + 2, "цена не распознана"]); continue; }
    if (!cats.has(cat)) { rejected.push([i + 2, `неизвестный раздел «${cat}»`]); continue; }
    if (!CONDS.includes(cond)) { rejected.push([i + 2, `состояние «${cond}» вне списка`]); continue; }
    if (!image) { rejected.push([i + 2, "нет фотографии"]); continue; }

    ready.push({
      title, price: Math.round(price), cat, cond, image,
      location: at(row, "location") || owner.city,
      description: at(row, "description"),
    });
  }

  const created = [];
  if (ready.length) {
    await tx(async () => {
      const max = (await get("SELECT MAX(CAST(lot AS INTEGER)) AS m FROM listings"))?.m ?? 400;
      let lot = max + 1;

      for (const item of ready) {
        const { id } = await get(
          `INSERT INTO listings (lot, title, price, location, cond, description, cat, seller_id, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
           RETURNING id`,
          String(lot).padStart(4, "0"), item.title, item.price, item.location, item.cond,
          item.description, item.cat, owner.id,
        );
        await run("INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, 0)", id, item.image);
        created.push(String(lot).padStart(4, "0"));
        lot += 1;
      }
    });
  }

  const log = [{ ok: true, text: `Разобрано строк: ${lines.length - 1}` }];
  if (created.length) {
    log.push({
      ok: true,
      text: `Номера лотов присвоены автоматически (${created[0]}–${created[created.length - 1]})`,
    });
  }
  for (const [line, why] of rejected.slice(0, 5)) {
    log.push({ ok: false, text: `Строка ${line} отклонена: ${why}` });
  }
  if (rejected.length > 5) {
    log.push({ ok: false, text: `…и ещё ${rejected.length - 5} строк с ошибками` });
  }
  log.push({
    ok: true,
    text: created.length
      ? `Отправлено на проверку: ${created.length} лотов`
      : "Ни одна строка не подошла — лоты не созданы",
  });

  return { created: created.length, rejected: rejected.length, log };
}

// ── Сторона витрины ──
// Витрина входит в издание только по согласию владельца и может выйти сама.

editionRouter.use(requireAuth);

/** Издание, в котором состоит витрина, и приглашения, ожидающие ответа. */
async function editionState(userId) {
  const current = await get(
    `SELECT u.slug, u.name, COALESCE(s.brand, u.name) AS brand, u.city
       FROM publisher_shops p
       JOIN users u ON u.id = p.publisher_id
       LEFT JOIN storefronts s ON s.user_id = u.id
      WHERE p.member_id = ?`,
    userId,
  );

  const invites = await all(
    `SELECT u.slug, u.name, COALESCE(s.brand, u.name) AS brand, u.city, u.id AS user_id, i.created_at
       FROM publisher_invites i
       JOIN users u ON u.id = i.publisher_id
       LEFT JOIN storefronts s ON s.user_id = u.id
      WHERE i.member_id = ?
      ORDER BY i.created_at`,
    userId,
  );

  return {
    publisher: current
      ? { id: current.slug, name: current.name, brand: current.brand, city: current.city }
      : null,
    invites: invites.map((r) => ({
      id: r.slug,
      publisherId: r.user_id,
      name: r.name,
      brand: r.brand,
      city: r.city,
      invitedAt: r.created_at,
    })),
  };
}

// GET /api/profile/edition — в каком издании витрина и кто её зовёт
editionRouter.get("/", async (req, res) => {
  res.json(await editionState(req.user.id));
});

// POST /api/profile/edition/accept — принять приглашение
editionRouter.post(
  "/accept",
  wrap(async (req, res) => {
    const body = v(req.body).str("publisher", { required: true, max: 80 }).done();
    const publisher = await get("SELECT * FROM users WHERE slug = ?", body.publisher);
    if (!publisher) throw notFound("Издание не найдено");

    const invited = await get(
      "SELECT 1 AS x FROM publisher_invites WHERE publisher_id = ? AND member_id = ?",
      publisher.id, req.user.id,
    );
    if (!invited) throw badRequest("Приглашение отозвано или уже принято");
    if (!effectivePlan(publisher).publisher) throw badRequest("У издания закончился тариф «Издание»");

    const taken = await get("SELECT publisher_id FROM publisher_shops WHERE member_id = ?", req.user.id);
    if (taken) throw badRequest("Витрина уже входит в издание — сначала выйдите из него");

    await tx(async () => {
      await run(
        `INSERT INTO publisher_shops (publisher_id, member_id, position)
         VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM publisher_shops WHERE publisher_id = ?))`,
        publisher.id, req.user.id, publisher.id,
      );
      // Остальные приглашения теряют смысл: витрина в одном издании.
      await run("DELETE FROM publisher_invites WHERE member_id = ?", req.user.id);
    });

    res.json(await editionState(req.user.id));
  }),
);

// POST /api/profile/edition/decline — отклонить приглашение
editionRouter.post(
  "/decline",
  wrap(async (req, res) => {
    const body = v(req.body).str("publisher", { required: true, max: 80 }).done();
    await run(
      `DELETE FROM publisher_invites
        WHERE member_id = ? AND publisher_id = (SELECT id FROM users WHERE slug = ?)`,
      req.user.id, body.publisher,
    );
    res.json(await editionState(req.user.id));
  }),
);

// POST /api/profile/edition/leave — выйти из издания
editionRouter.post(
  "/leave",
  wrap(async (req, res) => {
    const current = await get("SELECT publisher_id FROM publisher_shops WHERE member_id = ?", req.user.id);
    if (!current) throw badRequest("Витрина не входит ни в одно издание");

    await tx(async () => {
      await run("DELETE FROM publisher_shops WHERE member_id = ?", req.user.id);
      // С полосы издания лоты ушедшей витрины тоже снимаются.
      await run(
        `DELETE FROM publisher_picks
          WHERE publisher_id = ? AND listing_id IN (SELECT id FROM listings WHERE seller_id = ?)`,
        current.publisher_id, req.user.id,
      );
    });

    res.json(await editionState(req.user.id));
  }),
);
