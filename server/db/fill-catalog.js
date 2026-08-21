import path from "node:path";
import bcrypt from "bcryptjs";
import { all, close, get, migrate, run, tx } from "./index.js";
import { CATALOG_DEALS, CATALOG_LISTINGS, CATALOG_SELLERS } from "./catalog-data.js";
import { giveShop } from "./shops-demo.js";
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
async function nextLotNumber() {
  const max = (await get("SELECT MAX(CAST(lot AS INTEGER)) AS m FROM listings"))?.m ?? 400;
  return max + 1;
}

export async function fillCatalog() {
  await migrate();

  if (!(await get("SELECT 1 AS x FROM categories LIMIT 1"))) {
    throw new Error("Сначала наполните справочники: pnpm run api:reset");
  }

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const now = Date.now();
  let added = 0;
  let skipped = 0;

  await tx(async () => {
    // ── Продавцы ──
    const sellerId = new Map();
    for (const s of CATALOG_SELLERS) {
      const existing = await get("SELECT id FROM users WHERE slug = ? OR phone = ?", s.slug, s.phone);
      if (existing) {
        sellerId.set(s.slug, existing.id);
        continue;
      }
      await run(
        `INSERT INTO users (slug, name, phone, password_hash, city, type, bio, rating, deals, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'user', now_utc())`,
        s.slug, s.name, s.phone, hash, s.city, s.type, s.bio,
      );
      sellerId.set(s.slug, (await get("SELECT id FROM users WHERE slug = ?", s.slug)).id);
    }

    // ── Лоты ──
    // Ключ — название вместе с продавцом: в демо-базе бывают одноимённые лоты
    // других владельцев, и сделки не должны привязаться к ним.
    const catalogListing = new Map();
    let lot = await nextLotNumber();

    for (const item of CATALOG_LISTINGS) {
      const owner = sellerId.get(item.seller);
      const existing = await get(
        "SELECT id FROM listings WHERE title = ? AND seller_id = ?", item.title, owner,
      );
      if (existing) {
        catalogListing.set(item.title, existing.id);
        skipped += 1;
        continue;
      }

      const createdAt = iso(now - item.age * 3600_000);
      await run(
        `INSERT INTO listings
           (lot, title, price, location, cond, description, cat, seller_id, badge, status,
            moderated_at, views, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', now_utc(), ?, ?, ?)`,
        String(lot).padStart(4, "0"), item.title, item.price, item.city, item.cond,
        item.text, item.cat, sellerId.get(item.seller), item.badge ?? null,
        30 + ((lot * 37) % 420), createdAt, createdAt,
      );
      const created = (await get("SELECT id FROM listings WHERE lot = ?", String(lot).padStart(4, "0"))).id;
      await run("INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, 0)", created, item.img);
      catalogListing.set(item.title, created);
      lot += 1;
      added += 1;
    }

    // ── Магазины на платных тарифах ──
    // «Издание» с разделами и «Витрина» без них — чтобы оба тарифа было видно.
    if (sellerId.has("vitrina-dom")) {
      await giveShop(sellerId.get("vitrina-dom"), {
        plan: "storefront",
        months: 12,
        shop: {
          brand: "Витрина «Дом»",
          tagline: "Мебель и предметы интерьера с проверенной историей.",
          cover: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1400&h=560&fit=crop&auto=format",
          about: "Комиссионный магазин мебели и вещей для дома. Каждый предмет проходит ручную проверку "
            + "и съёмку в студии — публикуем только то, за что ручаемся сами.",
          hours: "Пн–Сб · 10:00–20:00",
          delivery: "Курьер и СДЭК по РФ",
          warranty: "Проверка подлинности на каждый лот",
        },
        links: [
          { network: "Telegram", handle: "@vitrina_dom", url: "https://t.me/vitrina_dom" },
          { network: "Сайт", handle: "vitrina-dom.ru", url: "https://vitrina-dom.ru" },
        ],
      });
    }

    if (sellerId.has("elena-m")) {
      await giveShop(sellerId.get("elena-m"), {
        plan: "storefront",
        months: 12,
        shop: {
          brand: "Морозова & Co.",
          tagline: "Одежда и аксессуары с честным описанием состояния.",
          cover: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1400&h=560&fit=crop&auto=format",
          about: "Небольшой гардеробный магазин: приношу вещи в порядок, показываю все детали "
            + "и не приукрашиваю состояние.",
          hours: "Пн–Пт · 11:00–19:00",
          delivery: "Почта и СДЭК по РФ",
          warranty: "Примерка при получении",
        },
        links: [
          { network: "Telegram", handle: "@morozova_co", url: "https://t.me/morozova_co" },
        ],
      });
    }

    if (sellerId.has("zoo-druzya")) {
      await giveShop(sellerId.get("zoo-druzya"), {
        plan: "storefront",
        months: 6,
        shop: {
          brand: "Зоосалон «Друзья»",
          tagline: "Всё для питомцев — с консультацией и без спешки.",
          cover: "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=1400&h=560&fit=crop&auto=format",
          about: "Товары и услуги для животных: подбираем корм и амуницию, помогаем с содержанием. "
            + "Отвечаем на вопросы даже тем, кто ничего не покупает.",
          hours: "Ежедневно · 09:00–21:00",
          delivery: "Курьер по Новосибирску",
          warranty: "Обмен в течение 14 дней",
        },
        links: [
          { network: "Telegram", handle: "@zoo_druzya", url: "https://t.me/zoo_druzya" },
        ],
      });
    }

    // ── Издательский дом ──
    // Тариф «Издание»: три витрины под одной обложкой и полоса на главной.
    const publisher = await get("SELECT id FROM users WHERE slug = ?", "severyanin");
    if (publisher) {
      await giveShop(publisher.id, {
        plan: "edition",
        months: 12,
        shop: {
          brand: "Дом «Северянин»",
          tagline: "Издательский дом частных коллекций — три витрины под одной обложкой.",
          cover: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1400&h=560&fit=crop&auto=format",
          about: "Сеть комиссионных магазинов и частных коллекций. На тарифе «Издание» ведём "
            + "собственную полосу на главной Клауд, загружаем каталог таблицей и работаем с личным редактором.",
          hours: "Пн–Сб · 10:00–20:00",
          delivery: "Курьер и СДЭК по РФ",
          warranty: "Проверка подлинности на каждый лот",
        },
        links: [
          { network: "Telegram", handle: "@severyanin_dom", url: "https://t.me/severyanin_dom" },
          { network: "Сайт", handle: "severyanin.ru", url: "https://severyanin.ru" },
        ],
        sections: [],
      });

      // Витрины под обложкой издания.
      for (const [i, slug] of ["vitrina-dom", "elena-m", "zoo-druzya"].entries()) {
        const member = sellerId.get(slug);
        if (!member) continue;
        await run("DELETE FROM publisher_shops WHERE member_id = ?", member);
        await run(
          "INSERT INTO publisher_shops (publisher_id, member_id, position) VALUES (?, ?, ?)",
          publisher.id, member, i,
        );
      }

      // Личный редактор издания — аккаунт модерации.
      const editor = await get("SELECT id FROM users WHERE role = 'moderator' ORDER BY id LIMIT 1");
      if (editor) await run("UPDATE users SET editor_id = ? WHERE id = ?", editor.id, publisher.id);

      // Полоса «Выбор издания»: свежие лоты витрин дома.
      const picks = await all(
        `SELECT l.id FROM listings l
           JOIN publisher_shops p ON p.member_id = l.seller_id AND p.publisher_id = ?
          WHERE l.status = 'active'
          ORDER BY l.created_at DESC LIMIT 4`,
        publisher.id,
      );
      await run("DELETE FROM publisher_picks WHERE publisher_id = ?", publisher.id);
      for (const [i, pick] of picks.entries()) {
        await run(
          "INSERT INTO publisher_picks (publisher_id, listing_id, position) VALUES (?, ?, ?)",
          publisher.id, pick.id, i,
        );
      }
    }

    // ── Состоявшиеся сделки и отзывы ──
    for (const deal of CATALOG_DEALS) {
      const id = catalogListing.get(deal.title);
      const listing = id ? await get("SELECT * FROM listings WHERE id = ?", id) : null;
      const buyer = await get("SELECT id FROM users WHERE slug = ?", deal.buyer);
      if (!listing || !buyer || listing.status === "sold" || listing.seller_id === buyer.id) continue;

      await run(
        `UPDATE listings SET status = 'sold', sold_at = now_utc() - interval '2 days', sold_to = ?
          WHERE id = ?`,
        buyer.id, listing.id,
      );
      await run(
        `INSERT INTO reviews (listing_id, author_id, target_id, rating, deal_success, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, now_utc() - interval '1 day')
         ON CONFLICT DO NOTHING`,
        listing.id, buyer.id, listing.seller_id, deal.rating, deal.success ? 1 : 0, deal.text,
      );
    }

    // Рейтинг и число сделок продавцов — по их отзывам.
    for (const seller of await all("SELECT DISTINCT target_id AS id FROM reviews")) {
      const stats = await get(
        `SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0) AS avg,
                COALESCE(SUM(deal_success), 0) AS deals
           FROM reviews WHERE target_id = ?`,
        seller.id,
      );
      await run(
        "UPDATE users SET rating = ?, deals = ? WHERE id = ?",
        stats.total ? Math.round(stats.avg * 10) / 10 : 0, stats.deals, seller.id,
      );
    }
  });

  const byCategory = await all(
    `SELECT c.label, COUNT(l.id) AS count
       FROM categories c LEFT JOIN listings l ON l.cat = c.slug AND l.status = 'active'
      GROUP BY c.slug ORDER BY c.position`,
  );

  const sold = (await get("SELECT COUNT(*) AS c FROM listings WHERE status = 'sold'")).c;
  return { added, skipped, byCategory, sold };
}

// Запуск напрямую: node server/db/fill-catalog.js
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const result = await fillCatalog();
  console.log(`Добавлено лотов: ${result.added}${result.skipped ? `, пропущено (уже есть): ${result.skipped}` : ""}`);
  console.log(`Продано: ${result.sold} · пароль продавцов: ${DEMO_PASSWORD}`);
  console.log("Лотов в каталоге по разделам:");
  for (const row of result.byCategory) {
    console.log(`  ${row.label.padEnd(24)} ${row.count}`);
  }
  await close();
}
