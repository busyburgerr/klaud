import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

// Изолированная схема в тестовой базе — до импорта модулей, читающих config.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || "postgres://cloud:cloud@127.0.0.1:5432/cloud_test";
process.env.DB_SCHEMA = "test_moderation";
process.env.JWT_SECRET = "test-secret";
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `cloud-moderation-uploads-${process.pid}`);
process.env.RATE_LIMIT = "off";

const { createApp } = await import("../app.js");
const { close, exec } = await import("../db/index.js");
const { seed, DEMO_PASSWORD } = await import("../db/seed.js");

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

const PHONES = {
  admin: "9000000001",
  moderator: "9000000002",
  user: "9001284509",
  seller: "9001110001",
};

const login = async (who) => {
  const res = await api("POST", "/api/auth/login", {
    body: { phone: PHONES[who], password: DEMO_PASSWORD },
  });
  assert.equal(res.status, 200, `вход ${who}`);
  return res.body.token;
};

/** Свежий лот на модерации, созданный от лица обычного пользователя. */
async function createPending(token, title = "Лот для модерации") {
  const res = await api("POST", "/api/listings", {
    token,
    body: { title, price: 1000, cat: "home", cond: "Новое", description: "Описание лота." },
  });
  assert.equal(res.status, 201);
  return res.body.listing;
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

describe("роли и доступ", () => {
  it("отдаёт роль в профиле", async () => {
    const admin = await api("GET", "/api/auth/me", { token: await login("admin") });
    assert.equal(admin.body.user.role, "admin");

    const user = await api("GET", "/api/auth/me", { token: await login("user") });
    assert.equal(user.body.user.role, "user");
  });

  it("не пускает обычного пользователя в модерацию и админку", async () => {
    const token = await login("user");
    for (const url of ["/api/moderation/queue", "/api/moderation/stats", "/api/admin/users"]) {
      const { status } = await api("GET", url, { token });
      assert.equal(status, 403, url);
    }
  });

  it("не пускает модератора в админку, но пускает в модерацию", async () => {
    const token = await login("moderator");
    assert.equal((await api("GET", "/api/admin/users", { token })).status, 403);
    assert.equal((await api("GET", "/api/moderation/queue", { token })).status, 200);
  });

  it("пускает администратора и в модерацию тоже", async () => {
    const token = await login("admin");
    assert.equal((await api("GET", "/api/moderation/queue", { token })).status, 200);
    assert.equal((await api("GET", "/api/admin/users", { token })).status, 200);
  });

  it("закрывает модерацию от гостя", async () => {
    assert.equal((await api("GET", "/api/moderation/queue")).status, 401);
  });
});

describe("проверка лотов", () => {
  it("новый лот попадает в очередь и не виден в каталоге", async () => {
    const token = await login("user");
    const listing = await createPending(token, "Гитара классическая Yamaha C40");
    assert.equal(listing.status, "pending");

    const catalog = await api("GET", "/api/listings?q=Yamaha");
    assert.equal(catalog.body.total, 0);

    const queue = await api("GET", "/api/moderation/queue", { token: await login("moderator") });
    assert.ok(queue.body.items.some((l) => l.id === listing.id));
  });

  it("одобрение публикует лот", async () => {
    const owner = await login("user");
    const listing = await createPending(owner, "Самокат городской Ninebot");

    const moderator = await login("moderator");
    const approved = await api("POST", `/api/moderation/listings/${listing.id}/approve`, { token: moderator });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.listing.status, "active");

    const catalog = await api("GET", "/api/listings?q=Ninebot");
    assert.equal(catalog.body.total, 1);

    // Повторное одобрение бессмысленно.
    const again = await api("POST", `/api/moderation/listings/${listing.id}/approve`, { token: moderator });
    assert.equal(again.status, 400);
  });

  it("отклонение сохраняет причину и показывает её владельцу", async () => {
    const owner = await login("user");
    const listing = await createPending(owner, "Сомнительный лот без описания");

    const moderator = await login("moderator");
    const rejected = await api("POST", `/api/moderation/listings/${listing.id}/reject`, {
      token: moderator,
      body: { reason: "Нет фотографий и описания состояния предмета." },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.listing.status, "rejected");

    const mine = await api("GET", "/api/profile/listings", { token: owner });
    const found = mine.body.items.find((l) => l.id === listing.id);
    assert.equal(found.status, "rejected");
    assert.match(found.rejectReason, /Нет фотографий/);
  });

  it("требует причину при отклонении", async () => {
    const listing = await createPending(await login("user"));
    const { status } = await api("POST", `/api/moderation/listings/${listing.id}/reject`, {
      token: await login("moderator"),
      body: { reason: "нет" },
    });
    assert.equal(status, 400);
  });

  it("возвращает отклонённый лот на повторную проверку", async () => {
    const owner = await login("user");
    const listing = await createPending(owner, "Лот на доработку");
    await api("POST", `/api/moderation/listings/${listing.id}/reject`, {
      token: await login("moderator"),
      body: { reason: "Уточните комплектацию и состояние." },
    });

    const again = await api("POST", `/api/listings/${listing.id}/resubmit`, { token: owner });
    assert.equal(again.status, 200);
    assert.equal(again.body.listing.status, "pending");
    assert.equal(again.body.listing.rejectReason, null);
  });

  it("правка опубликованного лота возвращает его на проверку", async () => {
    const owner = await login("user");
    const listing = await createPending(owner, "Лот для правки после публикации");
    await api("POST", `/api/moderation/listings/${listing.id}/approve`, { token: await login("moderator") });

    const patched = await api("PATCH", `/api/listings/${listing.id}`, {
      token: owner,
      body: { title: "Совсем другой предмет после одобрения" },
    });
    assert.equal(patched.body.listing.status, "pending");

    // И из каталога он уходит до повторной проверки.
    const catalog = await api("GET", "/api/listings?q=Совсем%20другой");
    assert.equal(catalog.body.total, 0);
  });

  it("модератор снимает опубликованный лот", async () => {
    const owner = await login("user");
    const listing = await createPending(owner, "Лот к снятию модератором");
    const moderator = await login("moderator");
    await api("POST", `/api/moderation/listings/${listing.id}/approve`, { token: moderator });

    const archived = await api("POST", `/api/moderation/listings/${listing.id}/archive`, {
      token: moderator,
      body: { reason: "Жалобы покупателей" },
    });
    assert.equal(archived.body.listing.status, "archived");
  });
});

describe("жалобы", () => {
  it("покупатель жалуется на лот, модератор видит жалобу", async () => {
    const token = await login("user");
    const created = await api("POST", "/api/listings/2/report", {
      token,
      body: { reason: "Спам или реклама", comment: "В описании ссылка на другой сайт." },
    });
    assert.equal(created.status, 201);

    const reports = await api("GET", "/api/moderation/reports", { token: await login("moderator") });
    const report = reports.body.items.find((r) => r.listingId === 2);
    assert.ok(report);
    assert.equal(report.status, "open");
    assert.equal(report.reason, "Спам или реклама");
  });

  it("не принимает жалобу дважды и на собственный лот", async () => {
    const token = await login("user");
    const again = await api("POST", "/api/listings/2/report", {
      token,
      body: { reason: "Спам или реклама" },
    });
    assert.equal(again.status, 409);

    // Лот 1 принадлежит демо-пользователю.
    const own = await api("POST", "/api/listings/1/report", {
      token,
      body: { reason: "Спам или реклама" },
    });
    assert.equal(own.status, 400);
  });

  it("проверяет причину жалобы по списку", async () => {
    const { status } = await api("POST", "/api/listings/3/report", {
      token: await login("user"),
      body: { reason: "мне просто не нравится" },
    });
    assert.equal(status, 400);
  });

  it("модератор закрывает жалобу", async () => {
    const moderator = await login("moderator");
    const open = await api("GET", "/api/moderation/reports", { token: moderator });
    const report = open.body.items[0];

    const resolved = await api("POST", `/api/moderation/reports/${report.id}/resolve`, {
      token: moderator,
      body: { status: "resolved", comment: "Лот снят с публикации" },
    });
    assert.equal(resolved.status, 200);

    const stillOpen = await api("GET", "/api/moderation/reports", { token: moderator });
    assert.ok(!stillOpen.body.items.some((r) => r.id === report.id));
  });
});

describe("администрирование", () => {
  it("назначает и снимает модератора", async () => {
    const admin = await login("admin");
    const users = await api("GET", "/api/admin/users?q=Артём", { token: admin });
    const target = users.body.items[0];
    assert.equal(target.role, "user");

    const promoted = await api("PATCH", `/api/admin/users/${target.userId}/role`, {
      token: admin,
      body: { role: "moderator" },
    });
    assert.equal(promoted.body.user.role, "moderator");

    // Новый модератор сразу получает доступ к очереди.
    const asModerator = await login("seller");
    assert.equal((await api("GET", "/api/moderation/queue", { token: asModerator })).status, 200);

    const demoted = await api("PATCH", `/api/admin/users/${target.userId}/role`, {
      token: admin,
      body: { role: "user" },
    });
    assert.equal(demoted.body.user.role, "user");
    assert.equal((await api("GET", "/api/moderation/queue", { token: await login("seller") })).status, 403);
  });

  it("не даёт снять последнего администратора и сменить свою роль", async () => {
    const admin = await login("admin");
    const me = await api("GET", "/api/auth/me", { token: admin });

    const self = await api("PATCH", `/api/admin/users/${me.body.user.userId}/role`, {
      token: admin,
      body: { role: "user" },
    });
    assert.equal(self.status, 400);
  });

  it("блокирует аккаунт: вход закрыт, лоты сняты", async () => {
    const admin = await login("admin");
    const users = await api("GET", "/api/admin/users?q=Марина", { token: admin });
    const target = users.body.items[0];

    const blocked = await api("POST", `/api/admin/users/${target.userId}/block`, {
      token: admin,
      body: { reason: "Продажа запрещённых товаров" },
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.user.blocked, true);

    const login403 = await api("POST", "/api/auth/login", {
      body: { phone: "9001110002", password: DEMO_PASSWORD },
    });
    assert.equal(login403.status, 403);
    assert.match(login403.body.error, /заблокирован/);

    const catalog = await api("GET", "/api/listings?seller=marina-l");
    assert.equal(catalog.body.total, 0);

    const unblocked = await api("POST", `/api/admin/users/${target.userId}/unblock`, { token: admin });
    assert.equal(unblocked.body.user.blocked, false);
    assert.equal((await api("POST", "/api/auth/login", {
      body: { phone: "9001110002", password: DEMO_PASSWORD },
    })).status, 200);
  });

  it("не даёт заблокировать администратора", async () => {
    const admin = await login("admin");
    const admins = await api("GET", "/api/admin/users?role=admin", { token: admin });
    const other = admins.body.items.find((u) => u.phone !== "+7 900 000-00-01") ?? admins.body.items[0];

    const { status } = await api("POST", `/api/admin/users/${other.userId}/block`, {
      token: admin,
      body: { reason: "Проверка защиты" },
    });
    assert.ok(status === 400 || status === 403);
  });
});

describe("журнал модерации", () => {
  it("журнал действий доступен персоналу и содержит автора", async () => {
    const { status, body } = await api("GET", "/api/moderation/log", { token: await login("moderator") });
    assert.equal(status, 200);
    assert.ok(body.items.length > 0);

    const entry = body.items[0];
    assert.ok(entry.action);
    assert.ok(entry.actor?.name);
    assert.ok(["listing", "user", "report"].includes(entry.targetType));
  });

  it("считает сводку для панели", async () => {
    const { body } = await api("GET", "/api/moderation/stats", { token: await login("moderator") });
    for (const key of ["pending", "rejected", "active", "openReports", "today"]) {
      assert.equal(typeof body[key], "number", key);
    }
  });
});
