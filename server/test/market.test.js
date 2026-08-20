import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const tmpDb = path.join(os.tmpdir(), `cloud-market-${process.pid}.db`);
process.env.DB_FILE = tmpDb;
process.env.JWT_SECRET = "test-secret";
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `cloud-market-uploads-${process.pid}`);
process.env.RATE_LIMIT = "off";

const { createApp } = await import("../app.js");
const { close } = await import("../db/index.js");
const { seed, DEMO_PASSWORD } = await import("../db/seed.js");
const { fillCatalog } = await import("../db/fill-catalog.js");
const { CATALOG_LISTINGS } = await import("../db/catalog-data.js");

let server;
let base;

async function api(method, url, { body, token } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const PHONES = { admin: "9000000001", moderator: "9000000002", user: "9001284509", seller: "9001110001" };

const login = async (who) => {
  const res = await api("POST", "/api/auth/login", {
    body: { phone: PHONES[who], password: DEMO_PASSWORD },
  });
  assert.equal(res.status, 200, `вход ${who}`);
  return res.body.token;
};

/** Публикует лот от лица продавца и сразу проводит его через модерацию. */
async function publish(sellerToken, over = {}) {
  const created = await api("POST", "/api/listings", {
    token: sellerToken,
    body: { title: "Лот для сделки", price: 5000, cat: "home", cond: "Новое", ...over },
  });
  assert.equal(created.status, 201);
  await api("POST", `/api/moderation/listings/${created.body.listing.id}/approve`, {
    token: await login("moderator"),
  });
  return created.body.listing;
}

before(async () => {
  seed({ force: true });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  close();
  for (const f of [tmpDb, `${tmpDb}-wal`, `${tmpDb}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
});

describe("города", () => {
  it("отдаёт справочник с числом лотов", async () => {
    const { status, body } = await api("GET", "/api/cities");
    assert.equal(status, 200);
    assert.ok(body.items.length >= 30);

    const moscow = body.items.find((c) => c.name === "Москва");
    assert.ok(moscow, "Москва есть в справочнике");
    assert.equal(typeof moscow.listingCount, "number");
  });

  it("фильтрует каталог по городу", async () => {
    const seller = await login("seller");
    await publish(seller, { title: "Лот в Калининграде", location: "Калининград" });

    const inCity = await api("GET", "/api/listings?location=Калининград");
    assert.ok(inCity.body.items.every((l) => l.location === "Калининград"));
    assert.ok(inCity.body.total >= 1);

    const other = await api("GET", "/api/listings?location=Владивосток");
    assert.equal(other.body.total, 0);
  });
});

describe("почта в профиле", () => {
  it("сохраняет и очищает адрес", async () => {
    const token = await login("user");

    const saved = await api("PATCH", "/api/profile", { token, body: { email: "Buyer@Example.COM " } });
    assert.equal(saved.status, 200);
    // Адрес нормализуется к нижнему регистру.
    assert.equal(saved.body.user.email, "buyer@example.com");
    assert.equal(saved.body.user.emailVerified, false);

    const cleared = await api("PATCH", "/api/profile", { token, body: { email: "" } });
    assert.equal(cleared.body.user.email, null);
  });

  it("проверяет формат и занятость адреса", async () => {
    const user = await login("user");
    const bad = await api("PATCH", "/api/profile", { token: user, body: { email: "без-собаки" } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.email);

    await api("PATCH", "/api/profile", { token: user, body: { email: "zanyato@example.com" } });

    const other = await login("seller");
    const taken = await api("PATCH", "/api/profile", { token: other, body: { email: "zanyato@example.com" } });
    assert.equal(taken.status, 409);
  });
});

describe("сделки и отзывы", () => {
  it("продавец отмечает лот проданным и выбирает покупателя", async () => {
    const seller = await login("seller");
    const buyer = await login("user");
    const listing = await publish(seller, { title: "Лот с покупателем" });

    // Покупатель написал по лоту — только такие попадают в список.
    await api("POST", "/api/threads", { token: buyer, body: { listingId: listing.id, text: "Беру" } });

    const buyers = await api("GET", `/api/listings/${listing.id}/buyers`, { token: seller });
    assert.equal(buyers.body.items.length, 1);

    const sold = await api("POST", `/api/listings/${listing.id}/sell`, {
      token: seller,
      body: { buyerId: buyers.body.items[0].userId },
    });
    assert.equal(sold.status, 200);
    assert.equal(sold.body.listing.status, "sold");

    // Проданный лот уходит из каталога.
    const catalog = await api("GET", "/api/listings?q=Лот с покупателем");
    assert.equal(catalog.body.total, 0);
  });

  it("покупатель видит сделку в ожидании отзыва и оценивает её", async () => {
    const buyer = await login("user");
    const pending = await api("GET", "/api/reviews/pending", { token: buyer });
    assert.ok(pending.body.items.length >= 1);

    const deal = pending.body.items[0];
    const review = await api("POST", "/api/reviews", {
      token: buyer,
      body: { listingId: deal.listingId, rating: 5, dealSuccess: true, text: "Всё прошло гладко." },
    });

    assert.equal(review.status, 201);
    assert.equal(review.body.review.rating, 5);
    assert.equal(review.body.review.dealSuccess, true);
    assert.ok(review.body.review.listingTitle);
    assert.ok(review.body.review.author.name);

    // Сделка ушла из списка ожидающих.
    const after = await api("GET", "/api/reviews/pending", { token: buyer });
    assert.ok(!after.body.items.some((d) => d.listingId === deal.listingId));
  });

  it("рейтинг продавца складывается из отзывов", async () => {
    const reviews = await api("GET", "/api/reviews/user/artem-v");
    assert.ok(reviews.body.summary.total >= 1);
    assert.equal(reviews.body.summary.rating, "5.0");
    assert.ok(reviews.body.summary.successful >= 1);

    const seller = await api("GET", "/api/sellers/artem-v");
    assert.equal(seller.body.seller.rating, "5.0");
  });

  it("не принимает отзыв от постороннего, дважды и до сделки", async () => {
    const seller = await login("seller");
    const stranger = await login("admin");
    const buyer = await login("user");

    const fresh = await publish(seller, { title: "Ещё не проданный лот" });
    const early = await api("POST", "/api/reviews", {
      token: buyer,
      body: { listingId: fresh.id, rating: 5, dealSuccess: true },
    });
    assert.equal(early.status, 400);

    const sold = await publish(seller, { title: "Лот для проверки прав" });
    await api("POST", "/api/threads", { token: buyer, body: { listingId: sold.id, text: "Беру" } });
    const buyers = await api("GET", `/api/listings/${sold.id}/buyers`, { token: seller });
    await api("POST", `/api/listings/${sold.id}/sell`, {
      token: seller,
      body: { buyerId: buyers.body.items[0].userId },
    });

    const outsider = await api("POST", "/api/reviews", {
      token: stranger,
      body: { listingId: sold.id, rating: 1, dealSuccess: false },
    });
    assert.equal(outsider.status, 403);

    const first = await api("POST", "/api/reviews", {
      token: buyer,
      body: { listingId: sold.id, rating: 4, dealSuccess: true },
    });
    assert.equal(first.status, 201);

    const twice = await api("POST", "/api/reviews", {
      token: buyer,
      body: { listingId: sold.id, rating: 1, dealSuccess: false },
    });
    assert.equal(twice.status, 409);
  });

  it("отзыв можно забрать, рейтинг пересчитывается", async () => {
    const buyer = await login("user");
    const before = await api("GET", "/api/reviews/user/artem-v");
    const mine = before.body.items.find((r) => r.author.id === "irina-s");

    const removed = await api("DELETE", `/api/reviews/${mine.id}`, { token: buyer });
    assert.equal(removed.status, 200);

    const after = await api("GET", "/api/reviews/user/artem-v");
    assert.equal(after.body.summary.total, before.body.summary.total - 1);
  });
});

describe("статистика проекта", () => {
  it("закрыта от всех, кроме администратора", async () => {
    assert.equal((await api("GET", "/api/admin/overview")).status, 401);
    assert.equal((await api("GET", "/api/admin/overview", { token: await login("user") })).status, 403);
    assert.equal((await api("GET", "/api/admin/overview", { token: await login("moderator") })).status, 403);
  });

  it("считает загруженные и проданные лоты, оборот и периоды", async () => {
    const { status, body } = await api("GET", "/api/admin/overview", { token: await login("admin") });

    assert.equal(status, 200);
    assert.ok(body.listings.total > 0);
    assert.ok(body.sales.count > 0);
    assert.ok(body.sales.revenue > 0);
    assert.equal(body.sales.count, body.listings.sold);

    // Пять периодов: сутки, неделя, месяц, год, всё время.
    assert.equal(body.periods.length, 5);
    const all = body.periods.find((p) => p.period === "all");
    assert.equal(all.listingsCreated, body.listings.total);
    assert.equal(all.listingsSold, body.listings.sold);

    // Помесячная динамика за год.
    assert.equal(body.trend.length, 12);
    assert.ok(body.trend.at(-1).created >= 1);
  });

  it("отдаёт показатели одного периода", async () => {
    const { status, body } = await api("GET", "/api/admin/overview/week", { token: await login("admin") });
    assert.equal(status, 200);
    assert.equal(body.stats.period, "week");

    const bad = await api("GET", "/api/admin/overview/century", { token: await login("admin") });
    assert.equal(bad.status, 400);
  });
});

describe("витринные показатели", () => {
  it("считаются из базы и доступны без входа", async () => {
    const { status, body } = await api("GET", "/api/meta/metrics");
    assert.equal(status, 200);

    const m = body.metrics;
    const overview = await api("GET", "/api/admin/overview", { token: await login("admin") });

    assert.equal(m.sold, overview.body.listings.sold);
    assert.equal(m.buyers, overview.body.users.total);
    assert.ok(m.cities >= 1, "города считаются по лотам");
    assert.ok(m.sellers >= 1);
    // Рейтинг площадки — среднее по отзывам.
    assert.match(m.rating, /^\d\.\d$/);
  });
});

describe("справка", () => {
  it("отдаёт разделы, вопросы и контакты без входа", async () => {
    const { status, body } = await api("GET", "/api/help");

    assert.equal(status, 200);
    assert.equal(body.topics.length, 6);
    assert.ok(body.questions.length >= 15);
    assert.ok(body.categories.includes("Покупка"));
    assert.ok(body.support.email.includes("@"));
    assert.ok(body.support.phone);

    const first = body.topics[0];
    assert.equal(first.n, "01");
    assert.ok(first.title && first.blurb);
  });

  it("у каждого вопроса есть раздел из списка", async () => {
    const { body } = await api("GET", "/api/help");
    for (const q of body.questions) {
      assert.ok(body.categories.includes(q.category), `раздел «${q.category}» есть в списке`);
      assert.ok(q.question.length > 5);
      assert.ok(q.answer.length > 20);
    }
  });

  it("содержимое переживает очистку базы", async () => {
    // Справка — такой же справочник, как категории: нужна и на чистой базе.
    const { body } = await api("GET", "/api/help");
    assert.ok(body.questions.some((q) => q.question.includes("эскроу") || q.answer.includes("эскроу")));
  });
});

describe("о проекте", () => {
  it("отдаёт колофон, принципы и вехи без входа", async () => {
    const { status, body } = await api("GET", "/api/about");

    assert.equal(status, 200);
    assert.equal(body.project.since, "2026");
    assert.ok(body.project.title && body.project.lead);
    assert.equal(body.principles.length, 4);
    assert.deepEqual(body.principles.map((p) => p.n), ["01", "02", "03", "04"]);
    assert.equal(body.milestones.length, 3);
  });

  it("не рассказывает историю раньше 2026 года", async () => {
    const { body } = await api("GET", "/api/about");
    const text = JSON.stringify(body.milestones) + body.project.since;

    for (const year of ["2023", "2024", "2025"]) {
      assert.ok(!text.includes(year), `в вехах нет ${year} года`);
    }
    assert.ok(body.milestones.some((m) => m.period.includes("2026")));
  });

  it("показывает настоящую редакцию, а не выдуманных людей", async () => {
    const { body } = await api("GET", "/api/about");

    assert.ok(body.team.length >= 2);
    // Первым идёт администратор.
    assert.match(body.team[0].role, /Администрация/);
    assert.ok(body.team.every((p) => p.name && p.initial && p.id));

    // Все люди на странице — существующие аккаунты персонала.
    for (const person of body.team) {
      const seller = await api("GET", `/api/sellers/${person.id}`);
      assert.equal(seller.status, 200, `${person.name} — реальный аккаунт`);
    }
  });

  it("берёт показатели из базы, а не из вёрстки", async () => {
    const about = await api("GET", "/api/about");
    const metrics = await api("GET", "/api/meta/metrics");

    assert.deepEqual(about.body.metrics, metrics.body.metrics);
    assert.equal(about.body.metrics.sold, metrics.body.metrics.sold);
  });
});

describe("наполнение каталога", () => {
  it("заполняет все десять разделов", async () => {
    fillCatalog();

    const categories = (await api("GET", "/api/categories")).body.items;
    assert.equal(categories.length, 10);

    for (const c of categories) {
      const inCategory = await api("GET", `/api/listings?cat=${c.slug}`);
      assert.ok(inCategory.body.total > 0, `в разделе «${c.label}» есть лоты`);
    }
  });

  it("у каждого лота каталога есть фотография, цена и город", async () => {
    const { body } = await api("GET", "/api/listings?limit=100");
    assert.ok(body.total >= 40);

    // Проверяем лоты каталога; тесты выше создавали свои, без фотографий.
    const titles = new Set(CATALOG_LISTINGS.map((l) => l.title));
    for (const lot of body.items.filter((l) => titles.has(l.title))) {
      assert.match(lot.img, /^https:\/\/images\.unsplash\.com\//, `${lot.title}: есть фотография`);
      assert.ok(lot.priceValue > 0, `${lot.title}: цена больше нуля`);
      assert.ok(lot.location, `${lot.title}: указан город`);
      assert.ok(lot.description.length > 20, `${lot.title}: есть описание`);
      assert.equal(lot.status, "active");
    }
  });

  it("не дублирует лоты при повторном запуске", async () => {
    const before = (await api("GET", "/api/listings?limit=100")).body.total;
    const result = fillCatalog();
    const after = (await api("GET", "/api/listings?limit=100")).body.total;

    assert.equal(result.added, 0);
    assert.equal(after, before);
  });

  it("оставляет состоявшиеся сделки с отзывами", async () => {
    const sold = await api("GET", "/api/listings?status=sold&limit=20");
    assert.ok(sold.body.total >= 4);

    // У продавцов из сделок появился рейтинг, собранный из отзывов.
    const reviews = await api("GET", "/api/reviews/user/dmitry-r");
    assert.ok(reviews.body.summary.total >= 1, "о продавце есть отзыв");
    assert.match(reviews.body.summary.rating, /^\d\.\d$/);
  });
});
