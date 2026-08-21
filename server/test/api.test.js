import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

// Изолированная схема в тестовой базе — до импорта модулей, читающих config.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || "postgres://cloud:cloud@127.0.0.1:5432/cloud_test";
process.env.DB_SCHEMA = "test_api";
process.env.JWT_SECRET = "test-secret";
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `cloud-test-uploads-${process.pid}`);
process.env.RATE_LIMIT = "off";

const { createApp } = await import("../app.js");
const { close, exec } = await import("../db/index.js");
const { seed, DEMO_PASSWORD } = await import("../db/seed.js");

let server;
let base;

/** fetch с базовым URL, JSON-телом и токеном. */
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

before(async () => {
  // Каждый прогон начинается с пустой схемы.
  await exec(`DROP SCHEMA IF EXISTS "${process.env.DB_SCHEMA}" CASCADE`);
  await seed({ force: true });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await exec(`DROP SCHEMA IF EXISTS "${process.env.DB_SCHEMA}" CASCADE`);
  await close();
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
});

const login = async (phone = "9001284509") => {
  const res = await api("POST", "/api/auth/login", { body: { phone, password: DEMO_PASSWORD } });
  assert.equal(res.status, 200);
  return res.body.token;
};

describe("каталог", () => {
  it("отдаёт разделы со счётчиками", async () => {
    const { status, body } = await api("GET", "/api/categories");
    assert.equal(status, 200);
    assert.equal(body.items.length, 10);
    assert.equal(body.items[0].slug, "auto");
    assert.equal(body.items[0].count, "142 908");
    assert.equal(body.items[0].listingCount, 2);
  });

  it("отдаёт лот в форме, которую ждёт карточка", async () => {
    const { body } = await api("GET", "/api/listings?limit=1");
    const item = body.items[0];
    for (const key of ["id", "lot", "title", "price", "location", "cond", "time", "img", "badge", "cat"]) {
      assert.ok(key in item, `нет поля ${key}`);
    }
    assert.match(item.price, /^[\d ]+$/);
  });

  it("фильтрует по разделу, состоянию и цене", async () => {
    const { body } = await api("GET", "/api/listings?cat=electronics&cond=Новое&maxPrice=50000");
    assert.ok(body.total > 0);
    for (const l of body.items) {
      assert.equal(l.cat, "electronics");
      assert.equal(l.cond, "Новое");
      assert.ok(l.priceValue <= 50000);
    }
  });

  it("сортирует по цене", async () => {
    const asc = await api("GET", "/api/listings?sort=price_asc&limit=50");
    const prices = asc.body.items.map((l) => l.priceValue);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

    // Подписи сортировки из интерфейса тоже принимаются.
    const ru = await api("GET", `/api/listings?sort=${encodeURIComponent("Дороже")}&limit=1`);
    assert.equal(ru.body.items[0].priceValue, Math.max(...prices));
  });

  it("ищет по названию", async () => {
    const { body } = await api("GET", "/api/listings?q=iPhone");
    assert.equal(body.total, 1);
    assert.match(body.items[0].title, /iPhone/);
  });

  it("ищет по номеру лота в любом написании", async () => {
    const any = (await api("GET", "/api/listings?limit=1")).body.items[0];
    const digits = any.lot.replace(/^0+/, "");

    for (const q of [any.lot, digits, `лот ${digits}`, `№${any.lot}`, `#${digits}`]) {
      const found = await api("GET", `/api/listings?q=${encodeURIComponent(q)}`);
      assert.equal(found.status, 200);
      assert.equal(found.body.items[0]?.lot, any.lot, `запрос «${q}»`);
    }
  });

  it("отдаёт лот по номеру отдельным маршрутом", async () => {
    const any = (await api("GET", "/api/listings?limit=1")).body.items[0];

    const exact = await api("GET", `/api/listings/by-lot/${any.lot}`);
    assert.equal(exact.status, 200);
    assert.equal(exact.body.listing.id, any.id);

    // Номер без ведущих нулей — тот же лот.
    const short = await api("GET", `/api/listings/by-lot/${any.lot.replace(/^0+/, "")}`);
    assert.equal(short.body.listing.id, any.id);

    assert.equal((await api("GET", "/api/listings/by-lot/9999")).status, 404);
    assert.equal((await api("GET", "/api/listings/by-lot/абв")).status, 404);
  });

  it("ставит точное совпадение по номеру первым", async () => {
    const any = (await api("GET", "/api/listings?limit=1")).body.items[0];
    const digits = any.lot.replace(/^0+/, "");

    // Дешёвый лот с номером в названии не должен обойти сам лот даже при
    // сортировке по цене.
    const token = await login();
    const created = await api("POST", "/api/listings", {
      token,
      body: { title: `Каталожная карточка ${any.lot} на память`, price: 100, cat: "home", cond: "Новое" },
    });
    await api("POST", `/api/moderation/listings/${created.body.listing.id}/approve`, {
      token: await login("9000000002"),
    });

    const found = await api("GET", `/api/listings?q=${digits}&sort=price_asc`);
    assert.ok(found.body.total >= 2, "нашлись оба лота");
    assert.equal(found.body.items[0].lot, any.lot, "первым идёт лот с этим номером");

    // Убираем за собой: дальше идут проверки, считающие лоты каталога.
    await api("DELETE", `/api/listings/${created.body.listing.id}`, { token });
  });

  it("листает постранично", async () => {
    const p1 = await api("GET", "/api/listings?limit=5&page=1");
    const p2 = await api("GET", "/api/listings?limit=5&page=2");
    assert.equal(p1.body.items.length, 5);
    assert.equal(p1.body.pages, 3);
    assert.notEqual(p1.body.items[0].id, p2.body.items[0].id);
  });

  it("отдаёт лот с продавцом и похожими", async () => {
    const { body } = await api("GET", "/api/listings/2");
    assert.equal(body.listing.lot, "0416");
    assert.ok(body.listing.seller.name);
    assert.match(body.listing.seller.rating, /^\d\.\d$/);

    const related = await api("GET", "/api/listings/2/related");
    assert.ok(related.body.items.length > 0);
    assert.ok(related.body.items.every((l) => l.id !== 2 && l.cat === "electronics"));
  });

  it("отвечает 404 на несуществующий лот", async () => {
    const { status } = await api("GET", "/api/listings/9999");
    assert.equal(status, 404);
  });

  it("отдаёт продавца и его лоты", async () => {
    const seller = await api("GET", "/api/sellers/marina-l");
    assert.equal(seller.status, 200);
    assert.equal(seller.body.seller.name, "Марина Лебедева");

    const listings = await api("GET", "/api/sellers/marina-l/listings");
    assert.ok(listings.body.total > 0);
  });

  it("отдаёт журнал", async () => {
    const list = await api("GET", "/api/articles");
    assert.equal(list.body.items.length, 5);

    const one = await api("GET", "/api/articles/kak-prodat-bystree");
    assert.equal(one.status, 200);
    assert.ok(Array.isArray(one.body.article.body));
    assert.equal(one.body.more.length, 3);
  });
});

