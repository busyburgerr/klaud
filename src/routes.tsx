import { createBrowserRouter, Outlet } from "react-router";
import Layout from "./Layout";
import { AuthProvider, RequireAuth, RequireRole } from "./auth";
import { WishProvider } from "./store";
import { CityProvider } from "./city";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import Lot from "./pages/Lot";
import NewLot from "./pages/NewLot";
import Seller from "./pages/Seller";
import Business from "./pages/Business";
import Help from "./pages/Help";
import About from "./pages/About";
import Journal from "./pages/Journal";
import Article from "./pages/Article";
import ArticleEditor from "./pages/ArticleEditor";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import Moderation from "./pages/Moderation";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

/** Провайдеры внутри роутера: им нужны навигация и текущий адрес. */
function Providers() {
  return (
    <AuthProvider>
      <CityProvider>
        <WishProvider>
          <Outlet />
        </WishProvider>
      </CityProvider>
    </AuthProvider>
  );
}

/** Маршруты личного кабинета, сообщений и подачи лота закрыты от гостей. */
const guarded = (element: React.ReactElement) => <RequireAuth>{element}</RequireAuth>;

export const router = createBrowserRouter([
  {
    Component: Providers,
    children: [
      { path: "/login", element: <Auth mode="login" /> },
      { path: "/register", element: <Auth mode="register" /> },
      {
        path: "/",
        Component: Layout,
        children: [
          { index: true, Component: Home },
          { path: "catalog", Component: Catalog },
          { path: "category/:slug", Component: Catalog },
          { path: "lot/:id", Component: Lot },
          { path: "seller/:id", Component: Seller },
          { path: "business", Component: Business },
          { path: "help", Component: Help },
          { path: "about", Component: About },
          { path: "journal", Component: Journal },
          // Создание и правка — до маршрута со :slug, иначе «new» примут за адрес материала.
          {
            path: "journal/new",
            element: (
              <RequireRole role="moderator">
                <ArticleEditor />
              </RequireRole>
            ),
          },
          {
            path: "journal/:slug/edit",
            element: (
              <RequireRole role="moderator">
                <ArticleEditor />
              </RequireRole>
            ),
          },
          { path: "journal/:slug", Component: Article },
          { path: "account", element: guarded(<Profile />) },
          { path: "messages", element: guarded(<Messages />) },
          { path: "new", element: guarded(<NewLot />) },
          {
            path: "moderation",
            element: (
              <RequireRole role="moderator">
                <Moderation />
              </RequireRole>
            ),
          },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
