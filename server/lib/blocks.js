import { badRequest } from "./http.js";

/**
 * Тело материала журнала — массив блоков.
 *
 *   { type: "paragraph", text }
 *   { type: "heading",   text }                      подзаголовок раздела
 *   { type: "list",      items: [text] }             маркированный список
 *   { type: "steps",     items: [{ title, text }] }  нумерованные шаги 01, 02…
 *   { type: "callout",   label, text }               тёмная врезка
 *
 * Ранние материалы хранились как массив строк — такой формат читается как
 * последовательность абзацев, поэтому старые записи не требуют миграции.
 */
export const BLOCK_TYPES = ["paragraph", "heading", "list", "steps", "callout"];

const LIMITS = {
  text: 4000,
  heading: 200,
  label: 40,
  item: 1000,
  stepTitle: 200,
  items: 20,
  blocks: 80,
};

const str = (value) => (typeof value === "string" ? value.trim() : "");

/** Приводит сохранённое тело к массиву блоков (включая старый формат строк). */
export function normalizeBlocks(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((block) => {
      if (typeof block === "string") {
        const text = block.trim();
        return text ? { type: "paragraph", text } : null;
      }
      if (!block || typeof block !== "object") return null;

      switch (block.type) {
        case "heading": {
          const text = str(block.text);
          return text ? { type: "heading", text } : null;
        }
        case "list": {
          const items = (Array.isArray(block.items) ? block.items : []).map(str).filter(Boolean);
          return items.length ? { type: "list", items } : null;
        }
        case "steps": {
          const items = (Array.isArray(block.items) ? block.items : [])
            .map((s) => ({ title: str(s?.title), text: str(s?.text) }))
            .filter((s) => s.title || s.text);
          return items.length ? { type: "steps", items } : null;
        }
        case "callout": {
          const text = str(block.text);
          return text ? { type: "callout", label: str(block.label) || "Важно", text } : null;
        }
        default: {
          const text = str(block.text);
          return text ? { type: "paragraph", text } : null;
        }
      }
    })
    .filter(Boolean);
}

/**
 * Разбирает тело из запроса. Возвращает готовые блоки либо бросает 400
 * с указанием, в каком блоке ошибка.
 */
export function parseBlocks(raw) {
  if (!Array.isArray(raw)) throw badRequest("Тело материала должно быть массивом блоков", { body: "Ожидается массив" });
  if (raw.length > LIMITS.blocks) throw badRequest(`Не больше ${LIMITS.blocks} блоков в материале`, { body: "Слишком длинный материал" });

  const fail = (index, message) => {
    throw badRequest(message, { body: `Блок ${index + 1}: ${message}` });
  };

  const blocks = raw.map((block, i) => {
    if (typeof block === "string") {
      const text = block.trim();
      if (text.length > LIMITS.text) fail(i, `Абзац длиннее ${LIMITS.text} символов`);
      return text ? { type: "paragraph", text } : null;
    }

    if (!block || typeof block !== "object") fail(i, "Ожидается блок материала");

    const type = BLOCK_TYPES.includes(block.type) ? block.type : "paragraph";

    if (type === "list" || type === "steps") {
      const items = Array.isArray(block.items) ? block.items : [];
      if (items.length > LIMITS.items) fail(i, `Не больше ${LIMITS.items} пунктов в списке`);

      if (type === "list") {
        const clean = items.map(str).filter(Boolean);
        if (clean.some((t) => t.length > LIMITS.item)) fail(i, `Пункт длиннее ${LIMITS.item} символов`);
        return clean.length ? { type, items: clean } : null;
      }

      const clean = items
        .map((s) => ({ title: str(s?.title), text: str(s?.text) }))
        .filter((s) => s.title || s.text);
      if (clean.some((s) => s.title.length > LIMITS.stepTitle || s.text.length > LIMITS.item)) {
        fail(i, "Слишком длинный шаг");
      }
      return clean.length ? { type, items: clean } : null;
    }

    const text = str(block.text);
    if (type === "heading" && text.length > LIMITS.heading) fail(i, `Подзаголовок длиннее ${LIMITS.heading} символов`);
    if (text.length > LIMITS.text) fail(i, `Текст длиннее ${LIMITS.text} символов`);
    if (!text) return null;

    if (type === "callout") {
      const label = str(block.label).slice(0, LIMITS.label);
      return { type, label: label || "Важно", text };
    }
    return { type, text };
  });

  return blocks.filter(Boolean);
}

/** Весь текст материала одной строкой — для подсчёта времени чтения. */
export function blocksText(blocks) {
  return blocks
    .map((b) => {
      if (b.type === "list") return b.items.join(" ");
      if (b.type === "steps") return b.items.map((s) => `${s.title} ${s.text}`).join(" ");
      return `${b.label ?? ""} ${b.text ?? ""}`;
    })
    .join(" ")
    .trim();
}

/** Первый абзац — из него получается лид, если автор его не заполнил. */
export function firstParagraph(blocks) {
  return blocks.find((b) => b.type === "paragraph")?.text ?? blocksText(blocks);
}
