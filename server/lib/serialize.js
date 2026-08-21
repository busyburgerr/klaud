import { normalizeBlocks } from "./blocks.js";
import { effectivePlan, planActive, PLANS } from "./plans.js";
import {
  displayPhone,
  formatPrice,
  humanizeAge,
  initialOf,
  messageStamp,
  yearOf,
} from "./format.js";

/** Публичный профиль продавца — форма, которую ждут страницы Seller/Lot. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.slug,
    userId: row.id,
    name: row.name,
    initial: initialOf(row.name),
    since: yearOf(row.created_at),
    deals: row.deals,
    // Пока отзывов нет, рейтинга тоже нет — нули в звёздах не рисуем.
    rating: Number(row.rating) > 0 ? Number(row.rating).toFixed(1) : null,
    city: row.city,
    type: row.type,
    bio: row.bio,
    online: isOnline(row.last_seen_at),
    role: row.role ?? "user",
    plan: plan(row),
  };
}

/**
 * Тариф в том виде, в каком его показывает интерфейс: подпись рядом с городом,
 * срок действия и признак «оформленная витрина доступна».
 */
export function plan(row) {
  const active = effectivePlan(row);
  const chosen = PLANS[row?.plan] ?? PLANS.shelf;
  return {
    key: active.key,
    label: active.label,
    storefront: active.storefront,
    until: row?.plan_until ?? null,
    // Тариф выбран, но срок вышел — интерфейсу нужно об этом сказать.
    expired: chosen.key !== "shelf" && !planActive(row),
  };
}

/** Оформление магазина. */
export function storefront(row, { links = [], sections = [] } = {}) {
  return {
    brand: row?.brand ?? "",
    tagline: row?.tagline ?? "",
    cover: row?.cover ?? "",
    about: row?.about ?? "",
    conditions: {
      hours: row?.hours ?? "",
      delivery: row?.delivery ?? "",
      warranty: row?.warranty ?? "",
    },
    links: links.map((l) => ({ id: l.id, network: l.network, handle: l.handle, url: l.url })),
    sections: sections.map((x) => ({ id: x.id, title: x.title, blurb: x.blurb, cat: x.cat })),
    updatedAt: row?.updated_at ?? null,
  };
}

/** Приватный профиль — только для владельца аккаунта. */
export function privateUser(row) {
  return {
    ...publicUser(row),
    phone: displayPhone(row.phone),
    phoneRaw: row.phone,
    email: row.email ?? null,
    emailVerified: !!row.email_verified,
    phoneVerified: !!row.phone_verified,
    notify: {
      deals: !!row.notify_deals,
      journal: !!row.notify_journal,
      promo: !!row.notify_promo,
    },
  };
}

export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = new Date(`${lastSeenAt}`.replace(" ", "T") + "Z").getTime();
  return Number.isFinite(t) && Date.now() - t < 5 * 60 * 1000;
}

/**
 * Лот. `row` — строка listings, дополненная полями продавца (префикс s_)
 * и агрегатами из listingSelect().
 */
export function listing(row, { images = [], wished = false } = {}) {
  if (!row) return null;
  const gallery = images.length ? images : row.img ? [row.img] : [];
  return {
    id: row.id,
    lot: row.lot,
    title: row.title,
    price: formatPrice(row.price),
    priceValue: row.price,
    location: row.location,
    cond: row.cond,
    time: humanizeAge(row.created_at),
    img: gallery[0] || "",
    images: gallery,
    badge: row.badge ?? null,
    cat: row.cat,
    status: row.status,
    rejectReason: row.reject_reason ?? null,
    moderatedAt: row.moderated_at ?? null,
    views: row.views,
    description: row.description,
    createdAt: row.created_at,
    wished,
    seller: row.s_id
      ? publicUser({
          id: row.s_id,
          slug: row.s_slug,
          name: row.s_name,
          created_at: row.s_created_at,
          deals: row.s_deals,
          rating: row.s_rating,
          city: row.s_city,
          type: row.s_type,
          bio: row.s_bio ?? "",
          last_seen_at: row.s_last_seen_at,
        })
      : null,
  };
}

