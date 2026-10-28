# E-commerce Frontend – Project Structure

## Stack
- React 19 + TypeScript
- TanStack Router (file-based)
- TanStack Query
- TanStack Form
- TanStack Table
- Zustand
- Zod
- shadcn/ui + Tailwind CSS
- Axios

## Folder Overview

```
src/
├── app/providers/          → Query + Theme + Toaster
├── components/
│   ├── ui/                 → shadcn components (you generate them)
│   ├── layout/             → AppShell, Sidebar, Header, PageHeader
│   ├── feedback/           → Spinner, EmptyState, ErrorBoundary, ConfirmDialog
│   └── common/             → DataTable, FormField, StatusBadge, Pagination
├── features/
│   ├── auth/               → login form, store, schema, api, hooks
│   ├── products/           → table, form, details, hooks, api, schema
│   └── orders/             → (same pattern)
├── hooks/                  → useMediaQuery, useDebounce, useLocalStorage
├── lib/
│   ├── api/                → client, endpoints, error-handler
│   ├── utils/              → cn, format, storage
│   └── constants/          → roles, order-status
├── routes/                 → TanStack Router file-based routes
├── stores/                 → ui.store (global UI only)
└── types/                  → shared types
```

## Key Principles

1. **Server state** → TanStack Query only
2. **Client/global state** → Zustand (auth + UI)
3. **Validation** → Zod schemas (used in forms + optionally API)
4. **Forms** → TanStack Form + Zod
5. **Tables** → one reusable `DataTable` component
6. **Features are isolated** – easy to scale and test

## How to continue

1. Run `npx shadcn@latest init` and add the components you need (`button`, `input`, `table`, `card`, `dialog`, `dropdown-menu`, `avatar`, `badge`, `label`, `textarea`, `alert-dialog`...)
2. Install packages:
   ```bash
   npm i @tanstack/react-query @tanstack/react-form @tanstack/react-table @tanstack/react-router zustand zod axios clsx tailwind-merge lucide-react sonner
   npm i -D @tanstack/router-plugin @tanstack/react-query-devtools
   ```
3. Configure path alias `@/` in `tsconfig` and `vite.config`
4. Add the TanStack Router Vite plugin

## What makes this look senior

- Clean separation of concerns
- Consistent error handling
- Reusable DataTable + FormField
- Role-based UI
- Optimistic updates ready
- Proper loading / empty / error states
- Type-safe end-to-end
- Ready for the gRPC inventory service later
