import { all, get } from "../db/index.js";

/**
 * Сводная статистика площадки. Все числа считаются из базы — витрина и
 * панель администратора не показывают выдуманных значений.
 */

/** Периоды, по которым разбивается статистика. */
export const PERIODS = {
  day: { label: "За сутки", sql: "-1 day" },
  week: { label: "За неделю", sql: "-7 days" },
  month: { label: "За месяц", sql: "-30 days" },
  year: { label: "За год", sql: "-365 days" },
  all: { label: "За всё время", sql: null },
};

const since = (period) => PERIODS[period]?.sql ?? null;

/** Показатели за период: подано, опубликовано, продано, выручка. */
export async function periodStats(period) {
  const window = since(period);
  const created = window
    ? (await get("SELECT COUNT(*) AS c FROM listings WHERE created_at >= now_utc() + ?::interval", window)).c
    : (await get("SELECT COUNT(*) AS c FROM listings")).c;

  const sold = window
    ? await get(
        `SELECT COUNT(*) AS c, COALESCE(SUM(price), 0) AS sum
           FROM listings WHERE status = 'sold' AND sold_at >= now_utc() + ?::interval`,
        window,
      )
    : await get("SELECT COUNT(*) AS c, COALESCE(SUM(price), 0) AS sum FROM listings WHERE status = 'sold'");

  const users = window
    ? (await get("SELECT COUNT(*) AS c FROM users WHERE created_at >= now_utc() + ?::interval", window)).c
    : (await get("SELECT COUNT(*) AS c FROM users")).c;

  const reviews = window
    ? (await get("SELECT COUNT(*) AS c FROM reviews WHERE created_at >= now_utc() + ?::interval", window)).c
    : (await get("SELECT COUNT(*) AS c FROM reviews")).c;

  return {
    period,
    label: PERIODS[period]?.label ?? period,
    listingsCreated: created,
    listingsSold: sold.c,
    revenue: sold.sum,
    usersJoined: users,
    reviews,
  };
}

/** Полная сводка для панели администратора. */
export async function projectStats() {
  const listings = await get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
           SUM(CASE WHEN status = 'sold'     THEN 1 ELSE 0 END) AS sold,
           SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
           COALESCE(SUM(views), 0) AS views
      FROM listings`);

  // Срок сделки в днях: разница меток времени в Postgres — интервал.
  const sold = await get(
    `SELECT COALESCE(SUM(price), 0) AS revenue,
            COALESCE(AVG(price), 0) AS average,
            COALESCE(AVG(EXTRACT(EPOCH FROM (sold_at - created_at)) / 86400), 0) AS days
       FROM listings WHERE status = 'sold'`,
  );

  const users = await get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN role = 'moderator' THEN 1 ELSE 0 END) AS moderators,
           SUM(CASE WHEN role = 'admin'     THEN 1 ELSE 0 END) AS admins,
           SUM(CASE WHEN blocked_at IS NOT NULL THEN 1 ELSE 0 END) AS blocked,
           SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) AS "withEmail"
      FROM users`);

  return {
    listings: {
      total: listings.total,
      active: listings.active ?? 0,
      pending: listings.pending ?? 0,
      rejected: listings.rejected ?? 0,
      sold: listings.sold ?? 0,
      archived: listings.archived ?? 0,
      views: listings.views,
    },
    sales: {
      count: listings.sold ?? 0,
      revenue: sold.revenue,
      averagePrice: Math.round(sold.average),
      // Среднее время от подачи лота до сделки.
      averageDays: Math.round(sold.days * 10) / 10,
      conversion: listings.total ? Math.round(((listings.sold ?? 0) / listings.total) * 1000) / 10 : 0,
    },
    users: {
      total: users.total,
      moderators: users.moderators ?? 0,
      admins: users.admins ?? 0,
      blocked: users.blocked ?? 0,
      withEmail: users.withEmail ?? 0,
      sellers: (await get("SELECT COUNT(DISTINCT seller_id) AS c FROM listings")).c,
    },
    content: {
      articles: (await get("SELECT COUNT(*) AS c FROM articles WHERE status = 'published'")).c,
      drafts: (await get("SELECT COUNT(*) AS c FROM articles WHERE status = 'draft'")).c,
      reviews: (await get("SELECT COUNT(*) AS c FROM reviews")).c,
      openReports: (await get("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'")).c,
      messages: (await get("SELECT COUNT(*) AS c FROM messages")).c,
    },
    periods: await Promise.all(Object.keys(PERIODS).map(periodStats)),
  };
}

/** Помесячная динамика за последние N месяцев — для графика в панели. */
export async function monthlyTrend(months = 12) {
  return all(
    `WITH m AS (
       SELECT generate_series(
                date_trunc('month', now_utc()) - ?::int * interval '1 month',
                date_trunc('month', now_utc()),
                interval '1 month') AS month
     )
     SELECT to_char(m.month, 'YYYY-MM') AS month,
            (SELECT COUNT(*) FROM listings
              WHERE date_trunc('month', created_at) = m.month) AS created,
            (SELECT COUNT(*) FROM listings
              WHERE status = 'sold'
                AND date_trunc('month', sold_at) = m.month) AS sold,
            (SELECT COALESCE(SUM(price), 0) FROM listings
              WHERE status = 'sold'
                AND date_trunc('month', sold_at) = m.month) AS revenue
       FROM m
      ORDER BY month`,
    months - 1,
  );
}

/**
 * Витринные показатели для страницы «Для бизнеса» и бегущей строки.
 * Раньше эти числа были зашиты в вёрстку — теперь считаются по базе.
 */
export async function publicMetrics() {
  const activeListings = (await get("SELECT COUNT(*) AS c FROM listings WHERE status = 'active'")).c;
  const sellers = (await get(
    "SELECT COUNT(DISTINCT seller_id) AS c FROM listings WHERE status IN ('active', 'sold')",
  )).c;
  const cities = (await get(
    "SELECT COUNT(DISTINCT location) AS c FROM listings WHERE status IN ('active', 'sold')",
  )).c;
  const soldDays = await get(
    `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (sold_at - created_at)) / 86400), 0) AS days,
            COUNT(*) AS c
       FROM listings WHERE status = 'sold'`,
  );

  // Средний срок продажи: пока сделок нет, показывать нечего.
  const avgDays = soldDays.c ? soldDays.days : null;
  const sellTime =
    avgDays === null
      ? null
      : avgDays < 1
        ? `${Math.max(1, Math.round(avgDays * 24))} ч`
        : `${Math.round(avgDays)} дн`;

  const rating = await get("SELECT COALESCE(AVG(rating), 0) AS avg, COUNT(*) AS c FROM reviews");

  return {
    activeListings,
    sellers,
    buyers: (await get("SELECT COUNT(*) AS c FROM users")).c,
    cities,
    sold: (await get("SELECT COUNT(*) AS c FROM listings WHERE status = 'sold'")).c,
    sellTime,
    reviews: (await get("SELECT COUNT(*) AS c FROM reviews")).c,
    rating: rating.c ? (Math.round(rating.avg * 10) / 10).toFixed(1) : null,
  };
}
