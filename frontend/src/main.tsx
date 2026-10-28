import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { setUnauthorizedHandler } from "./lib/api/client"
import "./styles/globals.css"

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
})

// عند انتهاء الجلسة نرجع لصفحة الدخول عبر الـ router (بدون reload كامل)
setUnauthorizedHandler(() => {
  void router.navigate({
    to: "/login",
    search: { redirect: router.state.location.href },
  })
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
