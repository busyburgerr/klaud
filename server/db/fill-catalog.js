import path from "node:path";
import bcrypt from "bcryptjs";
import { all, get, migrate, run, tx } from "./index.js";
import { CATALOG_DEALS, CATALOG_LISTINGS, CATALOG_SELLERS } from "./catalog-data.js";
import { DEMO_PASSWORD } from "./seed.js";

/**
 * Наполняет каталог лотами во всех разделах поверх существующей базы.
 *
 * Аккаунты персонала, справка и материалы журнала не трогаются — добавляются
 * только продавцы и их лоты. Повторный запуск ничего не дублирует: лоты
 * узнаются по названию.
 */

const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/** Следующий свободный номер лота. */
function nextLotNumber() {
  const max = get("SELECT MAX(CAST(lot AS INTEGER)) AS m FROM listings")?.m ?? 400;
  return max + 1;
}

export function fillCatalog() {
  migrate();

  if (!get("SELECT 1 AS x FROM categories LIMIT 1")) {
    throw new Error("Сначала наполните справочники: pnpm run api:reset");
  }

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const now = Date.now();
  let added = 0;
  let skipped = 0;

  tx(() => {
    // ── Продавцы ──
    const sellerId = new Map();
    for (const s of CATALOG_SELLERS) {
      const existing = get("SELECT id FROM users WHERE slug = ? OR phone = ?", s.slug, s.phone);
      if (existing) {
        sellerId.set(s.slug, existing.id);
        continue;
      }
      run(
        `INSERT INTO users (slug, name, phone, password_hash, city, type, bio, rating, deals, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'user', datetime('now'))`,
        s.slug, s.name, s.phone, hash, s.city, s.type, s.bio,
      );
      sellerId.set(s.slug, get("SELECT id FROM users WHERE slug = ?", s.slug).id);
    }

    // ── Лоты ──
    // Ключ — название вместе с продавцом: в демо-базе бывают одноимённые лоты
    // других владельцев, и сделки не должны привязаться к ним.
    const catalogListing = new Map();
    let lot = nextLotNumber();

    for (const item of CATALOG_LISTINGS) {
      const owner = sellerId.get(item.seller);
      const existing = get(
        "SELECT id FROM listings WHERE title = ? AND seller_id = ?", item.title, owner,
      );
      if (existing) {
        catalogListing.set(item.title, existing.id);
        skipped += 1;
        continue;
      }

      const createdAt = iso(now - item.age * 3600_000);
      run(
        `INSERT INTO listings
           (lot, title, price, location, cond, description, cat, seller_id, badge, status,
            moderated_at, views, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), ?, ?, ?)`,
        String(lot).padStart(4, "0"), item.title, item.price, item.city, item.cond,
        item.text, item.cat, sellerId.get(item.seller), item.badge ?? null,
        30 + ((lot * 37) % 420), createdAt, createdAt,
      );
      const created = get("SELECT id FROM listings WHERE lot = ?", String(lot).padStart(4, "0")).id;
      run("INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, 0)", created, item.img);
      catalogListing.set(item.title, created);
      lot += 1;
      added += 1;
    }

    // ── Состоявшиеся сделки и отзывы ──
    for (const deal of CATALOG_DEALS) {
      const id = catalogListing.get(deal.title);
      const listing = id ? get("SELECT * FROM listings WHERE id = ?", id) : null;
      const buyer = get("SELECT id FROM users WHERE slug = ?", deal.buyer);
      if (!listing || !buyer || listing.status === "sold" || listing.seller_id === buyer.id) continue;

      run(
        `UPDATE listings SET status = 'sold', sold_at = datetime('now', '-2 days'), sold_to = ?
          WHERE id = ?`,
        buyer.id, listing.id,
      );
      run(
        `INSERT INTO reviews (listing_id, author_id, target_id, rating, deal_success, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-1 day'))
         ON CONFLICT DO NOTHING`,
        listing.id, buyer.id, listing.seller_id, deal.rating, deal.success ? 1 : 0, deal.text,
      );
    }

    // Рейтинг и число сделок продавцов — по их отзывам.
    for (const seller of all("SELECT DISTINCT target_id AS id FROM reviews")) {
      const stats = get(
        `SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0) AS avg,
                COALESCE(SUM(deal_success), 0) AS deals
           FROM reviews WHERE target_id = ?`,
        seller.id,
      );
      run(
        "UPDATE users SET rating = ?, deals = ? WHERE id = ?",
        stats.total ? Math.round(stats.avg * 10) / 10 : 0, stats.deals, seller.id,
      );
    }
  });

  const byCategory = all(
    `SELECT c.label, COUNT(l.id) AS count
       FROM categories c LEFT JOIN listings l ON l.cat = c.slug AND l.status = 'active'
      GROUP BY c.slug ORDER BY c.position`,
  );

  return { added, skipped, byCategory, sold: get("SELECT COUNT(*) AS c FROM listings WHERE status = 'sold'").c };
}

// Запуск напрямую: node --experimental-sqlite server/db/fill-catalog.js
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const result = fillCatalog();
  console.log(`Добавлено лотов: ${result.added}${result.skipped ? `, пропущено (уже есть): ${result.skipped}` : ""}`);
  console.log(`Продано: ${result.sold} · пароль продавцов: ${DEMO_PASSWORD}`);
  console.log("Лотов в каталоге по разделам:");
  for (const row of result.byCategory) {
    console.log(`  ${row.label.padEnd(24)} ${row.count}`);
  }
}
