import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { all, get } from "../db/index.js";
import { formatPrice } from "../lib/format.js";
import { badRequest } from "../lib/http.js";
import { queryListings } from "../lib/listings.js";
import { publicMetrics } from "../lib/stats.js";
import { requireAuth } from "../middleware/auth.js";

export const metaRouter = Router();
export const citiesRouter = Router();
export const uploadsRouter = Router();

/** Подписи «быстрых ссылок» и вкладок с главной страницы. */
const SHORTCUTS = [
  "Проверка истории", "Оценка стоимости", "Гарантийная сделка",
  "Курьерская доставка", "Сохранённые лоты", "Помощь эксперта",
];

const FILTER_CATS = ["Все лоты", "Автомобили", "Электроника", "Недвижимость", "Одежда", "Для дома"];

// GET /api/meta — счётчики бегущей строки и статические подписи интерфейса
metaRouter.get("/", async (_req, res) => {
  const listings = (await get("SELECT COUNT(*) AS c FROM listings WHERE status = 'active'")).c;
  const sellers = (await get("SELECT COUNT(*) AS c FROM users")).c;
  // display_count — декоративные числа из макета. В демо-базе они заданы, в
  // очищенной равны нулю, и тогда витрина показывает только настоящие цифры.
  const display = (await get("SELECT COALESCE(SUM(display_count), 0) AS c FROM categories")).c;
  const totalListings = display + listings;

  res.json({
    issue: "417",
    stats: {
      listings,
      sellers,
      listingsLabel: formatPrice(totalListings),
      sellersLabel: formatPrice(sellers),
    },
    shortcuts: SHORTCUTS,
    filterCats: FILTER_CATS,
    marquee: [
      totalListings > 0 ? `${formatPrice(totalListings)} лотов в каталоге` : "Каталог открыт для первых лотов",
      "Проверенные продавцы",
      "Гарантийная сделка",
      "Курьер по всей России",
      "Оценка за 2 минуты",
      "Каждый лот проходит проверку",
    ],
  });
});

// GET /api/meta/metrics — витринные показатели площадки, все из базы
metaRouter.get("/metrics", async (_req, res) => {
  res.json({ metrics: await publicMetrics() });
});

// GET /api/meta/home — всё, что нужно главной странице, одним запросом
metaRouter.get("/home", async (req, res) => {
  const featured = await queryListings({ limit: 8 }, { viewerId: req.user?.id });
  res.json({ featured: featured.items, shortcuts: SHORTCUTS, filterCats: FILTER_CATS });
});

// ── Загрузка фотографий лота ──

fs.mkdirSync(config.uploadsDir, { recursive: true });

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || ".jpg";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(badRequest("Допустимы только изображения"));
    cb(null, true);
  },
});

// POST /api/uploads — multipart-поле `images`, до 10 файлов по 5 МБ
uploadsRouter.post("/", requireAuth, upload.array("images", 10), async (req, res) => {
  const files = req.files || [];
  if (!files.length) throw badRequest("Не передано ни одного файла");
  res.status(201).json({ urls: files.map((f) => `/uploads/${f.filename}`) });
});

// ── Города ──

// GET /api/cities — справочник для выбора города в шапке
citiesRouter.get("/", async (_req, res) => {
  const rows = await all(`
    SELECT c.*,
           (SELECT COUNT(*) FROM listings l
             WHERE l.location = c.name AND l.status = 'active') AS listing_count
      FROM cities c
     ORDER BY c.position, c.name`);

  res.json({
    items: rows.map((c) => ({
      slug: c.slug,
      name: c.name,
      region: c.region,
      listingCount: c.listing_count,
    })),
  });
});
