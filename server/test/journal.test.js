import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const tmpDb = path.join(os.tmpdir(), `cloud-journal-${process.pid}.db`);
process.env.DB_FILE = tmpDb;
process.env.JWT_SECRET = "test-secret";
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `cloud-journal-uploads-${process.pid}`);
process.env.RATE_LIMIT = "off";

const { createApp } = await import("../app.js");
const { close } = await import("../db/index.js");
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

const PHONES = { admin: "9000000001", moderator: "9000000002", user: "9001284509" };

const login = async (who) => {
  const res = await api("POST", "/api/auth/login", {
    body: { phone: PHONES[who], password: DEMO_PASSWORD },
  });
  assert.equal(res.status, 200, `вход ${who}`);
  return res.body.token;
};

const draft = (over = {}) => ({
  title: "Как выбрать велосипед с рук",
  rubric: "Гид покупателя",
  body: [
    { type: "paragraph", text: "Первый абзац про раму и размер." },
    { type: "paragraph", text: "Второй абзац про навесное оборудование." },
  ],
  ...over,
});

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

describe("права на журнал", () => {
  it("гость и обычный пользователь не могут писать", async () => {
    assert.equal((await api("POST", "/api/articles", { body: draft() })).status, 401);

    const user = await login("user");
    const denied = await api("POST", "/api/articles", { token: user, body: draft() });
    assert.equal(denied.status, 403);
  });

  it("не даёт обычному пользователю править и удалять чужие материалы", async () => {
    const user = await login("user");
    assert.equal((await api("PATCH", "/api/articles/kak-prodat-bystree", { token: user, body: { title: "Перехват заголовка" } })).status, 403);
    assert.equal((await api("DELETE", "/api/articles/kak-prodat-bystree", { token: user })).status, 403);
  });

  it("отдаёт признак прав в ответе списка", async () => {
    const guest = await api("GET", "/api/articles");
    assert.equal(guest.body.canEdit, false);

    const staff = await api("GET", "/api/articles", { token: await login("moderator") });
    assert.equal(staff.body.canEdit, true);
  });
});

describe("публикация материала", () => {
  it("модератор публикует материал", async () => {
    const token = await login("moderator");
    const { status, body } = await api("POST", "/api/articles", { token, body: draft() });

    assert.equal(status, 201);
    assert.equal(body.article.slug, "kak-vybrat-velosiped-s-ruk");
    assert.equal(body.article.status, "published");
    assert.equal(body.article.author, "Ольга Тихонова");
    assert.equal(body.article.body.length, 2);
    // Лид берётся из первого абзаца, если не задан.
    assert.match(body.article.excerpt, /Первый абзац/);
    assert.match(body.article.read, /^\d+ мин$/);
    assert.match(body.article.date, /\d{4}$/);

    const published = await api("GET", "/api/articles");
    assert.ok(published.body.items.some((a) => a.slug === body.article.slug));
  });

  it("администратор тоже может писать", async () => {
    const token = await login("admin");
    const { status, body } = await api("POST", "/api/articles", {
      token,
      body: draft({ title: "Правила площадки обновились" }),
    });
    assert.equal(status, 201);
    assert.equal(body.article.author, "Администратор Клауд");
  });

  it("разводит одинаковые заголовки по разным адресам", async () => {
    const token = await login("moderator");
    const first = await api("POST", "/api/articles", { token, body: draft({ title: "Одинаковый заголовок" }) });
    const second = await api("POST", "/api/articles", { token, body: draft({ title: "Одинаковый заголовок" }) });

    assert.equal(first.body.article.slug, "odinakovyy-zagolovok");
    assert.equal(second.body.article.slug, "odinakovyy-zagolovok-2");
  });

  it("проверяет заголовок, рубрику и текст", async () => {
    const token = await login("moderator");

    const short = await api("POST", "/api/articles", { token, body: draft({ title: "Мало" }) });
    assert.equal(short.status, 400);
    assert.ok(short.body.details.title);

    const empty = await api("POST", "/api/articles", { token, body: draft({ body: [] }) });
    assert.equal(empty.status, 400);
    assert.ok(empty.body.details.body);

    const noRubric = await api("POST", "/api/articles", { token, body: { title: "Материал без рубрики", body: ["Текст."] } });
    assert.equal(noRubric.status, 400);
  });
});

