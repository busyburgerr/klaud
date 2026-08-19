import { all, db, get } from "./index.js";

/**
 * Дозаполнение схемы для баз, созданных предыдущими версиями.
 *
 * `schema.sql` создаёт таблицы только через CREATE TABLE IF NOT EXISTS, поэтому
 * новые колонки и изменённые CHECK-ограничения нужно применять отдельно.
 * Все шаги идемпотентны: повторный запуск ничего не ломает.
 */
export function applyMigrations() {
  addColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
  addColumn("users", "blocked_at", "TEXT");
  addColumn("users", "blocked_reason", "TEXT");
  addColumn("listings", "reject_reason", "TEXT");
  addColumn("listings", "moderated_by", "INTEGER");
  addColumn("listings", "moderated_at", "TEXT");
  addColumn("articles", "author_id", "INTEGER");
  addColumn("articles", "status", "TEXT NOT NULL DEFAULT 'published'");
  addColumn("articles", "updated_at", "TEXT");

  allowRejectedStatus();
  allowArticleLogTarget();

  // Индексы по новым колонкам — только после того, как колонки появились.
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_listings_moderated ON listings(moderated_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status, published_at DESC)");
}

const hasColumn = (table, column) =>
  all(`PRAGMA table_info(${table})`).some((c) => c.name === column);

function addColumn(table, column, ddl) {
  if (!get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", table)) return;
  if (hasColumn(table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

/**
 * В старой схеме listings.status допускал только четыре значения. Изменить
 * CHECK на месте SQLite не умеет — пересобираем таблицу с переносом данных.
 */
function allowRejectedStatus() {
  const table = get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'listings'");
  if (!table || table.sql.includes("'rejected'")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE listings_migrated (
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
        views       INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )`);

    db.exec(`
      INSERT INTO listings_migrated
        (id, lot, title, price, location, cond, description, cat, seller_id, badge,
         status, reject_reason, moderated_by, moderated_at, views, created_at, updated_at)
      SELECT id, lot, title, price, location, cond, description, cat, seller_id, badge,
             status, reject_reason, moderated_by, moderated_at, views, created_at, updated_at
        FROM listings`);

    db.exec("DROP TABLE listings");
    db.exec("ALTER TABLE listings_migrated RENAME TO listings");

    for (const sql of [
      "CREATE INDEX IF NOT EXISTS idx_listings_cat     ON listings(cat)",
      "CREATE INDEX IF NOT EXISTS idx_listings_seller  ON listings(seller_id)",
      "CREATE INDEX IF NOT EXISTS idx_listings_status  ON listings(status)",
      "CREATE INDEX IF NOT EXISTS idx_listings_price   ON listings(price)",
      "CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC)",
    ]) {
      db.exec(sql);
    }

    db.exec("COMMIT");
    console.log("[api] схема лотов обновлена: добавлен статус «отклонён»");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

/**
 * В журнал модерации добавился тип цели `article`. CHECK меняется только
 * пересборкой таблицы — данные переносим как есть.
 */
function allowArticleLogTarget() {
  const table = get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'moderation_log'");
  if (!table || table.sql.includes("'article'")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE moderation_log_migrated (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action      TEXT    NOT NULL,
        target_type TEXT    NOT NULL CHECK (target_type IN ('listing', 'user', 'report', 'article')),
        target_id   INTEGER NOT NULL,
        reason      TEXT,
        details     TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )`);

    db.exec(`
      INSERT INTO moderation_log_migrated
        (id, actor_id, action, target_type, target_id, reason, details, created_at)
      SELECT id, actor_id, action, target_type, target_id, reason, details, created_at
        FROM moderation_log`);

    db.exec("DROP TABLE moderation_log");
    db.exec("ALTER TABLE moderation_log_migrated RENAME TO moderation_log");
    db.exec("CREATE INDEX IF NOT EXISTS idx_modlog_created ON moderation_log(created_at DESC)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_modlog_target  ON moderation_log(target_type, target_id)");

    db.exec("COMMIT");
    console.log("[api] журнал модерации обновлён: добавлен тип «материал»");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
