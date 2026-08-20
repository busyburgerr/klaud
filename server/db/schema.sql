-- Клауд — схема каталога частных объявлений.
-- Все временные метки хранятся в ISO-8601 (UTC).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  phone          TEXT    NOT NULL UNIQUE,
  email          TEXT,
  password_hash  TEXT    NOT NULL,
  city           TEXT    NOT NULL DEFAULT 'Москва',
  type           TEXT    NOT NULL DEFAULT 'Частное лицо',
  bio            TEXT    NOT NULL DEFAULT '',
  rating         REAL    NOT NULL DEFAULT 5.0,
  reviews_count  INTEGER NOT NULL DEFAULT 0,
  deals          INTEGER NOT NULL DEFAULT 0,
  notify_deals   INTEGER NOT NULL DEFAULT 1,
  notify_journal INTEGER NOT NULL DEFAULT 0,
  notify_promo   INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 0,
  role           TEXT    NOT NULL DEFAULT 'user'
                   CHECK (role IN ('user', 'moderator', 'admin')),
  blocked_at     TEXT,
  blocked_reason TEXT,
  last_seen_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  slug          TEXT    PRIMARY KEY,
  n             TEXT    NOT NULL,
  label         TEXT    NOT NULL,
  blurb         TEXT    NOT NULL DEFAULT '',
  img           TEXT    NOT NULL DEFAULT '',
  display_count INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lot         TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  price       INTEGER NOT NULL,
  location    TEXT    NOT NULL,
  cond        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  cat         TEXT    NOT NULL REFERENCES categories(slug) ON DELETE RESTRICT,
  seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge       TEXT,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'rejected', 'sold', 'archived')),
  reject_reason TEXT,
  moderated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  moderated_at  TEXT,
  sold_at       TEXT,
  sold_to       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  views       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listings_cat     ON listings(cat);
CREATE INDEX IF NOT EXISTS idx_listings_seller  ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_status  ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_price   ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);

CREATE TABLE IF NOT EXISTS listing_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_images_listing ON listing_images(listing_id, position);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_buyer  ON threads(buyer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_seller ON threads(seller_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS articles (
  slug         TEXT PRIMARY KEY,
  rubric       TEXT NOT NULL,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  author       TEXT NOT NULL DEFAULT 'Редакция',
  author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date         TEXT NOT NULL,
  read         TEXT NOT NULL DEFAULT '5 мин',
  img          TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'published'
                 CHECK (status IN ('draft', 'published')),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Модерация ──

-- Журнал действий модераторов и администраторов: кто, что и почему сделал.
CREATE TABLE IF NOT EXISTS moderation_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT    NOT NULL,
  target_type TEXT    NOT NULL CHECK (target_type IN ('listing', 'user', 'report', 'article')),
  target_id   INTEGER NOT NULL,
  reason      TEXT,
  details     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_modlog_created ON moderation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modlog_target  ON moderation_log(target_type, target_id);

-- Жалобы покупателей на лоты.
CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT    NOT NULL,
  comment      TEXT    NOT NULL DEFAULT '',
  status       TEXT    NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- ── Города ──

-- Справочник городов для выбора в шапке и фильтра каталога.
CREATE TABLE IF NOT EXISTS cities (
  slug     TEXT    PRIMARY KEY,
  name     TEXT    NOT NULL,
  region   TEXT    NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

-- ── Отзывы о сделках ──

-- Один отзыв на пару «лот + автор»: покупатель оценивает продавца после сделки.
CREATE TABLE IF NOT EXISTS reviews (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  deal_success INTEGER NOT NULL DEFAULT 1,
  text         TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, author_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_id, created_at DESC);

-- ── Справка ──
-- Разделы и вопросы страницы «Помощь». Контент лежит в базе, а не в вёрстке.
CREATE TABLE IF NOT EXISTS help_topics (
  slug     TEXT    PRIMARY KEY,
  n        TEXT    NOT NULL,
  title    TEXT    NOT NULL,
  blurb    TEXT    NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faq (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT    NOT NULL,
  question TEXT    NOT NULL,
  answer   TEXT    NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_faq_category ON faq(category, position);

-- ── О проекте ──
-- Принципы и вехи страницы «О проекте». `kind` разделяет два вида блоков.
CREATE TABLE IF NOT EXISTS about_blocks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  kind     TEXT    NOT NULL CHECK (kind IN ('principle', 'milestone')),
  label    TEXT    NOT NULL,
  title    TEXT    NOT NULL,
  text     TEXT    NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_about_kind ON about_blocks(kind, position);
