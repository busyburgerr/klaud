/**
 * Клиент REST API «Клауд» (server/).
 *
 * Все пути относительные: в dev-режиме Vite проксирует /api и /uploads на
 * Express (см. vite.config.ts), в проде тот же Express раздаёт и статику.
 *
 * Токен хранится в localStorage и дублируется httpOnly-cookie — при отключённом
 * localStorage сессия продолжает работать на cookie.
 */

export type Listing = {
  id: number;
  lot: string;
  title: string;
  /** Цена, отформатированная под вёрстку: "28 500". */
  price: string;
  priceValue: number;
  location: string;
  cond: string;
  /** Возраст лота словами: "1 ч", "вчера", "2 дн". */
  time: string;
  img: string;
  images: string[];
  badge: string | null;
  cat: string;
  status: "pending" | "active" | "rejected" | "sold" | "archived";
  rejectReason: string | null;
  moderatedAt: string | null;
  views: number;
  description: string;
  createdAt: string;
  wished: boolean;
  seller: Seller | null;
};

export type Role = "user" | "moderator" | "admin";

export type Seller = {
  id: string;
  userId: number;
  name: string;
  initial: string;
  since: string;
  deals: number;
  rating: string | null;
  city: string;
  type: string;
  bio: string;
  online: boolean;
  role: Role;
};

/** Аккаунт в панели администратора. */
export type StaffUser = Seller & {
  phone: string;
  listingCount: number;
  blocked: boolean;
  blockedReason: string | null;
  createdAt: string;
};

export type Report = {
  id: number;
  listingId: number;
  listingTitle: string;
  listingLot: string;
  listingStatus: string;
  reason: string;
  comment: string;
  status: "open" | "resolved" | "dismissed";
  reporter: { name: string; id: string };
  resolvedBy: string | null;
  createdAt: string;
  age: string;
};

export type LogEntry = {
  id: number;
  action: string;
  targetType: "listing" | "user" | "report" | "article";
  targetId: number;
  reason: string | null;
  details: string | null;
  actor: { name: string; id: string; role: Role } | null;
  createdAt: string;
  age: string;
};

export type Profile = Seller & {
  phone: string;
  phoneRaw: string;
  email: string | null;
  emailVerified: boolean;
  notify: { deals: boolean; journal: boolean; promo: boolean };
};

export type City = { slug: string; name: string; region: string; listingCount: number };

/** Отзыв о сделке. */
export type Review = {
  id: number;
  listingId: number;
  listingTitle: string;
  listingLot: string;
  rating: number;
  dealSuccess: boolean;
  text: string;
  author: { name: string; id: string };
  target: { name: string; id: string };
  createdAt: string;
  age: string;
};

export type ReviewSummary = {
  total: number;
  rating: string | null;
  successful: number;
  failed: number;
  breakdown: { star: number; count: number }[];
};

/** Сделка, по которой покупатель ещё не оставил отзыв. */
export type PendingReview = {
  listingId: number;
  lot: string;
  title: string;
  img: string;
  seller: { name: string; id: string };
  soldAt: string;
};

/** Витринные показатели площадки — считаются из базы. */
export type SiteMetrics = {
  activeListings: number;
  sellers: number;
  buyers: number;
  cities: number;
  sold: number;
  sellTime: string | null;
  reviews: number;
  rating: string | null;
};

export type PeriodStats = {
  period: string;
  label: string;
  listingsCreated: number;
  listingsSold: number;
  revenue: number;
  usersJoined: number;
  reviews: number;
};

/** Полная статистика проекта для администратора. */
export type ProjectStats = {
  listings: { total: number; active: number; pending: number; rejected: number; sold: number; archived: number; views: number };
  sales: { count: number; revenue: number; averagePrice: number; averageDays: number; conversion: number };
  users: { total: number; moderators: number; admins: number; blocked: number; withEmail: number; sellers: number };
  content: { articles: number; drafts: number; reviews: number; openReports: number; messages: number };
  periods: PeriodStats[];
  trend: { month: string; created: number; sold: number; revenue: number }[];
  periodKeys: { key: string; label: string }[];
};

/** Содержимое страницы «О проекте». */
export type AboutPage = {
  project: { since: string; title: string; lead: string };
  principles: { n: string; title: string; text: string }[];
  milestones: { period: string; title: string; text: string }[];
  team: { id: string; name: string; initial: string; role: string; bio: string }[];
  metrics: SiteMetrics;
};

