import { defineConfig } from "vite"

// Keep browser requests on one origin. This avoids Chromium preconnects stalling
// the single-threaded Windows PHP test server; production API/auth code is unchanged.
export default defineConfig({
  preview: { proxy: { "/api": `http://127.0.0.1:${process.env.REQ4_BROWSER_API_PORT || 18100}` } },
})
