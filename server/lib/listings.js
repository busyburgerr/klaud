import { all, get } from "../db/index.js";
import * as S from "./serialize.js";

/** Колонки лота + продавец под префиксом s_ (см. serialize.listing). */
export const LISTING_SELECT = `
  SELECT l.*,
         u.id           AS s_id,
         u.slug         AS s_slug,
         u.name         AS s_name,
         u.created_at   AS s_created_at,
         u.deals        AS s_deals,
         u.rating       AS s_rating,
         u.city         AS s_city,
         u.type         AS s_type,
         u.bio          AS s_bio,
         u.last_seen_at AS s_last_seen_at
    FROM listings l
    JOIN users u ON u.id = l.seller_id`;

/** Сортировки: ключи API и подписи из интерфейса каталога. */
export const SORTS = {
  new: "l.created_at DESC, l.id DESC",
  old: "l.created_at ASC, l.id ASC",
  price_asc: "l.price ASC, l.id ASC",
  price_desc: "l.price DESC, l.id DESC",
  popular: "l.views DESC, l.id DESC",
  "Сначала новые": "l.created_at DESC, l.id DESC",
  Дешевле: "l.price ASC, l.id ASC",
  Дороже: "l.price DESC, l.id DESC",
};

/**
 * Номер лота из поискового запроса.
 *
 * Понимаем всё, что человек может набрать, глядя на карточку: «0442», «442»,
 * «Лот 442», «№ 0442», «#442». Возвращает номер в формате базы (четыре знака)
 * и сами цифры — для поиска по части номера.
 */
