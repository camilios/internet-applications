# Responsive frontend and final order status

The frontend now adapts to phone, tablet, split-screen and desktop widths. Below 1024px the sidebar is a closed-by-default drawer, with keyboard focus containment, Escape dismissal and focus restoration. Drawer state is separate from desktop sidebar expansion, so resizing does not open an overlay or reserve sidebar space.

Orders show cards with the status, total and details action at narrow widths. Product and user tables show their existing fields/actions as cards. Desktop tables scroll inside their own container when necessary. The shared shell can shrink; headings, actions, customer emails, product details, dashboard cards, settings, forms and menus fit smaller screens. The current build is served at `http://localhost:5173`; refresh an existing tab once to load the new assets.

The admin status selector previously used `defaultValue`. Removing an old option could make the browser automatically select the next one, so choosing it again did not fire a change event. `OrderStatusControl` now keeps the placeholder selected between requests. It disappears when the saved order is `delivered` or `cancelled`, and remains available for retry if an update fails. Existing API calls, valid transitions, cache invalidation and private live-update hooks are preserved.

Key files: shared components under `frontend/src/components/layout/`, `components/common/data-table.tsx`, `stores/ui.store.ts`, `features/orders/components/order-summary-card.tsx`, `features/orders/components/order-status-control.tsx`, and the existing order/product/dashboard/settings/auth pages. No backend, database migration, inventory or generic CRUD-hook change was needed.

Validation on 15 November 2026:

- **27 frontend tests passed**, including selector reset across all transitions, hiding after Delivered, failed-request retry and pending-request disabling.
- **110 real browser layout checks passed**: 11 pages at widths 320, 375, 568, 640, 720, 768, 960, 1024, 1280 and 1920px; includes a 568×320 landscape viewport. No document overflow; content bounds, drawer space and visible order cards were checked.
- The actual admin control completed `pending → confirmed → processing → shipped → delivered`. The customer list/detail and status toasts updated through Echo/Reverb; Delivered removed the admin selector. All 13 browser documents kept their original navigation time and had no uncaught JavaScript exceptions.
- Drawer keyboard/focus/navigation, desktop-to-split-screen resize and the phone notification menu passed. Production build and lint passed; existing lint and bundle-size warnings remain.

The browser run used the production React build, real Laravel HTTP/JWT/SQLite/database broadcasts/Reverb and a local test proxy. Only inventory was stubbed; no email worker ran. It did not change the running application's orders or send email. [Recorded results](req4-evidence/responsive-layout.json), [720px orders](req4-evidence/responsive-orders-720.png), [375px orders](req4-evidence/responsive-orders-375.png), [Delivered with selector hidden](req4-evidence/admin-order-delivered-720.png).

From `frontend`, run `npm test -- --maxWorkers=1`, `npm run build`, `npm run lint` and `npm run test:responsive`. Browser verification needs installed PHP dependencies/extensions and Edge/Chrome, as documented in the existing QA harness. Run the browser test and build sequentially on a memory-constrained Windows machine. The successful Windows build used `GOMAXPROCS=2`, `GOMEMLIMIT=512MiB`, `RAYON_NUM_THREADS=1`, `UV_THREADPOOL_SIZE=1` and `NODE_OPTIONS=--max-old-space-size=768`.