describe("авторизация", () => {
  it("регистрирует и сразу выдаёт токен", async () => {
    const { status, body } = await api("POST", "/api/auth/register", {
      body: { name: "Пётр Тестов", phone: "999 000-11-22", password: "supersecret1", agree: true },
    });
    assert.equal(status, 201);
    assert.ok(body.token);
    assert.equal(body.user.name, "Пётр Тестов");
    assert.equal(body.user.id, "petr-testov");
    assert.equal(body.user.phone, "+7 999 000-11-22");
  });

  it("не регистрирует дважды один номер", async () => {
    const { status } = await api("POST", "/api/auth/register", {
      body: { name: "Дубль", phone: "9990001122", password: "supersecret1", agree: true },
    });
    assert.equal(status, 409);
  });

  it("требует согласие с правилами и длинный пароль", async () => {
    const noAgree = await api("POST", "/api/auth/register", {
      body: { name: "Без согласия", phone: "9990002233", password: "supersecret1" },
    });
    assert.equal(noAgree.status, 400);

    const shortPass = await api("POST", "/api/auth/register", {
      body: { name: "Короткий пароль", phone: "9990003344", password: "123", agree: true },
    });
    assert.equal(shortPass.status, 400);
    assert.ok(shortPass.body.details.password);
  });

  it("не пускает с неверным паролем", async () => {
    const { status } = await api("POST", "/api/auth/login", {
      body: { phone: "9001284509", password: "wrong-password" },
    });
    assert.equal(status, 401);
  });

  it("принимает телефон в любом формате", async () => {
    for (const phone of ["9001284509", "+7 900 128-45-09", "8 (900) 128-45-09"]) {
      const { status } = await api("POST", "/api/auth/login", { body: { phone, password: DEMO_PASSWORD } });
      assert.equal(status, 200, phone);
    }
  });

  it("закрывает приватные маршруты без токена", async () => {
    for (const url of ["/api/auth/me", "/api/profile", "/api/favorites", "/api/threads"]) {
      const { status } = await api("GET", url);
      assert.equal(status, 401, url);
    }
  });
});

