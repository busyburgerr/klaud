import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
      <span className="mono-label" style={{ color: "#1f232099" }}>Ошибка 404</span>
      <h1 className="font-display mt-4" style={{ fontSize: "clamp(60px,14vw,180px)", fontWeight: 900, lineHeight: 0.85, letterSpacing: "-0.04em" }}>Лот изъят</h1>
      <p className="mt-5" style={{ fontSize: 16, color: "#1f2320cc" }}>Страница, которую вы искали, не значится в каталоге.</p>
      <Link to="/" className="mono-label inline-block mt-8" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "16px 40px", textDecoration: "none" }}>← На главную</Link>
    </div>
  );
}