/** Содержимое страницы «Помощь». */
export type HelpTopic = { slug: string; n: string; title: string; blurb: string };
export type FaqItem = { id: number; category: string; question: string; answer: string };
export type Support = { email: string; phone: string; hours: string; responseTime: string };

export type Category = {
  slug: string;
  n: string;
  label: string;
  count: string;
  displayCount: number;
  listingCount: number;
  img: string;
  blurb: string;
};

/**
 * Тело материала журнала. Старые материалы приходят с сервера уже
 * приведёнными к абзацам, поэтому обрабатывать строки на клиенте не нужно.
 */
export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "callout"; label: string; text: string };

export type BlockType = ArticleBlock["type"];

export type Article = {
  slug: string;
  rubric: string;
  title: string;
  excerpt: string;
  author: string;
  authorId: number | null;
  date: string;
  read: string;
  img: string;
  body: ArticleBlock[];
  status: "draft" | "published";
  isDraft: boolean;
  updatedAt: string | null;
};

/** Черновик материала в редакторе журнала. */
export type ArticleDraft = {
  title: string;
  rubric: string;
  excerpt?: string;
  img?: string;
  author?: string;
  body: ArticleBlock[];
  status?: "draft" | "published";
};

export type Message = {
  id: number;
  from: "me" | "them";
  text: string;
  time: string;
  createdAt: string;
  read: boolean;
};

export type Thread = {
  id: string;
  peerId: string;
  name: string;
  initial: string;
  online: boolean;
  role: "buyer" | "seller";
  listingId: number;
  lot: string;
  lotTitle: string;
  price: string;
  img: string;
  unread: number;
  updatedAt: string;
  messages: Message[];
};

export type Page<T> = { items: T[]; total: number; page: number; limit: number; pages: number };

export type CatalogQuery = {
  cat?: string;
  q?: string;
  cond?: string | string[];
  minPrice?: number | string;
  maxPrice?: number | string;
  location?: string;
  sort?: string;
  status?: string;
  page?: number;
  limit?: number;
};

/** Ошибка API: несёт HTTP-статус и разбор по полям формы. */
export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;

  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = "cloud.token";

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set token(value: string | null) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  },
};

