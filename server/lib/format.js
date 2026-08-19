/** Форматирование значений в том виде, в каком их ожидает фронтенд. */

/** 28500 → "28 500" (фронтенд разбирает обратно через replace(/\s/g, "")). */
export const formatPrice = (value) =>
  String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** "Артём Волков" → "А" */
export const initialOf = (name) => (name || "?").trim().charAt(0).toUpperCase();

/** Год регистрации для подписи «На Клауд с 2025». */
export const yearOf = (iso) => String(iso || "").slice(0, 4);

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** "2026-08-14" → "14 августа 2026" */
export function formatRuDate(iso) {
  const d = new Date(`${iso}`.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Возраст лота словами: "1 ч", "вчера", "2 дн", "3 нед". */
export function humanizeAge(iso, now = Date.now()) {
  const then = new Date(`${iso}`.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).getTime();
  if (Number.isNaN(then)) return "только что";

  const min = Math.max(0, Math.floor((now - then) / 60000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} нед`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} мес`;
  return `${Math.floor(days / 365)} г`;
}

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

/** "Артём Волков" → "artem-volkov" */
export function slugify(input) {
  const base = String(input || "")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "user";
}

/** Телефон в канонический вид: 10 цифр без кода страны. */
export function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    digits = digits.slice(1);
  }
  return digits;
}

/** "9001284509" → "+7 900 128-45-09" */
export function displayPhone(digits) {
  const d = normalizePhone(digits);
  if (d.length !== 10) return d;
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

/**
 * Время сообщения в часовом поясе сервера: сегодня — "10:24",
 * иначе "Вчера" / "Пн" / "12 авг". Клиент может переформатировать из createdAt.
 */
export function messageStamp(iso, now = new Date()) {
  const d = new Date(`${iso}`.replace(" ", "T") + (String(iso).endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return "";

  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((startOf(now) - startOf(d)) / 86400000);

  if (daysAgo <= 0) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  if (daysAgo === 1) return "Вчера";
  if (daysAgo < 7) return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][d.getDay()];
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()].slice(0, 3)}`;
}
