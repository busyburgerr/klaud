/**
 * Тарифы продавца.
 *
 * «Полка» — то, как площадка работала всегда: обычная страница продавца.
 * «Витрина» добавляет оформленный магазин: обложка, бренд, слоган, условия
 * и ссылки на соцсети. «Издание» — то же плюс разделы витрины, чтобы лоты
 * лежали по своим рубрикам, а не одной сеткой.
 *
 * Оплата не подключена: тариф назначает администратор в панели.
 */

export const PLANS = {
  shelf: {
    key: "shelf",
    label: "Полка",
    blurb: "Обычная страница продавца и лоты в общем каталоге.",
    storefront: false,
    publisher: false,
    maxLinks: 0,
    maxSections: 0,
    maxPicks: 0,
    maxShops: 0,
    features: [
      "Лоты в каталоге и поиске",
      "Страница продавца с отзывами",
      "Диалоги с покупателями",
    ],
  },
  storefront: {
    key: "storefront",
    label: "Витрина",
    blurb: "Магазин оформлен как полоса бренда: обложка, слоган, условия.",
    storefront: true,
    publisher: false,
    maxLinks: 3,
    maxSections: 0,
    maxPicks: 0,
    maxShops: 0,
    features: [
      "Обложка, название бренда и слоган",
      "Блок «О магазине» и условия работы",
      "До трёх ссылок на соцсети",
    ],
  },
  edition: {
    key: "edition",
    label: "Издание",
    blurb: "Витрина с собственными разделами — как рубрики в выпуске.",
    storefront: true,
    // Издательский дом: витрины под одной обложкой и полоса на главной.
    publisher: true,
    maxLinks: 6,
    maxSections: 6,
    maxPicks: 6,
    // Витрины под обложкой, не считая витрины самого издателя.
    maxShops: 6,
    features: [
      "Всё, что входит в «Витрину»",
      "До шести разделов витрины со своими названиями",
      "Несколько витрин под одной обложкой издания",
      "Своя полоса «Выбор издания» на главной",
      "Кабинет издателя: показатели и массовая загрузка каталога",
    ],
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

/** Срок действия ещё не истёк? Пустой срок — бессрочно. */
export function planActive(row) {
  if (!row?.plan_until) return true;
  const until = new Date(`${row.plan_until}`.replace(" ", "T") + "Z").getTime();
  return !Number.isFinite(until) || until > Date.now();
}

/**
 * Тариф, который действует прямо сейчас. Просроченный платный тариф
 * молча превращается в «Полку» — данные витрины при этом сохраняются.
 */
export function effectivePlan(row) {
  const plan = PLANS[row?.plan] ?? PLANS.shelf;
  return planActive(row) ? plan : PLANS.shelf;
}

/** Есть ли у продавца право на оформленную витрину. */
export const hasStorefront = (row) => effectivePlan(row).storefront;

/** Право вести издательский дом: полоса на главной и витрины под обложкой. */
export const isPublisher = (row) => effectivePlan(row).publisher;
