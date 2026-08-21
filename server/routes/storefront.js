import { Router } from "express";
import { all, get, run, tx } from "../db/index.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import { queryListings } from "../lib/listings.js";
import { effectivePlan, PLANS } from "../lib/plans.js";
import * as S from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const plansRouter = Router();
export const shopsRouter = Router();
/** Настройка витрины владельцем — монтируется в /api/profile/storefront. */
export const storefrontRouter = Router();

// ── Справочник тарифов ──

// GET /api/plans — что даёт каждый тариф (для профиля и страницы «Для бизнеса»)
plansRouter.get("/", async (_req, res) => {
  res.json({ items: Object.values(PLANS) });
});

// ── Чтение оформления ──

const linksOf = (userId) =>
  all("SELECT * FROM storefront_links WHERE user_id = ? ORDER BY position, id", userId);

const sectionsOf = (userId) =>
  all("SELECT * FROM storefront_sections WHERE user_id = ? ORDER BY position, id", userId);

/** Оформление магазина продавца: строка появляется при первом сохранении. */
export async function loadStorefront(userId) {
  const [row, links, sections] = await Promise.all([
    get("SELECT * FROM storefronts WHERE user_id = ?", userId),
    linksOf(userId),
    sectionsOf(userId),
  ]);
  return S.storefront(row, { links, sections });
}

// ── Публичная витрина ──

// GET /api/shops/:slug — магазин продавца целиком: оформление, условия, лоты
shopsRouter.get(
  "/:slug",
  wrap(async (req, res) => {
    const seller = await get("SELECT * FROM users WHERE slug = ?", req.params.slug);
    if (!seller) throw notFound("Продавец не найден");

    const plan = effectivePlan(seller);
    if (!plan.storefront) throw notFound("У продавца нет витрины");

    const saved = await loadStorefront(seller.id);
    // Продавец мог ещё не заполнить витрину — показываем профиль как есть.
    const shop = {
      ...saved,
      brand: saved.brand || seller.name,
      tagline: saved.tagline || seller.bio,
      about: saved.about || seller.bio,
    };
    const viewerId = req.user?.id ?? null;
    const page = await queryListings(
      { seller: seller.slug, limit: 100, sort: req.query.sort },
      { viewerId },
    );

    // Разделы доступны на «Издании»: лоты раскладываются по рубрикам продавца,
    // остальное уходит в общий блок в конце.
    const sections = [];
    if (plan.maxSections > 0 && shop.sections.length) {
      const used = new Set();
      for (const section of shop.sections) {
        const items = page.items.filter((l) => l.cat === section.cat);
        for (const item of items) used.add(item.id);
        // Пустой раздел на витрине выглядит как недоделка — прячем его.
        if (items.length) sections.push({ ...section, items });
      }
      const rest = page.items.filter((l) => !used.has(l.id));
      if (rest.length) {
        sections.push({ id: 0, title: "Ещё лоты", blurb: "", cat: null, items: rest });
      }
    }

    res.json({
      seller: {
        ...S.publicUser(seller),
        activeListings: page.total,
      },
      storefront: shop,
      // Без разделов витрина показывает лоты одной сеткой.
      sections,
      items: page.items,
      total: page.total,
    });
  }),
);

// ── Настройка витрины ──

storefrontRouter.use(requireAuth);

/** Тариф владельца должен позволять витрину — иначе настраивать нечего. */
function requirePlan(user) {
  const plan = effectivePlan(user);
  if (!plan.storefront) {
    throw forbidden("Витрина доступна на тарифах «Витрина» и «Издание»");
  }
  return plan;
}

// GET /api/profile/storefront — настройки витрины владельца
storefrontRouter.get(
  "/",
  wrap(async (req, res) => {
    const plan = requirePlan(req.user);
    const shop = await loadStorefront(req.user.id);

    res.json({
      storefront: {
        ...shop,
        // Пустую витрину заполняем данными профиля, чтобы предпросмотр
        // не выглядел пустым до первого сохранения.
        brand: shop.brand || req.user.name,
        tagline: shop.tagline || req.user.bio,
        about: shop.about || req.user.bio,
      },
      plan,
      categories: await all(
        `SELECT DISTINCT c.slug, c.label
           FROM listings l JOIN categories c ON c.slug = l.cat
          WHERE l.seller_id = ? AND l.status IN ('active', 'sold')
          ORDER BY c.label`,
        req.user.id,
      ),
    });
  }),
);