describe("лоты пользователя", () => {
  it("создаёт лот со статусом «на проверке»", async () => {
    const token = await login();
    const { status, body } = await api("POST", "/api/listings", {
      token,
      body: {
        title: "Принтер Brother HL-1110R",
        price: 7900,
        cat: "home",
        cond: "Хорошее",
        description: "Работает исправно, картридж полный.",
        images: ["/uploads/demo.jpg"],
      },
    });

    assert.equal(status, 201);
    assert.equal(body.listing.status, "pending");
    assert.equal(body.listing.price, "7 900");
    assert.equal(body.listing.lot, "0421");
    assert.equal(body.listing.seller.id, "irina-s");
    assert.deepEqual(body.listing.images, ["/uploads/demo.jpg"]);

    // Лот на проверке не виден в общем каталоге.
    const catalog = await api("GET", "/api/listings?q=Brother");
    assert.equal(catalog.body.total, 0);

    // Но виден во вкладке «Мои объявления».
    const mine = await api("GET", "/api/profile/listings", { token });
    assert.ok(mine.body.items.some((l) => l.id === body.listing.id));
  });

  it("проверяет поля формы подачи", async () => {
    const token = await login();
    const { status, body } = await api("POST", "/api/listings", {
      token,
      body: { title: "аб", price: -5, cat: "нет-такого", cond: "Странное" },
    });
    assert.equal(status, 400);
    assert.ok(body.details.title);
    assert.ok(body.details.price);
    assert.ok(body.details.cond);
  });

  it("редактирует и удаляет только свой лот", async () => {
    const owner = await login();
    const stranger = await login("9001110002");

    const created = await api("POST", "/api/listings", {
      token: owner,
      body: { title: "Временный лот для правок", price: 100, cat: "home", cond: "Новое" },
    });
    const id = created.body.listing.id;

    const patched = await api("PATCH", `/api/listings/${id}`, {
      token: owner,
      body: { price: 250 },
    });
    assert.equal(patched.body.listing.price, "250");
    assert.equal(patched.body.listing.status, "pending");

    // Опубликовать лот сам владелец не может — это право модератора.
    const selfPublish = await api("PATCH", `/api/listings/${id}`, {
      token: owner,
      body: { status: "active" },
    });
    assert.equal(selfPublish.status, 400);

    const forbidden = await api("PATCH", `/api/listings/${id}`, { token: stranger, body: { price: 1 } });
    assert.equal(forbidden.status, 403);

    const removedByStranger = await api("DELETE", `/api/listings/${id}`, { token: stranger });
    assert.equal(removedByStranger.status, 403);

    const removed = await api("DELETE", `/api/listings/${id}`, { token: owner });
    assert.equal(removed.status, 200);
    assert.equal((await api("GET", `/api/listings/${id}`)).status, 404);
  });
});

describe("избранное", () => {
  it("переключает сердечко и отражает это в каталоге", async () => {
    const token = await login();

    const on = await api("POST", "/api/favorites/5/toggle", { token });
    assert.deepEqual(on.body, { wished: true, listingId: 5 });

    const list = await api("GET", "/api/favorites", { token });
    assert.ok(list.body.items.some((l) => l.id === 5));

    const catalog = await api("GET", "/api/listings?limit=50", { token });
    assert.equal(catalog.body.items.find((l) => l.id === 5).wished, true);

    const off = await api("POST", "/api/favorites/5/toggle", { token });
    assert.deepEqual(off.body, { wished: false, listingId: 5 });

    const ids = await api("GET", "/api/favorites/ids", { token });
    assert.ok(!ids.body.ids.includes(5));
  });

  it("не добавляет несуществующий лот", async () => {
    const token = await login();
    assert.equal((await api("PUT", "/api/favorites/9999", { token })).status, 404);
  });
});

