import path from "node:path";
import bcrypt from "bcryptjs";
import { displayPhone } from "../lib/format.js";
import { all, close, exec, get, migrate, run, tx } from "./index.js";
import { CITIES } from "./cities.js";
import { giveShop } from "./shops-demo.js";
import { MILESTONES, PRINCIPLES } from "./about-content.js";
import { FAQ, HELP_TOPICS } from "./help-content.js";
import { ARTICLES, CATEGORIES, LISTINGS, SELLERS } from "./seed-data.js";

/** Пароль всех демо-аккаунтов. */
export const DEMO_PASSWORD = "cloud12345";

/** Аккаунт, от лица которого работают «Личный кабинет» и «Сообщения». */
const DEMO_USER = {
  slug: "irina-s",
  name: "Ирина Соколова",
  phone: "9001284509",
  city: "Москва",
  type: "Частное лицо",
  bio: "Продаю вещи из личной коллекции. На связи каждый день, помогаю с доставкой.",
  rating: 4.8,
  deals: 23,
  since: 2025,
};

/** Администратор и модератор — учётные записи персонала. */
const STAFF = [
  {
    slug: "admin",
    name: "Администратор Клауд",
    phone: "9000000001",
    city: "Москва",
    type: "Магазин",
    bio: "Служебный аккаунт администрации платформы.",
    rating: 5,
    deals: 0,
    role: "admin",
    since: 2026,
  },
  {
    slug: "moderator",
    name: "Ольга Тихонова",
    phone: "9000000002",
    city: "Москва",
    type: "Частное лицо",
    bio: "Модератор каталога: проверяю лоты и разбираю жалобы.",
    rating: 5,
    deals: 0,
    role: "moderator",
    since: 2026,
  },
];

const DEMO_PHONES = {
  "artem-v": "9001110001",
  "marina-l": "9001110002",
  "sergey-k": "9001110003",
};

/** Лоты демо-аккаунта — их показывает вкладка «Мои объявления». */
const DEMO_USER_LISTINGS = new Set([1, 3, 6]);

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const iso = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/** "1 ч" / "вчера" / "2 дн" → отметка времени, дающая ту же подпись при чтении. */
function ageToTimestamp(label, now) {
  const text = String(label).trim();
  const hour = 3600_000;
  const day = 24 * hour;

  if (text === "вчера") return iso(now - day - hour);
  const m = text.match(/^(\d+)\s*(мин|ч|дн|нед|мес)$/);
  if (!m) return iso(now - hour);

  const n = Number(m[1]);
  const unit = { мин: 60_000, ч: hour, дн: day, нед: 7 * day, мес: 30 * day }[m[2]];
  // Смещаем на половину единицы вперёд, чтобы округление вниз не «состарило» лот.
  return iso(now - n * unit - unit / 2);
}