describe("черновики", () => {
  it("черновик виден редакции и скрыт от читателей", async () => {
    const token = await login("moderator");
    const created = await api("POST", "/api/articles", {
      token,
      body: draft({ title: "Заготовка про доставку", status: "draft" }),
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.article.isDraft, true);

    const guestList = await api("GET", "/api/articles");
    assert.ok(!guestList.body.items.some((a) => a.slug === created.body.article.slug));

    const guestOne = await api("GET", `/api/articles/${created.body.article.slug}`);
    assert.equal(guestOne.status, 404);

    const staffList = await api("GET", "/api/articles", { token });
    assert.ok(staffList.body.items.some((a) => a.slug === created.body.article.slug));
    assert.ok(staffList.body.drafts >= 1);

    const staffOne = await api("GET", `/api/articles/${created.body.article.slug}`, { token });
    assert.equal(staffOne.status, 200);
  });

  it("публикует черновик и обновляет дату", async () => {
    const token = await login("moderator");
    const created = await api("POST", "/api/articles", {
      token,
      body: draft({ title: "Черновик к публикации", status: "draft" }),
    });

    const published = await api("PATCH", `/api/articles/${created.body.article.slug}`, {
      token,
      body: { status: "published" },
    });
    assert.equal(published.body.article.status, "published");
    assert.equal(published.body.article.isDraft, false);

    const guest = await api("GET", `/api/articles/${created.body.article.slug}`);
    assert.equal(guest.status, 200);
  });

  it("фильтрует список по статусу для редакции", async () => {
    const token = await login("moderator");
    const drafts = await api("GET", "/api/articles?status=draft", { token });
    assert.ok(drafts.body.items.every((a) => a.isDraft));
  });
});

describe("правка и удаление", () => {
  it("правит текст и пересчитывает время чтения", async () => {
    const token = await login("moderator");
    const created = await api("POST", "/api/articles", { token, body: draft({ title: "Материал для правки текста" }) });

    const long = Array.from({ length: 6 }, (_, i) => `Абзац номер ${i + 1}. `.repeat(60));
    const patched = await api("PATCH", `/api/articles/${created.body.article.slug}`, {
      token,
      body: { body: long, title: "Обновлённый заголовок материала" },
    });

    assert.equal(patched.body.article.title, "Обновлённый заголовок материала");
    assert.equal(patched.body.article.body.length, 6);
    assert.notEqual(patched.body.article.read, created.body.article.read);
    // Адрес материала при правке заголовка не меняется — ссылки не ломаются.
    assert.equal(patched.body.article.slug, created.body.article.slug);
  });

  it("удаляет материал", async () => {
    const token = await login("moderator");
    const created = await api("POST", "/api/articles", { token, body: draft({ title: "Материал под удаление" }) });

    const removed = await api("DELETE", `/api/articles/${created.body.article.slug}`, { token });
    assert.equal(removed.status, 200);
    assert.equal((await api("GET", `/api/articles/${created.body.article.slug}`)).status, 404);
  });

  it("отвечает 404 на несуществующий материал", async () => {
    const token = await login("moderator");
    assert.equal((await api("PATCH", "/api/articles/net-takogo", { token, body: { title: "Новый заголовок" } })).status, 404);
    assert.equal((await api("DELETE", "/api/articles/net-takogo", { token })).status, 404);
  });
});

describe("журнал модерации", () => {
  it("записывает действия с материалами", async () => {
    const token = await login("moderator");
    const { body } = await api("GET", "/api/moderation/log?limit=50", { token });

    const actions = body.items.filter((e) => e.targetType === "article").map((e) => e.action);
    assert.ok(actions.includes("article.publish"));
    assert.ok(actions.includes("article.draft"));
    assert.ok(actions.includes("article.edit"));
    assert.ok(actions.includes("article.delete"));

    const entry = body.items.find((e) => e.action === "article.publish");
    assert.ok(entry.details, "в журнале сохраняется заголовок материала");
  });
});

describe("блоки материала", () => {
  const rich = {
    title: "Безопасная сделка: как Клауд защищает деньги",
    rubric: "Покупателям",
    excerpt: "Эскроу-оплата, проверка продавцов и арбитраж споров.",
    body: [
      { type: "paragraph", text: "На обычной доске объявлений вы переводите деньги незнакомцу." },
      { type: "heading", text: "Как работает эскроу" },
      {
        type: "steps",
        items: [
          { title: "Оплата замораживается", text: "Деньги поступают на защищённый счёт Клауд." },
          { title: "Продавец отправляет лот", text: "Видя гарантию оплаты, продавец передаёт вещь курьеру." },
          { title: "Вы проверяете", text: "После получения есть время осмотреть лот." },
        ],
      },
      { type: "heading", text: "Признаки мошенничества" },
      {
        type: "list",
        items: [
          "Просьба перевести деньги на карту.",
          "Слишком низкая цена и давление «берите срочно».",
          "Отказ от доставки платформой.",
        ],
      },
      { type: "callout", label: "Важно", text: "Всё общение и вся оплата — только внутри Клауд." },
    ],
  };

  it("сохраняет материал со всеми типами блоков", async () => {
    const token = await login("moderator");
    const { status, body } = await api("POST", "/api/articles", { token, body: rich });

    assert.equal(status, 201);
    const blocks = body.article.body;
    assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "heading", "steps", "heading", "list", "callout"]);
    assert.equal(blocks[2].items.length, 3);
    assert.equal(blocks[2].items[0].title, "Оплата замораживается");
    assert.equal(blocks[4].items.length, 3);
    assert.equal(blocks[5].label, "Важно");
  });

  it("отдаёт блоки читателю по прямой ссылке", async () => {
    const token = await login("moderator");
    const created = await api("POST", "/api/articles", {
      token,
      body: { ...rich, title: "Материал с блоками для читателя" },
    });

    const guest = await api("GET", `/api/articles/${created.body.article.slug}`);
    assert.equal(guest.status, 200);
    assert.deepEqual(
      guest.body.article.body.map((b) => b.type),
      ["paragraph", "heading", "steps", "heading", "list", "callout"],
    );
  });

  it("считает время чтения по всему тексту, включая списки и шаги", async () => {
    const token = await login("moderator");
    const short = await api("POST", "/api/articles", {
      token,
      body: { ...rich, title: "Короткий материал про блоки" },
    });
    const long = await api("POST", "/api/articles", {
      token,
      body: {
        ...rich,
        title: "Длинный материал про блоки",
        body: [
          ...rich.body,
          // Ровно в пределах лимита абзаца — проверяем счётчик, а не валидацию.
          { type: "paragraph", text: "Дополнение. ".repeat(300) },
          { type: "paragraph", text: "Ещё дополнение. ".repeat(200) },
        ],
      },
    });

    assert.notEqual(short.body.article.read, long.body.article.read);
  });

  it("берёт лид из первого абзаца, а не из подзаголовка", async () => {
    const token = await login("moderator");
    const { body } = await api("POST", "/api/articles", {
      token,
      body: {
        title: "Материал без собственного лида",
        rubric: "Инструкция",
        body: [
          { type: "heading", text: "Сразу подзаголовок" },
          { type: "paragraph", text: "А вот первый абзац материала." },
        ],
      },
    });
    assert.match(body.article.excerpt, /первый абзац/);
  });

  it("выбрасывает пустые блоки и пустые пункты", async () => {
    const token = await login("moderator");
    const { body } = await api("POST", "/api/articles", {
      token,
      body: {
        title: "Материал с пустыми блоками",
        rubric: "Инструкция",
        body: [
          { type: "paragraph", text: "Единственный содержательный абзац." },
          { type: "paragraph", text: "   " },
          { type: "list", items: ["Пункт", "", "  "] },
          { type: "steps", items: [{ title: "", text: "" }] },
        ],
      },
    });

    assert.deepEqual(body.article.body.map((b) => b.type), ["paragraph", "list"]);
    assert.deepEqual(body.article.body[1].items, ["Пункт"]);
  });

  it("не принимает материал, состоящий только из пустых блоков", async () => {
    const token = await login("moderator");
    const { status } = await api("POST", "/api/articles", {
      token,
      body: {
        title: "Совсем пустой материал",
        rubric: "Инструкция",
        body: [{ type: "paragraph", text: "" }, { type: "list", items: [""] }],
      },
    });
    assert.equal(status, 400);
  });

  it("сообщает, в каком блоке ошибка", async () => {
    const token = await login("moderator");
    const { status, body } = await api("POST", "/api/articles", {
      token,
      body: {
        title: "Материал со слишком длинным блоком",
        rubric: "Инструкция",
        body: [
          { type: "paragraph", text: "Нормальный абзац." },
          { type: "heading", text: "П".repeat(300) },
        ],
      },
    });
    assert.equal(status, 400);
    assert.match(body.details.body, /Блок 2/);
  });

  it("читает материалы старого формата как абзацы", async () => {
    const token = await login("moderator");
    // Строки вместо блоков — так тело хранилось до появления блоков.
    const { status, body } = await api("POST", "/api/articles", {
      token,
      body: {
        title: "Материал в старом формате строк",
        rubric: "Репортаж",
        body: ["Первый абзац строкой.", "Второй абзац строкой."],
      },
    });

    assert.equal(status, 201);
    assert.deepEqual(body.article.body, [
      { type: "paragraph", text: "Первый абзац строкой." },
      { type: "paragraph", text: "Второй абзац строкой." },
    ]);
  });

  it("правит отдельный блок, не трогая остальные", async () => {
    const token = await login("moderator");
    const created = await api("POST", "/api/articles", {
      token,
      body: { ...rich, title: "Материал для правки блоков" },
    });

    const next = [...created.body.article.body];
    next[5] = { type: "callout", label: "Запомните", text: "Оплата — только внутри платформы." };

    const patched = await api("PATCH", `/api/articles/${created.body.article.slug}`, {
      token,
      body: { body: next },
    });

    assert.equal(patched.body.article.body[5].label, "Запомните");
    assert.equal(patched.body.article.body[2].items.length, 3);
  });
});