describe("сообщения", () => {
  it("отдаёт диалоги в форме страницы «Сообщения»", async () => {
    const token = await login();
    const { body } = await api("GET", "/api/threads", { token });

    assert.equal(body.items.length, 3);
    const t = body.items[0];
    for (const key of ["id", "name", "initial", "lot", "lotTitle", "price", "img", "online", "messages"]) {
      assert.ok(key in t, `нет поля ${key}`);
    }
    assert.match(t.price, /₽$/);
    assert.ok(["me", "them"].includes(t.messages[0].from));
  });

  it("отправляет сообщение и отмечает прочитанным", async () => {
    const buyer = await login();
    const opened = await api("GET", "/api/threads/2", { buyer, token: buyer });
    assert.equal(opened.body.thread.unread, 0);

    const sent = await api("POST", "/api/threads/2/messages", {
      token: buyer,
      body: { text: "Возьму, когда удобно забрать?" },
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.message.from, "me");

    // У продавца это сообщение приходит как непрочитанное и как "them".
    const seller = await login("9001110002");
    const sellerView = await api("GET", "/api/threads", { token: seller });
    const thread = sellerView.body.items.find((t) => t.id === "2");
    assert.equal(thread.unread, 1);
    assert.equal(thread.messages.at(-1).from, "them");

    await api("GET", "/api/threads/2", { token: seller });
    const afterRead = await api("GET", "/api/threads", { token: seller });
    assert.equal(afterRead.body.items.find((t) => t.id === "2").unread, 0);
  });

  it("начинает диалог по лоту и не дублирует его", async () => {
    const token = await login();
    const first = await api("POST", "/api/threads", {
      token,
      body: { listingId: 9, text: "Здравствуйте! Ещё актуально?" },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.thread.messages.length, 1);

    const second = await api("POST", "/api/threads", { token, body: { listingId: 9 } });
    assert.equal(second.body.thread.id, first.body.thread.id);
  });

  it("не даёт написать самому себе и заглянуть в чужой диалог", async () => {
    const token = await login();
    const own = await api("POST", "/api/threads", { token, body: { listingId: 1 } });
    assert.equal(own.status, 400);

    const stranger = await login("9001110003");
    assert.equal((await api("GET", "/api/threads/2", { token: stranger })).status, 403);
  });
});

describe("личный кабинет", () => {
  it("считает статистику вкладки «Обзор»", async () => {
    const token = await login();
    const { body } = await api("GET", "/api/profile/stats", { token });
    assert.ok(body.listings.total >= 3);
    assert.equal(body.deals, 23);
    assert.equal(body.rating, "4.8");
  });

  it("сохраняет настройки и уведомления", async () => {
    const token = await login();
    const { status, body } = await api("PATCH", "/api/profile", {
      token,
      body: { name: "Ирина С.", city: "Казань", notify: { journal: true, promo: false } },
    });

    assert.equal(status, 200);
    assert.equal(body.user.name, "Ирина С.");
    assert.equal(body.user.city, "Казань");
    assert.deepEqual(body.user.notify, { deals: true, journal: true, promo: false });
  });

  it("меняет пароль только при верном текущем", async () => {
    const token = await login();
    const wrong = await api("POST", "/api/profile/password", {
      token,
      body: { current: "nope-nope", next: "brand-new-pass" },
    });
    assert.equal(wrong.status, 400);

    const ok = await api("POST", "/api/profile/password", {
      token,
      body: { current: DEMO_PASSWORD, next: "brand-new-pass" },
    });
    assert.equal(ok.status, 200);

    const relogin = await api("POST", "/api/auth/login", {
      body: { phone: "9001284509", password: "brand-new-pass" },
    });
    assert.equal(relogin.status, 200);

    // Возвращаем демо-пароль, чтобы не ломать последующие прогоны в этом файле.
    await api("POST", "/api/profile/password", {
      token: relogin.body.token,
      body: { current: "brand-new-pass", next: DEMO_PASSWORD },
    });
  });
});

describe("служебное", () => {
  it("отдаёт счётчики бегущей строки", async () => {
    const { body } = await api("GET", "/api/meta");
    assert.equal(body.issue, "417");
    assert.ok(body.marquee.length >= 6);
    assert.ok(body.shortcuts.includes("Гарантийная сделка"));
  });

  it("отвечает 404 на неизвестный маршрут", async () => {
    const { status, body } = await api("GET", "/api/nope");
    assert.equal(status, 404);
    assert.ok(body.error);
  });
});