export function parseLotQuery(value) {
  const raw = String(value ?? "").trim();
  const match = /^(?:лот\s*)?(?:№|#)?\s*(\d{1,6})$/i.exec(raw);
  if (!match) return null;

  const digits = match[1].replace(/^0+(?=\d)/, "");
  return { digits, lot: digits.padStart(4, "0") };
}

const asList = (value) => {
  if (value === undefined || value === null || value === "") return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw.map((s) => String(s).trim()).filter(Boolean);
};

/** Строит WHERE и параметры из query-строки каталога. */
export function buildFilter(query = {}, { defaultStatus = "active", favoritedBy = null } = {}) {
  const where = [];
  const params = [];

  if (favoritedBy) {
    where.push("l.id IN (SELECT listing_id FROM favorites WHERE user_id = ?)");
    params.push(favoritedBy);
  }

  const status = query.status === "all" ? null : query.status || defaultStatus;
  if (status) {
    where.push("l.status = ?");
    params.push(status);
  }

  if (query.cat) {
    where.push("l.cat = ?");
    params.push(query.cat);
  }

  if (query.seller) {
    where.push("u.slug = ?");
    params.push(query.seller);
  }

  const conds = asList(query.cond);
  if (conds.length) {
    where.push(`l.cond IN (${conds.map(() => "?").join(", ")})`);
    params.push(...conds);
  }

  const q = String(query.q || "").trim();
  const lot = parseLotQuery(q);
  if (lot) {
    // Запрос похож на номер лота: ищем точное совпадение и оставляем текстовый
    // поиск — цифры бывают и в названии. По части номера ищем от двух знаков,
    // иначе «0» совпало бы с любым лотом.
    const byPart = lot.digits.length > 1;
    where.push(`(l.lot = ?${byPart ? " OR l.lot ILIKE ?" : ""} OR l.title ILIKE ?)`);
    params.push(lot.lot, ...(byPart ? [`%${lot.digits}%`] : []), `%${q}%`);
  } else if (q) {
    // ILIKE, а не LIKE: регистр не должен мешать поиску по русским словам.
    where.push("(l.title ILIKE ? OR l.description ILIKE ? OR l.location ILIKE ? OR l.lot ILIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const min = Number(query.minPrice);
  if (Number.isFinite(min) && query.minPrice !== "") {
    where.push("l.price >= ?");
    params.push(Math.round(min));
  }

  const max = Number(query.maxPrice);
  if (Number.isFinite(max) && query.maxPrice !== "") {
    where.push("l.price <= ?");
    params.push(Math.round(max));
  }

  if (query.location) {
    where.push("l.location = ?");
    params.push(query.location);
  }

  return { sql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params, lot };
}

export function pagination(query = {}, { defaultLimit = 24, maxLimit = 100 } = {}) {
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  const page = Math.max(1, Number(query.page) || 1);
  return { limit, page, offset: (page - 1) * limit };
}

/** id лотов, добавленных пользователем в избранное. */
export async function wishedIds(userId, listingIds) {
  if (!userId || !listingIds.length) return new Set();
  const rows = await all(
    `SELECT listing_id FROM favorites WHERE user_id = ? AND listing_id IN (${listingIds.map(() => "?").join(", ")})`,
    userId, ...listingIds,
  );
  return new Set(rows.map((r) => r.listing_id));
}

/** Первые изображения пачки лотов — чтобы не делать N+1 запросов. */
export async function imagesFor(listingIds) {
  const map = new Map();
  if (!listingIds.length) return map;
  const rows = await all(
    `SELECT listing_id, url FROM listing_images
      WHERE listing_id IN (${listingIds.map(() => "?").join(", ")})
      ORDER BY listing_id, position, id`,
    ...listingIds,
  );
  for (const r of rows) {
    if (!map.has(r.listing_id)) map.set(r.listing_id, []);
    map.get(r.listing_id).push(r.url);
  }
  return map;
}

/** Список лотов с фильтрами, сортировкой и постраничной навигацией. */
export async function queryListings(
  query,
  { viewerId = null, defaultStatus = "active", defaultLimit = 24, favoritedBy = null } = {},
) {
  const filter = buildFilter(query, { defaultStatus, favoritedBy });
  const { limit, page, offset } = pagination(query, { defaultLimit });

  // Точное попадание по номеру лота всегда идёт первым, что бы ни выбрали
  // в сортировке: за этим номером человек и пришёл.
  const orderParams = [];
  let order = SORTS[query.sort] || SORTS.new;
  if (filter.lot) {
    order = `CASE WHEN l.lot = ? THEN 0 ELSE 1 END, ${order}`;
    orderParams.push(filter.lot.lot);
  }

  const total = (await get(
    `SELECT COUNT(*) AS c FROM listings l JOIN users u ON u.id = l.seller_id${filter.sql}`,
    ...filter.params,
  )).c;

  const rows = await all(
    `${LISTING_SELECT}${filter.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...filter.params, ...orderParams, limit, offset,
  );

  const ids = rows.map((r) => r.id);
  const [images, wished] = await Promise.all([imagesFor(ids), wishedIds(viewerId, ids)]);

  return {
    items: rows.map((r) =>
      S.listing(r, { images: images.get(r.id) || [], wished: wished.has(r.id) }),
    ),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Лот по номеру из каталога — «0442» или «442». */
export async function findListingByLot(value, { viewerId = null } = {}) {
  const parsed = parseLotQuery(value);
  if (!parsed) return null;

  const row = await get(`${LISTING_SELECT} WHERE l.lot = ?`, parsed.lot);
  if (!row) return null;

  const images = (await imagesFor([row.id])).get(row.id) || [];
  const wished = (await wishedIds(viewerId, [row.id])).has(row.id);
  return S.listing(row, { images, wished });
}

/** Один лот со всеми изображениями. */
export async function findListing(id, { viewerId = null } = {}) {
  const row = await get(`${LISTING_SELECT} WHERE l.id = ?`, Number(id));
  if (!row) return null;
  const images = (await imagesFor([row.id])).get(row.id) || [];
  const wished = (await wishedIds(viewerId, [row.id])).has(row.id);
  return S.listing(row, { images, wished });
}
