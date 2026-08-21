import api from "./api";

/**
 * Номер лота из строки поиска.
 *
 * Человек списывает номер с карточки как угодно: «0442», «442», «Лот 442»,
 * «№ 0442», «#442». Приводим всё к виду, в котором номера лежат в базе.
 * Те же правила действуют на сервере (server/lib/listings.js).
 */
export function parseLotQuery(value: string) {
  const raw = value.trim();
  const match = /^(?:лот\s*)?(?:№|#)?\s*(\d{1,6})$/i.exec(raw);
  if (!match) return null;

  const digits = match[1].replace(/^0+(?=\d)/, "");
  return { digits, lot: digits.padStart(4, "0") };
}

/**
 * Куда вести по поисковому запросу.
 *
 * Точный номер лота открывает карточку сразу — за ней человек и пришёл.
 * Всё остальное (и несуществующий номер) уходит в каталог с поиском.
 */
export async function searchTarget(value: string): Promise<string> {
  const q = value.trim();
  if (!q) return "/catalog";

  const parsed = parseLotQuery(q);
  if (parsed) {
    try {
      const listing = await api.listingByLot(parsed.lot);
      return `/lot/${listing.id}`;
    } catch {
      // Такого номера нет — покажем обычные результаты поиска.
    }
  }

  return `/catalog?q=${encodeURIComponent(q)}`;
}