/** Пауза между повторами при обрыве связи. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  // Чтение можно безопасно повторить: обрыв связи на пути к серверу
  // не означает, что запрос выполнился.
  const attempts = method === "GET" ? 3 : 1;

  let res: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      res = await fetch(`/api${path}`, {
        method,
        credentials: "include",
        headers: {
          ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
          ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        },
        body: isForm ? body : body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch {
      // fetch падает только при обрыве соединения: сервер недоступен,
      // перезапускается или пропала сеть.
      if (attempt === attempts) {
        throw new ApiError(0, "Нет связи с сервером. Проверьте, запущен ли API, и повторите.");
      }
      await sleep(attempt * 400);
    }
  }

  const text = await res!.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Не JSON — обычно это страница ошибки от прокси или обратного прокси.
    throw new ApiError(res!.status, `Сервер вернул неожиданный ответ (${res!.status})`);
  }

  if (!res!.ok) throw new ApiError(res!.status, data?.error ?? res!.statusText, data?.details);
  return data as T;
}

const qs = (query: Record<string, unknown> = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
};

export const api = {
  // ── Каталог ──
  categories: () => request<{ items: Category[] }>("GET", "/categories").then((r) => r.items),
  category: (slug: string) =>
    request<{ category: Category }>("GET", `/categories/${slug}`).then((r) => r.category),

  listings: (query: CatalogQuery = {}) => request<Page<Listing>>("GET", `/listings${qs(query)}`),
  listing: (id: number | string) =>
    request<{ listing: Listing }>("GET", `/listings/${id}`).then((r) => r.listing),
  related: (id: number | string, limit = 4) =>
    request<{ items: Listing[] }>("GET", `/listings/${id}/related${qs({ limit })}`).then((r) => r.items),
  filters: () => request<{ conditions: string[]; locations: string[]; sorts: { key: string; label: string }[] }>(
    "GET",
    "/listings/meta/filters",
  ),

  seller: (slug: string) =>
    request<{ seller: Seller & { activeListings: number } }>("GET", `/sellers/${slug}`).then((r) => r.seller),
  sellerListings: (slug: string, query: CatalogQuery = {}) =>
    request<Page<Listing>>("GET", `/sellers/${slug}/listings${qs(query)}`),

  articles: (query: { rubric?: string; status?: string } = {}) =>
    request<{
      items: Article[];
      rubrics: string[];
      suggestedRubrics: string[];
      canEdit: boolean;
      drafts: number;
    }>("GET", `/articles${qs(query)}`),
  article: (slug: string) =>
    request<{ article: Article; more: Article[]; canEdit: boolean }>("GET", `/articles/${slug}`),

  /** Редакция журнала: доступно ролям moderator и admin. */
  createArticle: (input: ArticleDraft) =>
    request<{ article: Article }>("POST", "/articles", input).then((r) => r.article),
  updateArticle: (slug: string, input: Partial<ArticleDraft>) =>
    request<{ article: Article }>("PATCH", `/articles/${slug}`, input).then((r) => r.article),
  deleteArticle: (slug: string) => request<{ ok: true }>("DELETE", `/articles/${slug}`),

  cities: () => request<{ items: City[] }>("GET", "/cities").then((r) => r.items),
  about: () => request<AboutPage>("GET", "/about"),
  help: () =>
    request<{ topics: HelpTopic[]; questions: FaqItem[]; categories: string[]; support: Support }>("GET", "/help"),
  metrics: () => request<{ metrics: SiteMetrics }>("GET", "/meta/metrics").then((r) => r.metrics),

  meta: () =>
    request<{
      issue: string;
      stats: { listings: number; sellers: number; listingsLabel: string; sellersLabel: string };
      marquee: string[];
      shortcuts: string[];
      filterCats: string[];
    }>("GET", "/meta"),

  // ── Аккаунт ──
  register: async (input: { name: string; phone: string; password: string; agree: boolean; city?: string }) => {
    const res = await request<{ token: string; user: Profile }>("POST", "/auth/register", input);
    auth.token = res.token;
    return res.user;
  },
  login: async (input: { phone: string; password: string }) => {
    const res = await request<{ token: string; user: Profile }>("POST", "/auth/login", input);
    auth.token = res.token;
    return res.user;
  },
  logout: async () => {
    await request("POST", "/auth/logout");
    auth.token = null;
  },
  me: () => request<{ user: Profile }>("GET", "/auth/me").then((r) => r.user),

  profile: () => request<{ user: Profile }>("GET", "/profile").then((r) => r.user),
  profileStats: () =>
    request<{
      listings: { total: number; active: number; pending: number; sold: number; views: number };
      saved: number;
      unreadMessages: number;
      deals: number;
      rating: string;
    }>("GET", "/profile/stats"),
  myListings: (query: CatalogQuery = {}) => request<Page<Listing>>("GET", `/profile/listings${qs(query)}`),
  updateProfile: (input: {
    name?: string;
    phone?: string;
    city?: string;
    bio?: string;
    email?: string;
    notify?: Partial<{ deals: boolean; journal: boolean; promo: boolean }>;
  }) => request<{ user: Profile }>("PATCH", "/profile", input).then((r) => r.user),
  changePassword: (input: { current: string; next: string }) =>
    request<{ ok: true }>("POST", "/profile/password", input),

  // ── Лоты пользователя ──
  createListing: (input: {
    title: string;
    price: number;
    cat: string;
    cond: string;
    description?: string;
    location?: string;
    images?: string[];
  }) => request<{ listing: Listing }>("POST", "/listings", input).then((r) => r.listing),
  updateListing: (id: number, input: Partial<{ title: string; price: number; cat: string; cond: string; description: string; location: string; status: string; images: string[] }>) =>
    request<{ listing: Listing }>("PATCH", `/listings/${id}`, input).then((r) => r.listing),
  deleteListing: (id: number) => request<{ ok: true }>("DELETE", `/listings/${id}`),
  /** Покупатели, писавшие по лоту — из них выбирается получатель при продаже. */
  listingBuyers: (id: number) =>
    request<{ items: { userId: number; name: string; id: string }[] }>("GET", `/listings/${id}/buyers`).then((r) => r.items),
  /** Отметить лот проданным; покупатель нужен, чтобы он смог оставить отзыв. */
  sellListing: (id: number, buyerId?: number) =>
    request<{ listing: Listing }>("POST", `/listings/${id}/sell`, { buyerId }).then((r) => r.listing),

  // ── Отзывы ──
  userReviews: (slug: string) =>
    request<{ items: Review[]; summary: ReviewSummary }>("GET", `/reviews/user/${slug}`),
  listingReviews: (id: number) =>
    request<{ items: Review[] }>("GET", `/reviews/listing/${id}`).then((r) => r.items),
  pendingReviews: () =>
    request<{ items: PendingReview[] }>("GET", "/reviews/pending").then((r) => r.items),
  leaveReview: (input: { listingId: number; rating: number; dealSuccess: boolean; text?: string }) =>
    request<{ review: Review }>("POST", "/reviews", input).then((r) => r.review),
  deleteReview: (id: number) => request<{ ok: true }>("DELETE", `/reviews/${id}`),

  /** Отправить отклонённый или снятый лот на повторную проверку. */
  resubmitListing: (id: number) =>
    request<{ listing: Listing }>("POST", `/listings/${id}/resubmit`).then((r) => r.listing),

  reportReasons: () =>
    request<{ reasons: string[] }>("GET", "/listings/meta/report-reasons").then((r) => r.reasons),
  reportListing: (id: number, input: { reason: string; comment?: string }) =>
    request<{ ok: true }>("POST", `/listings/${id}/report`, input),

  /** Загрузка фотографий лота: до 10 файлов по 5 МБ. Возвращает пути для createListing. */
  uploadImages: (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("images", file);
    return request<{ urls: string[] }>("POST", "/uploads", form).then((r) => r.urls);
  },

  // ── Избранное ──
  favorites: () => request<Page<Listing>>("GET", "/favorites"),
  favoriteIds: () => request<{ ids: number[] }>("GET", "/favorites/ids").then((r) => r.ids),
  toggleFavorite: (listingId: number) =>
    request<{ wished: boolean; listingId: number }>("POST", `/favorites/${listingId}/toggle`),

  // ── Сообщения ──
  threads: () => request<{ items: Thread[]; unread: number }>("GET", "/threads"),
  thread: (id: string | number) => request<{ thread: Thread }>("GET", `/threads/${id}`).then((r) => r.thread),
  startThread: (listingId: number, text?: string) =>
    request<{ thread: Thread }>("POST", "/threads", { listingId, text }).then((r) => r.thread),
  sendMessage: (threadId: string | number, text: string) =>
    request<{ message: Message }>("POST", `/threads/${threadId}/messages`, { text }).then((r) => r.message),
  newMessages: (threadId: string | number, afterId: number) =>
    request<{ items: Message[] }>("GET", `/threads/${threadId}/messages${qs({ after: afterId })}`).then((r) => r.items),
};

