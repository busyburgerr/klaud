// Демо-контент каталога «Клауд».
// Источник — исходные данные фронтенда (src/data.ts).

export const CATEGORIES = [
  { slug: "auto", n: "01", label: "Автомобили", count: "142 908", img: "https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=800&fit=crop&auto=format", blurb: "Легковые, коммерческие и мототехника с проверенной историей." },
  { slug: "realty", n: "02", label: "Недвижимость", count: "98 214", img: "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&h=800&fit=crop&auto=format", blurb: "Квартиры, дома и коммерческие помещения от собственников." },
  { slug: "electronics", n: "03", label: "Электроника", count: "310 552", img: "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&h=800&fit=crop&auto=format", blurb: "Смартфоны, компьютеры и техника с гарантией состояния." },
  { slug: "fashion", n: "04", label: "Одежда и обувь", count: "204 771", img: "https://images.unsplash.com/photo-1485125639709-a60c3a500bf1?w=800&h=800&fit=crop&auto=format", blurb: "Одежда, обувь и аксессуары — новые и с историей." },
  { slug: "home", n: "05", label: "Для дома", count: "176 003", img: "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=800&h=800&fit=crop&auto=format", blurb: "Мебель, техника и предметы интерьера." },
  { slug: "jobs", n: "06", label: "Работа", count: "54 118", img: "https://images.unsplash.com/photo-1518655048521-f130df041f66?w=800&h=800&fit=crop&auto=format", blurb: "Вакансии и резюме по всем отраслям." },
  { slug: "services", n: "07", label: "Услуги", count: "89 640", img: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=800&h=800&fit=crop&auto=format", blurb: "Мастера, специалисты и сервисы рядом с вами." },
  { slug: "pets", n: "08", label: "Животные", count: "31 205", img: "https://images.unsplash.com/photo-1623387641168-d9803ddd3f35?w=800&h=800&fit=crop&auto=format", blurb: "Питомцы, товары и услуги для животных." },
  { slug: "hobby", n: "09", label: "Хобби и отдых", count: "67 889", img: "https://images.unsplash.com/photo-1541753866388-0b3c701627d3?w=800&h=800&fit=crop&auto=format", blurb: "Спорт, музыка, коллекционирование и путешествия." },
  { slug: "business", n: "10", label: "Бизнес и оборудование", count: "12 470", img: "https://images.unsplash.com/photo-1534951009808-766178b47a4f?w=800&h=800&fit=crop&auto=format", blurb: "Готовый бизнес, станки и оборудование." },
];

export const SHORTCUTS = ["Проверка истории", "Оценка стоимости", "Гарантийная сделка", "Курьерская доставка", "Сохранённые лоты", "Помощь эксперта"];

export const LISTINGS = [
  { id: 1, lot: "0417", title: "Велосипед горный Trek Marlin 7", price: "28 500", location: "Москва", cond: "Отличное", time: "1 ч", img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&h=875&fit=crop&auto=format", badge: null, cat: "hobby" },
  { id: 2, lot: "0416", title: "iPhone 15 Pro Max, 256 ГБ", price: "89 000", location: "Санкт-Петербург", cond: "Новое", time: "2 ч", img: "https://images.unsplash.com/photo-1696446701796-da61225697cc?w=700&h=875&fit=crop&auto=format", badge: "Избранный лот", cat: "electronics" },
  { id: 3, lot: "0415", title: "Самокат Xiaomi Electric Pro 2", price: "14 990", location: "Казань", cond: "Хорошее", time: "3 ч", img: "https://images.unsplash.com/photo-1630664873956-0cdf07df10fc?w=700&h=875&fit=crop&auto=format", badge: null, cat: "hobby" },
  { id: 4, lot: "0414", title: "Фотоаппарат Sony Alpha A7 III", price: "65 000", location: "Екатеринбург", cond: "Отличное", time: "5 ч", img: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=700&h=875&fit=crop&auto=format", badge: null, cat: "electronics" },
  { id: 5, lot: "0413", title: "Диван угловой IKEA Söderhamn", price: "42 000", location: "Новосибирск", cond: "Хорошее", time: "6 ч", img: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=700&h=875&fit=crop&auto=format", badge: "Срочно", cat: "home" },
  { id: 6, lot: "0412", title: "Наушники Sony WH-1000XM5", price: "22 900", location: "Москва", cond: "Новое", time: "8 ч", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&h=875&fit=crop&auto=format", badge: null, cat: "electronics" },
  { id: 7, lot: "0411", title: "Кроссовки Nike Air Max 90", price: "8 500", location: "Ростов-на-Дону", cond: "Хорошее", time: "9 ч", img: "https://images.unsplash.com/photo-1625860191460-10a66c7384fb?w=700&h=875&fit=crop&auto=format", badge: null, cat: "fashion" },
  { id: 8, lot: "0410", title: "MacBook Pro 14\" M3 Pro", price: "185 000", location: "Москва", cond: "Отличное", time: "10 ч", img: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=700&h=875&fit=crop&auto=format", badge: "Избранный лот", cat: "electronics" },
  { id: 9, lot: "0409", title: "Игровой ПК, GeForce RTX 4080", price: "134 990", location: "Уфа", cond: "Отличное", time: "вчера", img: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=700&h=875&fit=crop&auto=format", badge: null, cat: "electronics" },
  { id: 10, lot: "0408", title: "Холодильник Samsung NoFrost", price: "37 000", location: "Краснодар", cond: "Хорошее", time: "вчера", img: "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=700&h=875&fit=crop&auto=format", badge: null, cat: "home" },
  { id: 11, lot: "0407", title: "BMW 3 series, 2019, 320i", price: "2 340 000", location: "Москва", cond: "Отличное", time: "вчера", img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=700&h=875&fit=crop&auto=format", badge: "Избранный лот", cat: "auto" },
  { id: 12, lot: "0406", title: "Toyota Camry, 2021, 2.5 AT", price: "3 120 000", location: "Санкт-Петербург", cond: "Отличное", time: "2 дн", img: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=700&h=875&fit=crop&auto=format", badge: null, cat: "auto" },
  { id: 13, lot: "0405", title: "Пальто шерстяное Max Mara", price: "34 000", location: "Москва", cond: "Хорошее", time: "2 дн", img: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=700&h=875&fit=crop&auto=format", badge: null, cat: "fashion" },
  { id: 14, lot: "0404", title: "Кресло Eames Lounge, реплика", price: "58 000", location: "Казань", cond: "Отличное", time: "3 дн", img: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=700&h=875&fit=crop&auto=format", badge: null, cat: "home" },
  { id: 15, lot: "0403", title: "Гитара Fender Stratocaster", price: "72 000", location: "Екатеринбург", cond: "Хорошее", time: "3 дн", img: "https://images.unsplash.com/photo-1550985616-10810253b84d?w=700&h=875&fit=crop&auto=format", badge: null, cat: "hobby" },
];

export const FILTER_CATS = ["Все лоты", "Автомобили", "Электроника", "Недвижимость", "Одежда", "Для дома"];

export const SELLERS = [
  { id: "artem-v", name: "Артём Волков", initial: "А", since: "2024", deals: 47, rating: "4.9", city: "Москва", type: "Частное лицо", bio: "Собираю и продаю технику и вещи с историей. Всё проверяю лично перед публикацией лота. Отвечаю быстро, помогаю с доставкой по всей России." },
  { id: "marina-l", name: "Марина Лебедева", initial: "М", since: "2023", deals: 132, rating: "5.0", city: "Санкт-Петербург", type: "Магазин", bio: "Комиссионный магазин одежды и аксессуаров. Работаем с 2023 года, гарантия подлинности на каждый лот." },
  { id: "sergey-k", name: "Сергей Крылов", initial: "С", since: "2025", deals: 18, rating: "4.7", city: "Казань", type: "Частное лицо", bio: "Продаю мебель и предметы интерьера из личной коллекции. Возможен самовывоз и курьер." },
];

export const ARTICLES = [
  {
    slug: "kak-prodat-bystree",
    rubric: "Гид продавца",
    title: "Как продать лот за 24 часа: семь приёмов редакции",
    excerpt: "Фотография при дневном свете, честное описание состояния и правильная цена. Разбираем, что поднимает лот на первую полосу.",
    author: "Марина Лебедева",
    date: "14 августа 2026",
    read: "6 мин",
    img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=800&fit=crop&auto=format",
    body: [
      "Первое, что видит покупатель, — фотография. Снимайте лот при дневном свете на нейтральном фоне, без вспышки и лишних предметов в кадре. Один общий план и три-четыре детали работают лучше десяти похожих снимков.",
      "Честное описание состояния экономит время всем. Укажите год, комплектацию, следы использования и причину продажи. Лоты с подробным описанием получают на 40% больше откликов и почти не возвращаются.",
      "Цена решает. Посмотрите похожие лоты в разделе, вычтите 5–10% за скорость — и предмет уйдёт в первые сутки. Продвижение поднимет объявление на первую полосу выпуска.",
    ],
  },
  {
    slug: "vtoraya-zhizn-veshchey",
    rubric: "Репортаж",
    title: "Вторая жизнь вещей: экономика частных объявлений",
    excerpt: "Почему покупка с рук перестала быть компромиссом и превратилась в осознанный выбор миллионов.",
    author: "Сергей Крылов",
    date: "9 августа 2026",
    read: "8 мин",
    img: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&h=800&fit=crop&auto=format",
    body: [
      "За последний год каждый третий покупатель в стране хотя бы раз выбрал вещь с историей вместо новой. Это не только про экономию — это про качество, редкость и осознанное потребление.",
      "Платформы вроде Клауд превращают разрозненные объявления в устроенный каталог с проверкой и гарантией. Доверие — главная валюта этого рынка.",
    ],
  },
  {
    slug: "garantiynaya-sdelka",
    rubric: "Инструкция",
    title: "Гарантийная сделка: как это работает на Клауд",
    excerpt: "Средства удерживаются до подтверждения получения. Объясняем каждый шаг безопасной покупки.",
    author: "Редакция",
    date: "2 августа 2026",
    read: "4 мин",
    img: "https://images.unsplash.com/photo-1607863680198-23d4b2565df0?w=1200&h=800&fit=crop&auto=format",
    body: [
      "Покупатель оплачивает лот, но деньги замораживаются на счёте Клауд. Продавец отправляет предмет курьером платформы.",
      "Как только покупатель подтверждает, что всё в порядке, средства уходят продавцу. Если что-то не так — оформляется возврат без споров.",
    ],
  },
  {
    slug: "foto-kotorye-prodayut",
    rubric: "Мастерская",
    title: "Фотографии, которые продают: свет, ракурс, фон",
    excerpt: "Небольшой практикум по съёмке лотов на смартфон — без студии и дорогой техники.",
    author: "Артём Волков",
    date: "28 июля 2026",
    read: "5 мин",
    img: "https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?w=1200&h=800&fit=crop&auto=format",
    body: [
      "Свет — это 80% результата. Снимайте у окна в первой половине дня, избегайте прямого солнца и жёлтых ламп.",
      "Ставьте предмет на однотонную поверхность, оставляйте воздух вокруг кадра и держите телефон на уровне лота, а не сверху.",
    ],
  },
  {
    slug: "trendy-vtorichki",
    rubric: "Тренды",
    title: "Что покупают в 2026: тренды вторичного рынка",
    excerpt: "Винтажная электроника, дизайнерская мебель и велосипеды возглавили спрос этого лета.",
    author: "Марина Лебедева",
    date: "21 июля 2026",
    read: "7 мин",
    img: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1200&h=800&fit=crop&auto=format",
    body: [
      "Спрос сместился в сторону долговечных вещей: механические часы, плёночные камеры, добротная мебель середины века.",
      "Электротранспорт и техника Apple по-прежнему уходят за часы, особенно с гарантийной сделкой и доставкой.",
    ],
  },
];