export function category(row, listingCount) {
  const real = listingCount ?? row.listing_count ?? 0;
  return {
    slug: row.slug,
    n: row.n,
    label: row.label,
    // Витринное число из макета, а на рабочей базе — настоящее количество лотов.
    count: formatPrice(row.display_count || real),
    displayCount: row.display_count,
    listingCount: real,
    img: row.img,
    blurb: row.blurb,
  };
}

export function article(row) {
  let body = [];
  try {
    body = normalizeBlocks(JSON.parse(row.body));
  } catch {
    body = [];
  }
  return {
    slug: row.slug,
    rubric: row.rubric,
    title: row.title,
    excerpt: row.excerpt,
    author: row.author,
    authorId: row.author_id ?? null,
    date: row.date,
    read: row.read,
    img: row.img,
    body,
    status: row.status ?? "published",
    isDraft: (row.status ?? "published") === "draft",
    updatedAt: row.updated_at ?? null,
  };
}

export function message(row, viewerId) {
  return {
    id: row.id,
    from: row.sender_id === viewerId ? "me" : "them",
    text: row.text,
    time: messageStamp(row.created_at),
    createdAt: row.created_at,
    read: !!row.read_at,
  };
}

/** Диалог в форме страницы Messages: собеседник + карточка лота. */
export function thread(row, viewerId, messages = []) {
  const meIsBuyer = row.buyer_id === viewerId;
  const peer = meIsBuyer
    ? { id: row.seller_id, slug: row.seller_slug, name: row.seller_name, last_seen_at: row.seller_last_seen_at }
    : { id: row.buyer_id, slug: row.buyer_slug, name: row.buyer_name, last_seen_at: row.buyer_last_seen_at };

  return {
    id: String(row.id),
    peerId: peer.slug,
    name: peer.name,
    initial: initialOf(peer.name),
    online: isOnline(peer.last_seen_at),
    role: meIsBuyer ? "buyer" : "seller",
    listingId: row.listing_id,
    lot: row.lot,
    lotTitle: row.title,
    price: `${formatPrice(row.price)} ₽`,
    img: row.img || "",
    unread: row.unread ?? 0,
    updatedAt: row.updated_at,
    messages: messages.map((m) => message(m, viewerId)),
  };
}

/** Жалоба в списке модератора. */
export function report(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    listingLot: row.listing_lot,
    listingStatus: row.listing_status,
    reason: row.reason,
    comment: row.comment,
    status: row.status,
    reporter: { name: row.reporter_name, id: row.reporter_slug },
    resolvedBy: row.resolver_name ?? null,
    createdAt: row.created_at,
    age: humanizeAge(row.created_at),
  };
}

/** Строка журнала модерации. */
export function logEntry(row) {
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    details: row.details,
    actor: row.actor_name ? { name: row.actor_name, id: row.actor_slug, role: row.actor_role } : null,
    createdAt: row.created_at,
    age: humanizeAge(row.created_at),
  };
}

/** Аккаунт в панели администратора — с ролью и статусом блокировки. */
export function staffUser(row) {
  return {
    ...publicUser(row),
    phone: displayPhone(row.phone),
    listingCount: row.listing_count ?? 0,
    planKey: row.plan ?? "shelf",
    publisherId: row.publisher_id ?? null,
    editorId: row.editor_id ?? null,
    blocked: !!row.blocked_at,
    blockedReason: row.blocked_reason ?? null,
    createdAt: row.created_at,
  };
}

/** Отзыв о сделке: кто, о ком, по какому лоту и удалась ли сделка. */
export function review(row) {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    listingLot: row.listing_lot,
    rating: row.rating,
    dealSuccess: !!row.deal_success,
    text: row.text,
    author: { name: row.author_name, id: row.author_slug },
    target: { name: row.target_name, id: row.target_slug },
    createdAt: row.created_at,
    age: humanizeAge(row.created_at),
  };
}
