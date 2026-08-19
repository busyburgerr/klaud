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
  if (q) {
    where.push("(l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ? OR l.lot LIKE ?)");
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

  return { sql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params };
}

export function pagination(query = {}, { defaultLimit = 24, maxLimit = 100 } = {}) {
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  const page = Math.max(1, Number(query.page) || 1);
  return { limit, page, offset: (page - 1) * limit };
}

/** id лотов, добавленных пользователем в избранное. */
export function wishedIds(userId, listingIds) {
  if (!userId || !listingIds.length) return new Set();
  const rows = all(
    `SELECT listing_id FROM favorites WHERE user_id = ? AND listing_id IN (${listingIds.map(() => "?").join(", ")})`,
    userId, ...listingIds,
  );
  return new Set(rows.map((r) => r.listing_id));
}

/** Первые изображения пачки лотов — чтобы не делать N+1 запросов. */
export function imagesFor(listingIds) {
  const map = new Map();
  if (!listingIds.length) return map;
  const rows = all(
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
export function queryListings(
  query,
  { viewerId = null, defaultStatus = "active", defaultLimit = 24, favoritedBy = null } = {},
) {
  const filter = buildFilter(query, { defaultStatus, favoritedBy });
  const order = SORTS[query.sort] || SORTS.new;
  const { limit, page, offset } = pagination(query, { defaultLimit });

  const total = get(
    `SELECT COUNT(*) AS c FROM listings l JOIN users u ON u.id = l.seller_id${filter.sql}`,
    ...filter.params,
  ).c;

  const rows = all(
    `${LISTING_SELECT}${filter.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...filter.params, limit, offset,
  );

  const ids = rows.map((r) => r.id);
  const images = imagesFor(ids);
  const wished = wishedIds(viewerId, ids);

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

/** Один лот со всеми изображениями. */
export function findListing(id, { viewerId = null } = {}) {
  const row = get(`${LISTING_SELECT} WHERE l.id = ?`, Number(id));
  if (!row) return null;
  const images = imagesFor([row.id]).get(row.id) || [];
  const wished = wishedIds(viewerId, [row.id]).has(row.id);
  return S.listing(row, { images, wished });
}
