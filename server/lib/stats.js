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
export function periodStats(period) {
  const window = since(period);
  const created = window
    ? get("SELECT COUNT(*) AS c FROM listings WHERE created_at >= datetime('now', ?)", window).c
    : get("SELECT COUNT(*) AS c FROM listings").c;

  const sold = window
    ? get(
        `SELECT COUNT(*) AS c, COALESCE(SUM(price), 0) AS sum
           FROM listings WHERE status = 'sold' AND sold_at >= datetime('now', ?)`,
        window,
      )
    : get("SELECT COUNT(*) AS c, COALESCE(SUM(price), 0) AS sum FROM listings WHERE status = 'sold'");

  const users = window
    ? get("SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now', ?)", window).c
    : get("SELECT COUNT(*) AS c FROM users").c;

  const reviews = window
    ? get("SELECT COUNT(*) AS c FROM reviews WHERE created_at >= datetime('now', ?)", window).c
    : get("SELECT COUNT(*) AS c FROM reviews").c;

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
export function projectStats() {
  const listings = get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'active'   THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
           SUM(CASE WHEN status = 'sold'     THEN 1 ELSE 0 END) AS sold,
           SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
           COALESCE(SUM(views), 0) AS views
      FROM listings`);

  const sold = get(
    `SELECT COALESCE(SUM(price), 0) AS revenue,
            COALESCE(AVG(price), 0) AS average,
            COALESCE(AVG(julianday(sold_at) - julianday(created_at)), 0) AS days
       FROM listings WHERE status = 'sold'`,
  );

  const users = get(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN role = 'moderator' THEN 1 ELSE 0 END) AS moderators,
           SUM(CASE WHEN role = 'admin'     THEN 1 ELSE 0 END) AS admins,
           SUM(CASE WHEN blocked_at IS NOT NULL THEN 1 ELSE 0 END) AS blocked,
           SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) AS withEmail
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
      sellers: get("SELECT COUNT(DISTINCT seller_id) AS c FROM listings").c,
    },
    content: {
      articles: get("SELECT COUNT(*) AS c FROM articles WHERE status = 'published'").c,
      drafts: get("SELECT COUNT(*) AS c FROM articles WHERE status = 'draft'").c,
      reviews: get("SELECT COUNT(*) AS c FROM reviews").c,
      openReports: get("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").c,
      messages: get("SELECT COUNT(*) AS c FROM messages").c,
    },
    periods: Object.keys(PERIODS).map(periodStats),
  };
}

/** Помесячная динамика за последние N месяцев — для графика в панели. */
export function monthlyTrend(months = 12) {
  return all(
    `WITH RECURSIVE m(offset) AS (
       SELECT 0 UNION ALL SELECT offset + 1 FROM m WHERE offset < ?
     )
     SELECT strftime('%Y-%m', datetime('now', '-' || offset || ' months')) AS month,
            (SELECT COUNT(*) FROM listings
              WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', datetime('now', '-' || offset || ' months'))) AS created,
            (SELECT COUNT(*) FROM listings
              WHERE status = 'sold'
                AND strftime('%Y-%m', sold_at) = strftime('%Y-%m', datetime('now', '-' || offset || ' months'))) AS sold,
            (SELECT COALESCE(SUM(price), 0) FROM listings
              WHERE status = 'sold'
                AND strftime('%Y-%m', sold_at) = strftime('%Y-%m', datetime('now', '-' || offset || ' months'))) AS revenue
       FROM m
      ORDER BY month`,
    months - 1,
  );
}

/**
 * Витринные показатели для страницы «Для бизнеса» и бегущей строки.
 * Раньше эти числа были зашиты в вёрстку — теперь считаются по базе.
 */
export function publicMetrics() {
  const activeListings = get("SELECT COUNT(*) AS c FROM listings WHERE status = 'active'").c;
  const sellers = get(
    "SELECT COUNT(DISTINCT seller_id) AS c FROM listings WHERE status IN ('active', 'sold')",
  ).c;
  const cities = get(
    "SELECT COUNT(DISTINCT location) AS c FROM listings WHERE status IN ('active', 'sold')",
  ).c;
  const soldDays = get(
    `SELECT COALESCE(AVG(julianday(sold_at) - julianday(created_at)), 0) AS days,
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

  return {
    activeListings,
    sellers,
    buyers: get("SELECT COUNT(*) AS c FROM users").c,
    cities,
    sold: get("SELECT COUNT(*) AS c FROM listings WHERE status = 'sold'").c,
    sellTime,
    reviews: get("SELECT COUNT(*) AS c FROM reviews").c,
    rating: (() => {
      const r = get("SELECT COALESCE(AVG(rating), 0) AS avg, COUNT(*) AS c FROM reviews");
      return r.c ? (Math.round(r.avg * 10) / 10).toFixed(1) : null;
    })(),
  };
}
