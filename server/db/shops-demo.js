import { run } from "./index.js";

/**
 * Выдаёт демо-продавцу платный тариф и заполняет витрину.
 *
 * Используется сидами, чтобы в базе сразу был пример оформленного магазина —
 * иначе тарифы не на чем посмотреть.
 */
export async function giveShop(userId, { plan = "storefront", months = 12, shop, links = [], sections = [] }) {
  await run(
    `UPDATE users SET plan = ?, plan_until = now_utc() + ?::int * interval '1 month' WHERE id = ?`,
    plan, months, userId,
  );

  await run(
    `INSERT INTO storefronts (user_id, brand, tagline, cover, about, hours, delivery, warranty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       brand = EXCLUDED.brand, tagline = EXCLUDED.tagline, cover = EXCLUDED.cover,
       about = EXCLUDED.about, hours = EXCLUDED.hours, delivery = EXCLUDED.delivery,
       warranty = EXCLUDED.warranty`,
    userId, shop.brand, shop.tagline, shop.cover, shop.about,
    shop.hours, shop.delivery, shop.warranty,
  );

  await run("DELETE FROM storefront_links WHERE user_id = ?", userId);
  for (const [i, link] of links.entries()) {
    await run(
      "INSERT INTO storefront_links (user_id, network, handle, url, position) VALUES (?, ?, ?, ?, ?)",
      userId, link.network, link.handle, link.url, i,
    );
  }

  await run("DELETE FROM storefront_sections WHERE user_id = ?", userId);
  for (const [i, section] of sections.entries()) {
    await run(
      "INSERT INTO storefront_sections (user_id, title, blurb, cat, position) VALUES (?, ?, ?, ?, ?)",
      userId, section.title, section.blurb, section.cat, i,
    );
  }
}
