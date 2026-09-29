# Restaurant SaaS — Multi-Tenant B2B Dynamic Menu, Ordering, POS & Analytics Platform

An enterprise-grade multi-tenant restaurant management SaaS platform featuring:
- **FastAPI Backend**: Asynchronous Python API for ordering, multi-outlet management, staff RBAC, inventory recipe auto-deduction, sales analytics, manual POS billing, and real-time WebSockets.
- **Next.js Frontend**: High-performance React application featuring four distinct product surfaces: marketing website, diner QR ordering flow, owner/admin operational dashboard, and superadmin chain management console.

---

## Key Platform Modules

### 1. Multi-Outlet Chain & Superadmin Management (`/superadmin`)
- Platform-level administration for provisioning restaurant outlets and owner accounts.
- Cross-outlet management with independent outlet scoping.
- Global dark/light theme mode toggle across pre-auth and post-auth interfaces.

### 2. Staff Management & PIN Quick-Switch System (`/admin` → Staff & Team)
- **Granular 6-Role Hierarchy**: `SUPERADMIN`, `RESTAURANT_ADMIN` (Owner/Admin), `MANAGER`, `KITCHEN_STAFF`, `CASHIER`, `WAITER` (Floor Staff).
- **Dual Authentication**: Email/password sign-in alongside 4-digit PIN quick-switch authentication for shared kitchen and counter POS tablets.
- **Action Audit Logging**: Full audit trail of staff actions (`staff_audit_logs`).

### 3. Inventory & Recipe Auto-Deduction (`/admin` → Inventory)
- **Outlet Ingredient Master**: Track stock levels across standard units (`kg`, `g`, `l`, `ml`, `pcs`) with configurable reorder thresholds and unit cost tracking.
- **Stock Intakes & Restocking**: Record intake quantities, unit costs, supplier names, and intake notes.
- **Recipe Auto-Deduction**: Map menu items and variants to raw ingredient quantities. Stock auto-deducts when orders are paid/preparing and automatically restocks on order cancellation.
- **Stock Ledger Audit Log**: Complete history of stock movements tagged with immutable `unit_cost_snapshot` for historical COGS precision.

### 4. Sales & Analytics Engine (`/admin` → Sales & Analytics)
- **KPI Summary Strip**: Real-time Total Revenue, Total Orders, Avg Order Value (AOV), and Profit Margin % with period-over-period percentage change badges.
- **Revenue Trends**: Time-bucketed revenue charts (hourly, daily, weekly, monthly) with previous period comparison overlay.
- **Peak Service Hours Heatmap**: 24-hour service volume heatmap (0–23h) identifying operational peak hours.
- **Top Dishes Analysis**: Ranked dish list alongside revenue-share donut/pie chart visualization.
- **Order Funnel & Profit Margins**: Conversion funnel tracking (Confirmation Pending → Payment Pending → Paid → Completed → Cancelled) and net profit calculation (Revenue - COGS using cost snapshots).
- **Reports & Export**: One-click CSV data export and A4 executive PDF report generation.

### 5. Billing & POS System (`/admin` → Billing & POS)
- **Manual Bill Creation**: Walk-in and phone order POS draft creation, standalone or table-assigned, with item catalog picker, variant selection, quantity counters, and zero-cost complimentary item toggles.
- **Discount Engine & Approval Workflow**: Support for `%` Percent, Flat Amount (`₹`), and `100%` Complimentary discounts with mandatory reason notes. Cashier-created discounts enter `PENDING_APPROVAL`, triggering real-time notification badges across the workspace for Manager/Admin review/approval/rejection. Manager-created discounts auto-approve.
- **Payment Settlement**: Cash and Direct UPI payment processing with live Cash Change Calculator.
- **Thermal Receipt Printing**: Monospaced thermal PDF bill generation and reprinting.

### 6. Flexible Payment & Settlement Modes
- **Razorpay Gateway (`RAZORPAY_GATEWAY`)**: Automated online payment collection with Razorpay Route split transfers, raw-body HMAC signature verification, and `WebhookEvent` table deduplication.
- **Pay After Meal / Counter Settlement (`PAY_AFTER_MEAL`)**: Diner QR checkout placing orders into `PENDING_VERIFICATION` / `PREPARING` for staff counter payment collection.
- **Both Options Enabled (`BOTH`)**: Diners choose between Razorpay online checkout or Pay at Counter during QR ordering.
- **Manual POS Settlement**: Staff settles walk-in bills directly via Cash (with change calculator) or Direct UPI.

### 7. Kitchen Live Orders Board & Real-Time WebSockets
- Kanban-style order status pipeline (Confirmation Pending → Payment Pending → Kitchen Preparing → Served/Completed → Cancelled).
- Real-time kitchen dashboard updates via WebSockets authenticated through single-use tickets (`POST /api/ws-ticket`) with Redis pub/sub fan-out.

---

## Tech Stack

- **Backend**: FastAPI (Python 3.11+) with AsyncIO
- **Frontend**: Next.js (App Router, TypeScript, Vanilla CSS design system with CSS variables, Lucide React icons, Framer Motion)
- **Database**: PostgreSQL (SQLAlchemy 2.0 Async ORM + Alembic migrations)
- **Caching & Real-Time**: Redis (menu cache-aside with jittered TTL, thundering-herd distributed locks, pub/sub WebSocket fan-out)
- **Auth**: JWT (argon2id password hashing, bcrypt PIN hashing, refresh token rotation)
- **Payments**: Razorpay Route + Direct UPI deep links
- **PDF Reports**: jsPDF + jsPDF-AutoTable (Executive A4 Analytics & Thermal POS Receipts)

---

## Quick Start

### Backend Setup (FastAPI)

```bash
# 1. Enter root directory
cd restaurant-app

python -m venv .venv

# 2. Activate virtual environment
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/Mac

# 3. Install dependencies
pip install -e ".[dev]"

# 4. Configure environment variables
cp .env.example .env
# Edit .env with PostgreSQL, Redis, and JWT credentials

# 5. Run Alembic migrations
alembic upgrade head

# 6. Start FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup (Next.js)

```bash
cd frontend
npm install
npm run dev -- -H 0.0.0.0
```

---

## Frontend Product Surfaces

| Route | Audience | Description |
|---|---|---|
| `/` | Decision Makers | Marketing website highlighting chain features, ROI, and POS capabilities |
| `/menu` | Diners | Mobile-first QR diner menu, variant selector, cart, and checkout flow |
| `/admin` | Restaurant Staff & Admins | Operational dashboard (Live Orders, Billing POS, Inventory, Analytics, Staff, Settings) |
| `/superadmin` | Chain Superadmins | Cross-outlet platform provisioning and admin management console |

---

## Documentation Index

- [Architecture Reference](docs/architecture.md) — Canonical technical specification, schemas, and sequence diagrams
- [Codebase Walkthrough](docs/codebase-walkthrough.md) — Fast onboarding guide and 10 system invariants
- [Conventions & Standards](docs/conventions.md) — Coding rules, naming, folder structure, and "Things That Must Never Happen"
- [Architectural Decision Records](docs/decisions.md) — ADR log (ADR-001 through ADR-024)
- [Build Progress](docs/progress.md) — Completed phase-by-phase checklist and session history

# ApnaGreenBasket-pos
