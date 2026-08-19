import { RouterProvider } from "react-router";
import { router } from "./routes";

export default function App() {
  // AuthProvider и WishProvider живут внутри роутера (Layout): им нужны
  // навигация и адрес, а RouterProvider не принимает внешних потребителей.
  return <RouterProvider router={router} />;
}