const trim = (value, max) => String(value ?? "").trim().slice(0, max);

// PUT /api/profile/storefront — сохранение оформления целиком
storefrontRouter.put(
  "/",
  wrap(async (req, res) => {
    const plan = requirePlan(req.user);

    const body = v(req.body)
      .str("brand", { required: true, min: 2, max: 60 })
      .str("tagline", { max: 160 })
      .str("cover", { max: 500 })
      .str("about", { max: 1200 })
      .str("hours", { max: 80 })
      .str("delivery", { max: 80 })
      .str("warranty", { max: 80 })
      .done();

    const links = Array.isArray(req.body?.links) ? req.body.links : [];
    const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];

    if (links.length > plan.maxLinks) {
      throw badRequest(`На тарифе «${plan.label}» доступно ссылок: ${plan.maxLinks}`);
    }
    if (sections.length > plan.maxSections) {
      throw badRequest(
        plan.maxSections
          ? `На тарифе «${plan.label}» доступно разделов: ${plan.maxSections}`
          : "Разделы витрины доступны на тарифе «Издание»",
      );
    }

    const cleanLinks = links.map((l, i) => ({
      network: trim(l?.network, 40),
      handle: trim(l?.handle, 60),
      url: trim(l?.url, 400),
      position: i,
    }));
    if (cleanLinks.some((l) => !l.network || !l.url)) {
      throw badRequest("У ссылки нужны соцсеть и адрес", { links: "Заполните оба поля" });
    }
    if (cleanLinks.some((l) => !/^https?:\/\//i.test(l.url))) {
      throw badRequest("Адрес ссылки должен начинаться с http:// или https://", {
        links: "Неверный адрес",
      });
    }

    const cleanSections = sections.map((x, i) => ({
      title: trim(x?.title, 60),
      blurb: trim(x?.blurb, 160),
      cat: trim(x?.cat, 40) || null,
      position: i,
    }));
    if (cleanSections.some((x) => !x.title || !x.cat)) {
      throw badRequest("У раздела нужны название и категория", {
        sections: "Заполните название и категорию",
      });
    }

    await tx(async () => {
      await run(
        `INSERT INTO storefronts (user_id, brand, tagline, cover, about, hours, delivery, warranty, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, now_utc())
         ON CONFLICT (user_id) DO UPDATE SET
           brand = EXCLUDED.brand, tagline = EXCLUDED.tagline, cover = EXCLUDED.cover,
           about = EXCLUDED.about, hours = EXCLUDED.hours, delivery = EXCLUDED.delivery,
           warranty = EXCLUDED.warranty, updated_at = now_utc()`,
        req.user.id, body.brand, body.tagline ?? "", body.cover ?? "", body.about ?? "",
        body.hours ?? "", body.delivery ?? "", body.warranty ?? "",
      );

      // Списки переписываем целиком: их правят одной формой.
      await run("DELETE FROM storefront_links WHERE user_id = ?", req.user.id);
      for (const l of cleanLinks) {
        await run(
          "INSERT INTO storefront_links (user_id, network, handle, url, position) VALUES (?, ?, ?, ?, ?)",
          req.user.id, l.network, l.handle, l.url, l.position,
        );
      }

      await run("DELETE FROM storefront_sections WHERE user_id = ?", req.user.id);
      for (const x of cleanSections) {
        await run(
          "INSERT INTO storefront_sections (user_id, title, blurb, cat, position) VALUES (?, ?, ?, ?, ?)",
          req.user.id, x.title, x.blurb, x.cat, x.position,
        );
      }
    });

    res.json({ storefront: await loadStorefront(req.user.id) });
  }),
);