/** "14 августа 2026" → "2026-08-14". */
function ruDateToIso(text) {
  const m = String(text).match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return new Date().toISOString().slice(0, 10);
  const month = RU_MONTHS.indexOf(m[2]);
  if (month < 0) return new Date().toISOString().slice(0, 10);
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const parsePrice = (s) => Number(String(s).replace(/\s/g, ""));

function describe(item, cat) {
  return (
    `${item.title} в состоянии «${item.cond.toLowerCase()}». ` +
    `Предмет проверен экспертами Клауд и получил номер лота ${item.lot}. ` +
    `Продаётся из личной коллекции в городе ${item.location}. ` +
    `Категория — ${cat}. Возможна курьерская доставка по России и безопасная сделка ` +
    `через платформу с удержанием средств до подтверждения получения.`
  );
}

export async function isSeeded() {
  return ((await get("SELECT COUNT(*) AS c FROM users"))?.c ?? 0) > 0;
}

export async function reset() {
  // TRUNCATE ... RESTART IDENTITY сразу чистит связанные таблицы и обнуляет
  // счётчики id, поэтому демо-данные всегда получают одни и те же номера.
  await exec(`TRUNCATE TABLE
    moderation_log, reports, reviews, messages, threads, favorites,
    listing_images, listings, articles, categories, cities,
    help_topics, faq, about_blocks, users
    RESTART IDENTITY CASCADE`);
}

/**
 * Наполняет базу. `demo: false` оставляет только справочник категорий и
 * учётные записи персонала — с таким состоянием площадку можно открывать
 * для настоящих пользователей.
 */
export async function seed({ force = false, demo = true } = {}) {
  await migrate();

  if ((await isSeeded()) && !force) {
    return { skipped: true };
  }
  if (force) await reset();

  const now = Date.now();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  await tx(async () => {
    // ── Категории ──
    for (const [i, c] of CATEGORIES.entries()) {
      await run(
        `INSERT INTO categories (slug, n, label, blurb, img, display_count, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        // Витринные счётчики из макета нужны только демо-каталогу:
        // на рабочей базе показываем настоящее число лотов.
        c.slug, c.n, c.label, c.blurb, c.img, demo ? parsePrice(c.count) : 0, i,
      );
    }

    // ── Города ──
    for (const [i, c] of CITIES.entries()) {
      await run(
        "INSERT INTO cities (slug, name, region, position) VALUES (?, ?, ?, ?)",
        c.slug, c.name, c.region, i,
      );
    }

    // ── Пользователи ──
    const userIdBySlug = new Map();

    const insertUser = async (u, createdAt) => {
      await run(
        `INSERT INTO users (slug, name, phone, password_hash, city, type, bio, rating, deals, role, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        u.slug, u.name, u.phone, hash, u.city, u.type, u.bio,
        Number(u.rating), u.deals, u.role ?? "user", iso(now), createdAt,
      );
      userIdBySlug.set(u.slug, (await get("SELECT id FROM users WHERE slug = ?", u.slug)).id);
    };

    // На чистой базе остаётся один администратор: остальные аккаунты, включая
    // модератора, заводятся уже на живой площадке. Прав администратора хватает
    // и для модерации — роли идут по возрастанию.
    const staffToCreate = demo ? STAFF : STAFF.filter((s) => s.role === "admin");
    for (const staff of staffToCreate) await insertUser(staff, `${staff.since}-01-09 08:00:00`);
    // ── Справка ──
    for (const [i, t] of HELP_TOPICS.entries()) {
      await run(
        "INSERT INTO help_topics (slug, n, title, blurb, position) VALUES (?, ?, ?, ?, ?)",
        t.slug, t.n, t.title, t.blurb, i,
      );
    }
    for (const [i, q] of FAQ.entries()) {
      await run(
        "INSERT INTO faq (category, question, answer, position) VALUES (?, ?, ?, ?)",
        q.category, q.question, q.answer, i,
      );
    }

    // ── О проекте ──
    for (const [i, p] of PRINCIPLES.entries()) {
      await run(
        "INSERT INTO about_blocks (kind, label, title, text, position) VALUES ('principle', ?, ?, ?, ?)",
        p.n, p.title, p.text, i,
      );
    }
    for (const [i, m] of MILESTONES.entries()) {
      await run(
        "INSERT INTO about_blocks (kind, label, title, text, position) VALUES ('milestone', ?, ?, ?, ?)",
        m.period, m.title, m.text, i,
      );
    }

    if (!demo) return;

    await insertUser(DEMO_USER, `${DEMO_USER.since}-03-12 09:20:00`);
    for (const [i, s] of SELLERS.entries()) {
      await insertUser(
        { ...s, slug: s.id, phone: DEMO_PHONES[s.id] ?? `90011100${String(i + 4).padStart(2, "0")}` },
        `${s.since}-06-01 12:00:00`,
      );
    }

    const demoId = userIdBySlug.get(DEMO_USER.slug);

    // Демо-аккаунт живёт на тарифе «Витрина» — чтобы личный кабинет сразу
    // показывал оформленный магазин.
    await giveShop(demoId, {
      plan: "storefront",
      months: 12,
      shop: {
        brand: "Соколова · Винтаж",
        tagline: "Редкие вещи и находки с историей — лично отобрано и проверено.",
        cover: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400&h=560&fit=crop&auto=format",
        about: "Собираю и продаю вещи с историей: одежду, аксессуары и предметы интерьера. "
          + "Каждый лот проверяю сама и фотографирую при дневном свете — в описании то, что есть на самом деле.",
        hours: "Ежедневно · 11:00–21:00",
        delivery: "Курьер и Почта по РФ",
        warranty: "Проверка и возврат 7 дней",
      },
      links: [
        { network: "Telegram", handle: "@sokolova_vintage", url: "https://t.me/sokolova_vintage" },
        { network: "Threads", handle: "@sokolova.vintage", url: "https://www.threads.net/@sokolova.vintage" },
      ],
    });
    const sellerIdFor = (listingId) =>
      DEMO_USER_LISTINGS.has(listingId)
        ? demoId
        : userIdBySlug.get(SELLERS[listingId % SELLERS.length].id);

    // ── Лоты ──
    const labelBySlug = new Map(CATEGORIES.map((c) => [c.slug, c.label]));

    for (const item of LISTINGS) {
      const createdAt = ageToTimestamp(item.time, now);
      await run(
        `INSERT INTO listings (id, lot, title, price, location, cond, description, cat, seller_id, badge, status, views, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        item.id, item.lot, item.title, parsePrice(item.price), item.location, item.cond,
        describe(item, labelBySlug.get(item.cat) ?? item.cat), item.cat,
        sellerIdFor(item.id), item.badge, 40 + ((item.id * 37) % 400), createdAt, createdAt,
      );
      await run(
        "INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, 0)",
        item.id, item.img,
      );
    }

    // Демо-лоты вставлены с явными id, счётчик последовательности об этом не
    // знает — двигаем его вручную, иначе следующий INSERT упрётся в занятый id.
    await exec(
      "SELECT setval(pg_get_serial_sequence('listings', 'id'), (SELECT MAX(id) FROM listings))",
    );

    // ── Очередь модерации ──
    // Пара лотов на проверке и один отклонённый, чтобы панель модератора
    // не была пустой сразу после установки.
    const pendingSeed = [
      {
        lot: "0418", title: "Ноутбук Lenovo ThinkPad T14", price: 54000, location: "Москва",
        cond: "Хорошее", cat: "electronics", seller: "artem-v", status: "pending",
        img: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=700&h=875&fit=crop&auto=format",
        description: "Рабочий ноутбук, 16 ГБ ОЗУ, 512 ГБ SSD. Батарея держит около четырёх часов.",
      },
      {
        lot: "0419", title: "Комод дубовый, ручная работа", price: 31000, location: "Казань",
        cond: "Отличное", cat: "home", seller: "sergey-k", status: "pending",
        img: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=700&h=875&fit=crop&auto=format",
        description: "Массив дуба, четыре ящика на доводчиках. Забирать самовывозом.",
      },
      {
        lot: "0420", title: "СРОЧНО!!! Айфон дёшево, пишите в телеграм", price: 9000, location: "Москва",
        cond: "Новое", cat: "electronics", seller: "marina-l", status: "rejected",
        img: "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=700&h=875&fit=crop&auto=format",
        description: "Пишите в телеграм, тут не отвечаю.",
        rejectReason: "Уводит сделку за пределы платформы и не описывает состояние предмета.",
      },
    ];

    const moderatorId = userIdBySlug.get("moderator");

    for (const item of pendingSeed) {
      const createdAt = iso(now - 90 * 60_000);
      await run(
        `INSERT INTO listings (lot, title, price, location, cond, description, cat, seller_id, status, reject_reason, moderated_by, moderated_at, views, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        item.lot, item.title, item.price, item.location, item.cond, item.description,
        item.cat, userIdBySlug.get(item.seller), item.status, item.rejectReason ?? null,
        item.rejectReason ? moderatorId : null, item.rejectReason ? iso(now - 40 * 60_000) : null,
        createdAt, createdAt,
      );
      const created = (await get("SELECT id FROM listings WHERE lot = ?", item.lot)).id;
      await run("INSERT INTO listing_images (listing_id, url, position) VALUES (?, ?, 0)", created, item.img);

      if (item.rejectReason) {
        await run(
          `INSERT INTO moderation_log (actor_id, action, target_type, target_id, reason, created_at)
           VALUES (?, 'listing.reject', 'listing', ?, ?, ?)`,
          moderatorId, created, item.rejectReason, iso(now - 40 * 60_000),
        );
      }
    }

    // Открытая жалоба на опубликованный лот.
    await run(
      `INSERT INTO reports (listing_id, reporter_id, reason, comment, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      4, userIdBySlug.get("artem-v"), "Подозрение на мошенничество",
      "Продавец просит предоплату на карту и торопит со сделкой.", iso(now - 3 * 3600_000),
    );

    // ── Журнал ──
    for (const a of ARTICLES) {
      await run(
        `INSERT INTO articles (slug, rubric, title, excerpt, author, date, read, img, body, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.slug, a.rubric, a.title, a.excerpt, a.author, a.date, a.read, a.img,
        JSON.stringify(a.body), ruDateToIso(a.date),
      );
    }

    // ── Избранное демо-аккаунта ──
    for (const listingId of [2, 8, 11]) {
      await run("INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)", demoId, listingId);
    }

    // ── Диалоги ──
    const minutes = (n) => iso(now - n * 60_000);

    const conversations = [
      {
        listingId: 1,
        buyer: "artem-v",
        messages: [
          { from: "buyer", text: "Здравствуйте! Велосипед ещё в продаже?", at: 96 },
          { from: "seller", text: "Добрый день! Да, в наличии, состояние отличное.", at: 89 },
          { from: "buyer", text: "Отлично. А торг возможен? И есть ли доставка курьером Клауд?", at: 87 },
          { from: "seller", text: "Небольшой торг есть. Доставку оформлю через платформу, гарантийная сделка.", at: 80 },
        ],
      },
      {
        listingId: 13,
        buyer: DEMO_USER.slug,
        messages: [
          { from: "buyer", text: "Здравствуйте! Какой размер у пальто?", at: 1700 },
          { from: "seller", text: "Добрый день! 46-48 (M), длина по спинке 104 см.", at: 1680 },
        ],
      },
      {
        listingId: 14,
        buyer: DEMO_USER.slug,
        messages: [
          { from: "seller", text: "Могу отправить дополнительные фото каркаса.", at: 4300 },
        ],
      },
    ];

    for (const conv of conversations) {
      const listing = await get("SELECT seller_id FROM listings WHERE id = ?", conv.listingId);
      const buyerId = userIdBySlug.get(conv.buyer);
      const sellerId = listing.seller_id;
      const last = conv.messages[conv.messages.length - 1];

      await run(
        `INSERT INTO threads (listing_id, buyer_id, seller_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        conv.listingId, buyerId, sellerId, minutes(conv.messages[0].at), minutes(last.at),
      );
      const threadId = (await get(
        "SELECT id FROM threads WHERE listing_id = ? AND buyer_id = ?",
        conv.listingId, buyerId,
      )).id;

      for (const m of conv.messages) {
        await run(
          "INSERT INTO messages (thread_id, sender_id, text, read_at, created_at) VALUES (?, ?, ?, ?, ?)",
          threadId, m.from === "buyer" ? buyerId : sellerId, m.text, minutes(m.at - 1), minutes(m.at),
        );
      }
    }
  });

  return {
    skipped: false,
    demo,
    users: (await all("SELECT slug FROM users")).map((u) => u.slug),
    listings: (await get("SELECT COUNT(*) AS c FROM listings")).c,
    password: DEMO_PASSWORD,
  };
}

// Запуск напрямую:
//   node server/db/seed.js            — наполнить пустую базу демо-каталогом
//   node server/db/seed.js --force    — пересоздать демо-данные
//   node server/db/seed.js --clean    — очистить всё, кроме категорий и персонала
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const clean = process.argv.includes("--clean");
  const result = await seed({ force: clean || process.argv.includes("--force"), demo: !clean });

  if (result.skipped) {
    console.log("База уже заполнена. Пересоздать: pnpm run api:seed -- --force");
    console.log("Очистить до рабочего минимума: pnpm run api:reset");
  } else if (result.demo) {
    console.log(`Готово: ${result.users.length} пользователей, ${result.listings} лотов.`);
    console.log(`Демо-вход: +7 900 128-45-09 / ${result.password}`);
  } else {
    console.log("База очищена. Остались только справочники и аккаунт администратора:");
    for (const staff of STAFF.filter((s) => s.role === "admin")) {
      console.log(`  ${displayPhone(staff.phone)} — ${staff.name} (${staff.role})`);
    }
    console.log(`Пароль: ${result.password} — смените его после первого входа.`);
  }
  await close();
}
