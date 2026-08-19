import { Link } from "react-router";
import { Rule } from "../components";

const STATS = [
  { v: "4.2 млн", k: "покупателей в месяц" },
  { v: "890 244", k: "активных продавца" },
  { v: "312", k: "города с доставкой" },
  { v: "24 ч", k: "средний срок продажи" },
];

const FEATURES = [
  { n: "01", t: "Витрина магазина", d: "Отдельная полоса бренда с логотипом, описанием и всеми лотами в едином оформлении каталога." },
  { n: "02", t: "Массовая загрузка", d: "Выгружайте тысячи позиций через таблицу или API — номера лотов присваиваются автоматически." },
  { n: "03", t: "Продвижение лотов", d: "Поднимайте объявления на первую полосу раздела и в ежедневную рассылку выпуска." },
  { n: "04", t: "Аналитика", d: "Просмотры, отклики и конверсия по каждому лоту в реальном времени, выгрузка отчётов." },
  { n: "05", t: "Гарантийные сделки", d: "Удержание средств до подтверждения получения и курьерская доставка Клауд по стране." },
  { n: "06", t: "Личный менеджер", d: "Выделенный специалист сопровождает крупные магазины с первого дня публикации." },
];

const PLANS = [
  { name: "Полка", price: "0", period: "бесплатно", note: "для начала", feats: ["До 50 лотов", "Базовая витрина", "Отклики покупателей", "Гарантийные сделки"], cta: "Начать бесплатно", dark: false },
  { name: "Витрина", price: "4 900", period: "₽ / мес", note: "популярный", feats: ["До 2 000 лотов", "Оформленная витрина бренда", "Продвижение 20 лотов", "Аналитика магазина", "Приоритет в поиске"], cta: "Подключить витрину", dark: true },
  { name: "Издание", price: "по запросу", period: "", note: "для сетей", feats: ["Безлимит лотов", "Загрузка через API", "Личный менеджер", "Полоса на главной", "Индивидуальные условия"], cta: "Связаться с нами", dark: false },
];

export default function Business() {
  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>Для бизнеса</span>
      </div>

      {/* HERO */}
      <section className="grid md:grid-cols-12 gap-8 items-end pt-4 pb-10">
        <div className="md:col-span-8">
          <span className="mono-label" style={{ color: "#1f232099" }}>Деловой раздел · Изд. № 417</span>
          <h1 className="font-display mt-4" style={{ fontSize: "clamp(40px,7.5vw,100px)", fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.03em" }}>
            Продавайте на <span style={{ fontStyle: "italic", fontWeight: 500 }}>полосах</span> Клауд
          </h1>
        </div>
        <div className="md:col-span-4">
          <p style={{ fontSize: 15, lineHeight: 1.65, color: "#1f2320cc", maxWidth: 340 }}>
            Разместите каталог вашего магазина в ежедневном издании частных объявлений. Миллионы покупателей, гарантийные сделки и доставка по всей стране.
          </p>
          <div className="flex gap-3 mt-6">
            <Link to="/register" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "15px 28px", textDecoration: "none" }}>Открыть магазин</Link>
            <a href="#tariffs" className="mono-label" style={{ border: "1px solid #1f2320", borderRadius: 999, padding: "15px 24px", textDecoration: "none", color: "#1f2320" }}>Тарифы</a>
          </div>
        </div>
      </section>

      {/* STATS band */}
      <div className="rule-thick" style={{ height: 3, background: "#1f2320" }} />
      <section className="grid grid-cols-2 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={s.k} className="py-8 px-2" style={{ borderRight: i < STATS.length - 1 ? "1px solid #1f232022" : "none" }}>
            <p className="font-display m-0" style={{ fontSize: "clamp(30px,4vw,52px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.v}</p>
            <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{s.k}</p>
          </div>
        ))}
      </section>
      <div style={{ height: 3, background: "#1f2320" }} />

      {/* FEATURES */}
      <section className="py-14">
        <div className="grid md:grid-cols-12 gap-8 mb-10">
          <h2 className="font-display md:col-span-6" style={{ fontSize: "clamp(28px,4vw,52px)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Всё для продаж под одной обложкой</h2>
          <p className="md:col-span-6 md:self-end" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 460 }}>
            Инструменты магазина устроены как редакция: витрина, продвижение, аналитика и доставка работают вместе, чтобы лоты находили покупателя быстрее.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 20, overflow: "hidden" }}>
          {FEATURES.map((f) => (
            <div key={f.n} className="p-7" style={{ background: "#f6f0e3" }}>
              <span className="mono-label" style={{ color: "#1f232088" }}>{f.n}</span>
              <h3 className="font-display mt-3 mb-2" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em" }}>{f.t}</h3>
              <p className="m-0" style={{ fontSize: 14, lineHeight: 1.6, color: "#1f2320cc" }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="tariffs" className="pb-14">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
          <div>
            <span className="mono-label" style={{ color: "#1f232099" }}>Подписка на издание</span>
            <h2 className="font-display mt-2" style={{ fontSize: "clamp(28px,4vw,52px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 0.95 }}>Тарифы</h2>
          </div>
          <span className="mono-label" style={{ color: "#1f232099", maxWidth: 260 }}>Без комиссии за продажу · смена тарифа в любой момент</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((p) => (
            <div key={p.name} className="flex flex-col p-7" style={{ borderRadius: 20, border: "1px solid " + (p.dark ? "#1f2320" : "#1f232022"), background: p.dark ? "#1f2320" : "#f6f0e3", color: p.dark ? "#efe8da" : "#1f2320" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-display m-0" style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{p.name}</h3>
                <span className="mono-label" style={{ color: p.dark ? "#efe8da99" : "#1f232099", border: "1px solid " + (p.dark ? "#efe8da44" : "#1f232033"), borderRadius: 999, padding: "4px 10px" }}>{p.note}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-5">
                <span className="font-display" style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>{p.price}</span>
                <span className="mono-label" style={{ color: p.dark ? "#efe8da99" : "#1f232099" }}>{p.period}</span>
              </div>
              <div style={{ height: 1, background: p.dark ? "#efe8da22" : "#1f232022", margin: "22px 0" }} />
              <ul className="flex flex-col gap-3 flex-1" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {p.feats.map((ft) => (
                  <li key={ft} className="flex items-start gap-3" style={{ fontSize: 14, lineHeight: 1.5 }}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ marginTop: 2, flexShrink: 0 }}><path d="M3 8.5l3 3 7-8" stroke={p.dark ? "#efe8da" : "#1f2320"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {ft}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="mono-label text-center mt-7" style={{ background: p.dark ? "#efe8da" : "#1f2320", color: p.dark ? "#1f2320" : "#efe8da", borderRadius: 999, padding: "16px", textDecoration: "none" }}>{p.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <Rule />

      {/* CTA */}
      <section className="py-16 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Свежий выпуск ждёт ваши лоты</span>
        <h2 className="font-display mx-auto mt-4 mb-8" style={{ fontSize: "clamp(32px,6vw,72px)", fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.03em", maxWidth: 800 }}>
          Откройте магазин на Клауд сегодня
        </h2>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to="/register" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "18px 40px", textDecoration: "none" }}>Открыть магазин</Link>
          <Link to="/new" className="mono-label" style={{ border: "1px solid #1f2320", borderRadius: 999, padding: "18px 36px", textDecoration: "none", color: "#1f2320" }}>Разместить лот</Link>
        </div>
      </section>
    </div>
  );
}