/** Модерация: доступна ролям moderator и admin. */
export const moderation = {
  stats: () =>
    request<{ pending: number; rejected: number; active: number; openReports: number; today: number }>(
      "GET",
      "/moderation/stats",
    ),
  queue: (status = "pending", query: { page?: number; limit?: number } = {}) =>
    request<Page<Listing>>("GET", `/moderation/queue${qs({ status, ...query })}`),
  approve: (id: number) =>
    request<{ listing: Listing }>("POST", `/moderation/listings/${id}/approve`).then((r) => r.listing),
  reject: (id: number, reason: string) =>
    request<{ listing: Listing }>("POST", `/moderation/listings/${id}/reject`, { reason }).then((r) => r.listing),
  archive: (id: number, reason?: string) =>
    request<{ listing: Listing }>("POST", `/moderation/listings/${id}/archive`, { reason }).then((r) => r.listing),
  reports: (status = "open") =>
    request<{ items: Report[]; reasons: string[] }>("GET", `/moderation/reports${qs({ status })}`),
  resolveReport: (id: number, status: "resolved" | "dismissed", comment?: string) =>
    request<{ ok: true }>("POST", `/moderation/reports/${id}/resolve`, { status, comment }),
  log: (query: { page?: number; limit?: number } = {}) =>
    request<Page<LogEntry>>("GET", `/moderation/log${qs(query)}`),
};

/** Администрирование: только роль admin. */
export const admin = {
  stats: () =>
    request<{ users: number; admins: number; moderators: number; blocked: number }>("GET", "/admin/stats"),
  overview: () => request<ProjectStats>("GET", "/admin/overview"),
  period: (period: string) =>
    request<{ stats: PeriodStats }>("GET", `/admin/overview/${period}`).then((r) => r.stats),
  users: (query: { q?: string; role?: string } = {}) =>
    request<{ items: StaffUser[]; roles: Role[] }>("GET", `/admin/users${qs(query)}`),
  setRole: (userId: number, role: Role) =>
    request<{ user: StaffUser }>("PATCH", `/admin/users/${userId}/role`, { role }).then((r) => r.user),
  block: (userId: number, reason: string) =>
    request<{ user: StaffUser }>("POST", `/admin/users/${userId}/block`, { reason }).then((r) => r.user),
  unblock: (userId: number) =>
    request<{ user: StaffUser }>("POST", `/admin/users/${userId}/unblock`).then((r) => r.user),
};

export default api;
