# Frontend — Restaurant SaaS

This frontend is the product surface for three audiences:

- Owners/ops evaluators: marketing site (`/`)
- Diners: QR menu ordering (`/menu`)
- Restaurant admins/staff: operations dashboard (`/admin`)

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- `next/font` for typography

## Getting Started

First, run the development server:

```bash
npm install
npm run dev
# listen on all interfaces
npm run dev -- -H 0.0.0.0
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Route Map

- `/` — owner/admin operational dashboard (billing, inventory, catalog, analytics, orders)
- `/menu` — customer ordering experience (menu, cart, checkout)
- `/superadmin` — chain & multi-outlet superadmin management console

## Backend Dependency

The frontend expects the FastAPI backend at port `8000` on the same host as the browser.
Base URL is resolved in [src/lib/api.ts](src/lib/api.ts).

## Admin Dashboard Coverage

The dashboard in [src/app/admin/page.tsx](src/app/admin/page.tsx) is wired to:

- `/api/auth/login`
- `/api/admin/orders` (+ status, confirm payment, cancel, refund)
- `/api/admin/categories` (CRUD)
- `/api/admin/menu-items` (CRUD + availability)
- `/api/admin/menu-items/{item_id}/variants` (CRUD + availability)
- `/api/admin/restaurants/me` (read/update settings)

## Notes

- Current auth storage uses localStorage access/refresh tokens for admin session persistence.
- Use a `RESTAURANT_ADMIN` or `STAFF` account for order operations; admin role is required for full CRUD and refund/cancel endpoints.

## Related Docs

- [Root README](../README.md)
- [Architecture](../docs/architecture.md)
- [Conventions](../docs/conventions.md)
