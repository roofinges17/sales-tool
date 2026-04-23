# Roofing Experts Sales Tool — Build Spec

**Source recon:** `https://github.com/JBODE-mhhs/RE` (full source read) + live site `https://main.dusyvkuoui51c.amplifyapp.com/`
**Target stack:** Next.js 15 App Router (static export) · Cloudflare Pages · Supabase (auth + Postgres + RLS)
**Date:** 2026-04-23

---

## 1. What This App Is

A roofing company sales CRM used by a field sales team. Core loop:

1. Seller visits a customer → opens the Quote Builder on their phone/tablet
2. Builds an estimate from a product catalog in a 6-step wizard
3. Shows the customer a live price + monthly financing payment
4. Customer accepts → signed estimate converts to a contract
5. Manager tracks contracts through a Kanban pipeline (workflow stages)
6. Owner/Finance sees commission owed per seller per job

The live app stores **all data in localStorage** (the Amplify DynamoDB layer is scaffolded but the data hooks read/write localStorage). The replica must replace localStorage with **Supabase Postgres + RLS**, making data persistent and multi-device.

---

## 2. Source Stack (original)

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router, TypeScript strict |
| Styling | Tailwind CSS 3, custom design tokens (`text-text-primary`, `bg-surface-1`, etc.) |
| Auth | AWS Cognito — email login, 5 groups: `Owner`, `Admin`, `SalesManager`, `Seller`, `Finance` |
| Backend | AWS Amplify Gen 2 — AppSync GraphQL + DynamoDB |
| Data layer | **localStorage** (`crm_accounts`, `crm_quotes`, `crm_contracts`, `crm_products`, `crm_users`, `crm_departments`, `crm_workflows`) |
| PDF generation | `jspdf` + `html2canvas` (client-side) |
| Icons | `@heroicons/react` |
| UI components | Custom (`Button`, `Card`, `Table`, `Modal`, `Tabs`, `Badge`, `Input`, `Select`, etc.) in `components/ui/` |

## 3. Target Stack (replica)

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router, `output: "export"`, TypeScript strict |
| Styling | Tailwind CSS 3 (same token system ported) |
| Auth | Supabase Auth — email+password, user roles via `profiles` table |
| Database | Supabase Postgres — tables mirror Amplify schema, RLS on all tables |
| Hosting | Cloudflare Pages (same deploy pattern as RE++) |
| Env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| PDF | Keep `jspdf` + `html2canvas` |
| Icons | Keep `@heroicons/react` |

---

## 4. Sitemap (14 pages crawled / 18 routes)

| Route | Page | Auth Required | Role |
|---|---|---|---|
| `/login` | Login | No | — |
| `/` | Dashboard home | Yes | All |
| `/accounts` | Customer list | Yes | All |
| `/accounts/new` | New customer form | Yes | Seller+ |
| `/accounts/[id]` | Customer detail + contacts + properties + docs | Yes | All |
| `/quotes` | Estimates list | Yes | All |
| `/quotes/builder` | 6-step estimate builder | Yes | Seller+ |
| `/quotes/[id]` | Estimate detail + line items + notes + docs | Yes | All |
| `/sales` | Contracts list (list/board toggle) | Yes | All |
| `/sales/[id]` | Contract detail + payments + workflow | Yes | All |
| `/pipeline` | Kanban pipeline board | Yes | All |
| `/commissions` | Commission tracker | Yes | All |
| `/admin/settings` | Company settings | Yes | Admin/Owner |
| `/admin/settings/products` | Product catalog CRUD | Yes | Admin/Owner |
| `/admin/settings/users` | User management | Yes | Admin/Owner |
| `/admin/settings/departments` | Departments CRUD | Yes | Admin/Owner |
| `/admin/settings/financing` | Financing plans CRUD | Yes | Admin/Owner |
| `/admin/settings/lead-sources` | Lead source config | Yes | Admin/Owner |
| `/admin/settings/commissions` | Commission plan CRUD | Yes | Admin/Owner |
| `/admin/settings/workflows` | Workflow stage builder | Yes | Admin/Owner |
| `/accept/quote` | Public quote acceptance (customer-facing, no auth) | No | — |
| `/sign` | E-signature page | No | — |

---

## 5. Data Models → Supabase Postgres Tables

All tables get `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`. RLS: every table locked to `auth.uid()` join via `owner_org_id` or explicit per-row rules below.

### 5.1 Identity

```sql
-- profiles (mirrors Amplify User model, one-to-one with auth.users)
profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'sales_manager', 'seller', 'finance')),
  department_id UUID REFERENCES departments,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  created_at, updated_at
)
-- RLS: owner/admin can see all; others see own row

-- departments
departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  pipeline_config JSONB,
  created_at, updated_at
)
-- RLS: authenticated read; admin/owner write
```

### 5.2 Customer Management

```sql
-- accounts (= customers)
accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  type                  TEXT CHECK (type IN ('RESIDENTIAL', 'COMMERCIAL', 'MULTIFAMILY')),
  status                TEXT CHECK (status IN ('ACTIVE', 'INACTIVE', 'PROSPECT')) DEFAULT 'PROSPECT',
  email                 TEXT,
  phone                 TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city          TEXT,
  billing_state         TEXT,
  billing_zip           TEXT,
  industry              TEXT,
  website               TEXT,
  notes                 TEXT,
  lead_source           TEXT,
  assigned_to_id        UUID REFERENCES profiles,
  created_by_id         UUID REFERENCES profiles,
  created_at, updated_at
)
-- RLS: owner/admin/sales_manager can CRUD; seller can read/update own assigned

-- contacts (linked to account)
contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  title       TEXT,
  is_primary  BOOLEAN DEFAULT FALSE,
  role        TEXT CHECK (role IN ('HOMEOWNER', 'SPOUSE', 'TENANT', 'PROPERTY_MANAGER', 'REALTOR', 'OTHER')),
  notes       TEXT,
  created_at, updated_at
)

-- properties (job sites linked to account)
properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts ON DELETE CASCADE,
  name          TEXT,
  street        TEXT NOT NULL,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  zip_code      TEXT NOT NULL,
  country       TEXT DEFAULT 'USA',
  latitude      FLOAT,
  longitude     FLOAT,
  is_primary    BOOLEAN DEFAULT FALSE,
  property_type TEXT CHECK (property_type IN ('SINGLE_FAMILY', 'MULTI_FAMILY', 'COMMERCIAL', 'INDUSTRIAL', 'OTHER')),
  square_footage INTEGER,
  year_built    INTEGER,
  notes         TEXT,
  created_at, updated_at
)

-- account_documents
account_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  document_type   TEXT CHECK (document_type IN ('CONTRACT', 'PERMIT', 'PHOTO', 'INVOICE', 'OTHER')),
  file_url        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       INTEGER,
  file_mime_type  TEXT,
  storage_path    TEXT,
  uploaded_by_id  UUID REFERENCES profiles,
  created_at, updated_at
)
```

### 5.3 Product Catalog

```sql
-- product_categories
product_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  code          TEXT,
  description   TEXT,
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  department_id UUID REFERENCES departments,
  parent_id     UUID REFERENCES product_categories,
  created_at, updated_at
)

-- products
products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  code          TEXT,
  description   TEXT,
  product_type  TEXT CHECK (product_type IN ('PRODUCT', 'SERVICE')) DEFAULT 'PRODUCT',
  price         NUMERIC(12,2),        -- default sell price
  cost          NUMERIC(12,2),        -- internal cost
  min_price     NUMERIC(12,2),        -- redline / floor
  max_price     NUMERIC(12,2),
  default_price NUMERIC(12,2),
  unit          TEXT,                 -- e.g. 'sq', 'ft', 'ea'
  is_active     BOOLEAN DEFAULT TRUE,
  is_required   BOOLEAN DEFAULT FALSE,
  is_add_on     BOOLEAN DEFAULT FALSE,
  image_urls    TEXT[],
  category_id   UUID REFERENCES product_categories,
  department_id UUID REFERENCES departments,
  created_at, updated_at
)
-- RLS: authenticated read; admin/owner write
```

### 5.4 Quotes (Estimates)

```sql
-- quotes
quotes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,              -- "EST-0001"
  version               INTEGER DEFAULT 1,
  status                TEXT CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')) DEFAULT 'DRAFT',
  subtotal              NUMERIC(12,2),
  discount_type         TEXT CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  discount_value        NUMERIC(12,2),
  discount_amount       NUMERIC(12,2),
  tax_rate              NUMERIC(6,4) DEFAULT 0.07,
  tax_amount            NUMERIC(12,2),
  total                 NUMERIC(12,2),
  financing_provider    TEXT,
  financing_term        INTEGER,
  financing_rate        NUMERIC(6,4),
  monthly_payment       NUMERIC(12,2),
  valid_until           DATE,
  sent_at               TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ,
  notes                 TEXT,
  terms_and_conditions  TEXT,
  lead_source           TEXT,
  contract_status       TEXT CHECK (contract_status IN ('NONE','DRAFT','SENT','OPENED','SIGNED','UPLOADED','VOIDED')) DEFAULT 'NONE',
  previous_version_id   UUID REFERENCES quotes,
  is_latest_version     BOOLEAN DEFAULT TRUE,
  account_id            UUID REFERENCES accounts,
  property_id           UUID REFERENCES properties,
  created_by_id         UUID REFERENCES profiles,
  assigned_to_id        UUID REFERENCES profiles,
  department_id         UUID REFERENCES departments,
  created_at, updated_at
)

-- quote_line_items
quote_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID NOT NULL REFERENCES quotes ON DELETE CASCADE,
  product_id          UUID REFERENCES products,
  product_name        TEXT NOT NULL,
  product_sku         TEXT,
  product_description TEXT,
  quantity            NUMERIC(10,2) NOT NULL,
  unit_price          NUMERIC(12,2) NOT NULL,
  unit_cost           NUMERIC(12,2),
  discount_type       TEXT,
  discount_value      NUMERIC(12,2),
  discount_amount     NUMERIC(12,2),
  line_total          NUMERIC(12,2) NOT NULL,
  sort_order          INTEGER,
  notes               TEXT,
  created_at, updated_at
)

-- quote_notes
quote_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles,
  author_name TEXT,
  content     TEXT NOT NULL,
  created_at, updated_at
)

-- quote_documents
quote_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        UUID NOT NULL REFERENCES quotes ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  document_type   TEXT,
  file_url        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       INTEGER,
  file_mime_type  TEXT,
  storage_path    TEXT,
  is_public       BOOLEAN DEFAULT FALSE,
  uploaded_by_id  UUID REFERENCES profiles,
  created_at, updated_at
)
```

### 5.5 Sales / Contracts

```sql
-- sales
sales (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  contract_number         TEXT,                     -- "RE-0001"
  status                  TEXT CHECK (status IN ('PENDING','ACTIVE','CANCELLED','COMPLETED')) DEFAULT 'PENDING',
  contract_value          NUMERIC(12,2) NOT NULL,
  subtotal                NUMERIC(12,2),
  discount_total          NUMERIC(12,2),
  tax_rate                NUMERIC(6,4),
  tax_amount              NUMERIC(12,2),
  financing_provider      TEXT,
  financing_term          INTEGER,
  financing_rate          NUMERIC(6,4),
  monthly_payment         NUMERIC(12,2),
  discount_type           TEXT,
  discount_value          NUMERIC(12,2),
  terms_and_conditions    TEXT,
  contract_document_url   TEXT,
  cost_of_goods           NUMERIC(12,2),
  gross_profit            NUMERIC(12,2),
  commission_plan_id      UUID REFERENCES commission_plans,
  contract_date           DATE,
  activation_date         DATE,
  completion_date         DATE,
  cancellation_date       DATE,
  deposit_paid            BOOLEAN DEFAULT FALSE,
  deposit_paid_at         TIMESTAMPTZ,
  contract_status         TEXT CHECK (contract_status IN ('NONE','DRAFT','SENT','OPENED','SIGNED','UPLOADED','VOIDED')) DEFAULT 'NONE',
  contract_signed_at      TIMESTAMPTZ,
  contract_signed_by_name TEXT,
  signed_contract_url     TEXT,
  notes                   TEXT,
  cancellation_reason     TEXT,
  lead_source             TEXT,
  quote_id                UUID REFERENCES quotes,
  account_id              UUID NOT NULL REFERENCES accounts,
  property_id             UUID REFERENCES properties,
  primary_seller_id       UUID REFERENCES profiles,
  secondary_seller_id     UUID REFERENCES profiles,
  department_id           UUID REFERENCES departments,
  workflow_stage_id       UUID REFERENCES workflow_stages,
  workflow_started_at     TIMESTAMPTZ,
  workflow_completed_at   TIMESTAMPTZ,
  created_at, updated_at
)

-- sale_line_items
sale_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id             UUID NOT NULL REFERENCES sales ON DELETE CASCADE,
  product_id          UUID REFERENCES products,
  product_name        TEXT NOT NULL,
  product_sku         TEXT,
  product_description TEXT,
  quantity            NUMERIC(10,2) NOT NULL,
  unit_price          NUMERIC(12,2) NOT NULL,
  unit_cost           NUMERIC(12,2),
  line_total          NUMERIC(12,2) NOT NULL,
  unit                TEXT,
  sort_order          INTEGER,
  created_at, updated_at
)

-- sale_payments
sale_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID NOT NULL REFERENCES sales ON DELETE CASCADE,
  amount           NUMERIC(12,2) NOT NULL,
  payment_date     DATE NOT NULL,
  payment_method   TEXT CHECK (payment_method IN ('CASH','CHECK','CREDIT_CARD','ACH','WIRE','FINANCING','OTHER')),
  reference_number TEXT,
  notes            TEXT,
  recorded_by_id   UUID REFERENCES profiles,
  created_at, updated_at
)
```

### 5.6 Commissions

```sql
-- commission_plans
commission_plans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  description               TEXT,
  is_active                 BOOLEAN DEFAULT TRUE,
  lead_source               TEXT,
  seller_percentage         NUMERIC(6,4) NOT NULL,
  secondary_seller_percentage NUMERIC(6,4),
  manager_percentage        NUMERIC(6,4),
  owner_percentage          NUMERIC(6,4),
  company_percentage        NUMERIC(6,4),
  primary_split_ratio       NUMERIC(6,4) DEFAULT 70,
  secondary_split_ratio     NUMERIC(6,4) DEFAULT 30,
  upfront_percentage        NUMERIC(6,4),
  monthly_percentage        NUMERIC(6,4),
  monthly_duration_months   INTEGER,
  department_id             UUID REFERENCES departments,
  created_at, updated_at
)

-- commission_entries (computed on sale creation/update)
commission_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           UUID NOT NULL REFERENCES sales ON DELETE CASCADE,
  recipient_id      UUID NOT NULL REFERENCES profiles,
  commission_plan_id UUID REFERENCES commission_plans,
  amount            NUMERIC(12,2) NOT NULL,
  type              TEXT CHECK (type IN ('UPFRONT', 'MONTHLY')),
  status            TEXT CHECK (status IN ('PENDING','EARNED','APPROVED','PAID','BLOCKED')) DEFAULT 'PENDING',
  role              TEXT CHECK (role IN ('PRIMARY_SELLER','SECONDARY_SELLER','MANAGER','COMPANY')),
  due_date          DATE,
  earned_date       DATE,
  approved_date     DATE,
  approved_by_id    UUID REFERENCES profiles,
  paid_date         DATE,
  paid_by_id        UUID REFERENCES profiles,
  payment_reference TEXT,
  month_number      INTEGER,
  notes             TEXT,
  created_by_id     UUID REFERENCES profiles,
  created_at, updated_at
)
```

### 5.7 Workflows

```sql
-- workflow_templates
workflow_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES departments,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at, updated_at
)

-- workflow_stages
workflow_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES workflow_templates ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,
  description     TEXT,
  sort_order      INTEGER NOT NULL,
  assignable_roles TEXT[],
  is_terminal     BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at, updated_at
)

-- workflow_logs (audit trail of stage moves)
workflow_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       UUID NOT NULL REFERENCES sales ON DELETE CASCADE,
  from_stage_id UUID REFERENCES workflow_stages,
  to_stage_id   UUID NOT NULL REFERENCES workflow_stages,
  moved_by_id   UUID NOT NULL REFERENCES profiles,
  moved_by_name TEXT,
  notes         TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 5.8 Financing Plans (Admin-configured)

```sql
-- financing_plans
financing_plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  provider_id             TEXT NOT NULL,
  provider_name           TEXT NOT NULL,
  term_months             INTEGER NOT NULL,
  apr                     NUMERIC(6,4) NOT NULL,
  dealer_fee_percentage   NUMERIC(6,4) NOT NULL,
  is_active               BOOLEAN DEFAULT TRUE,
  created_at, updated_at
)
```

### 5.9 Lead Sources (Admin-configured)

```sql
-- lead_sources
lead_sources (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  value                TEXT NOT NULL UNIQUE,
  seller_share_percent NUMERIC(6,4) DEFAULT 100,
  is_active            BOOLEAN DEFAULT TRUE,
  created_at, updated_at
)
```

---

## 6. RLS Strategy

Replace Cognito groups with `profiles.role`. Every table's RLS policy checks the role of the current `auth.uid()` via a `get_my_role()` function:

```sql
CREATE FUNCTION get_my_role() RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

Role hierarchy for row-level policy:
- `owner` — full access to all rows
- `admin` — full access to all rows
- `sales_manager` — read all, write/create all in their department
- `seller` — read/create own rows (filter by `primary_seller_id = auth.uid()` or `assigned_to_id = auth.uid()` or `created_by_id = auth.uid()`)
- `finance` — read-only on commissions, sales, payments

Public tables (no auth): `accept/quote` page reads a specific quote by ID via a server action with `service_role` key.

---

## 7. Screen-by-Screen Spec

### 7.1 Login (`/login`)

**Purpose:** Email + password admin login. No public signup.

**Fields:**
- Email (type=email, required, placeholder: "your@email.com")
- Password (type=password, required)

**Actions:**
- Sign in → `supabase.auth.signInWithPassword()` → redirect `/`
- Error state: red alert with message

**Notes:** Check session on mount, redirect to `/` if already authed.

---

### 7.2 Dashboard (`/`)

**Purpose:** Sales overview for the logged-in user.

**Top stats row (4 cards):**
| Metric | Data source | Color |
|---|---|---|
| Customers | COUNT(accounts) | accent |
| Pending Estimates | COUNT(quotes WHERE status IN ('DRAFT','SENT')) | orange |
| Active Contracts | COUNT(sales WHERE status='ACTIVE') | green |
| Total Revenue | SUM(sales.contract_value WHERE status IN ('ACTIVE','COMPLETED')) | purple |

**Pipeline section (lg:col-span-2):**
- If workflow configured: horizontal stacked bar by workflow stage with legend
- Else: stacked bar by estimate status (Draft/Sent/Accepted/Contracts)
- Empty state if no data

**Recent Activity (sidebar):** last 10 events (new customer, estimate, contract). Empty state if none.

**Stuck Contracts:** contracts in same workflow stage >N days (configurable). Show name, customer, stage badge, days stuck.

**Quick Actions (2×2 grid):**
- New Customer → `/accounts/new`
- New Estimate → `/quotes/builder`
- Contracts → `/sales`
- Commissions → `/commissions`

**Role visibility:** Sellers see only their own pipeline. Managers/Owners see all.

---

### 7.3 Customers (`/accounts`)

**Purpose:** List all customer accounts with search/filter.

**Stats (3 cards):** Total, Active (green), Inactive (red).

**Tabs:** All | Active | Inactive | Prospect (with counts)

**Filters:**
- Search (name/email)
- Type dropdown (All / RESIDENTIAL / COMMERCIAL)

**Table columns:** Name (link), Type (badge: blue/purple), Status (badge: green/red/orange), Assigned To, Email, Phone, Lead Source, Created date.

**Row click** → `/accounts/[id]`

**"New Customer" button** → `/accounts/new`

---

### 7.4 New Customer (`/accounts/new`)

**Form fields:**
- Name (required)
- Type (RESIDENTIAL | COMMERCIAL | MULTIFAMILY)
- Status (ACTIVE | INACTIVE | PROSPECT)
- Email, Phone
- Lead Source (dropdown from `lead_sources` table)
- Assigned To (dropdown from `profiles` where role IN ('seller','sales_manager'))
- Billing address (line1, line2, city, state, zip)
- Notes (textarea)

**On submit:** INSERT into `accounts`, redirect to `/accounts/[id]`

---

### 7.5 Customer Detail (`/accounts/[id]`)

**Header:** Name, type badge, status badge, "Edit" button. Assigned seller.

**Tabs:**
1. **Overview** — billing address, email, phone, lead source, notes
2. **Contacts** — list of contacts (name, role, email, phone). Add contact modal: first/last name, email, phone, role (HOMEOWNER/SPOUSE/TENANT/PROPERTY_MANAGER/REALTOR/OTHER), isPrimary toggle.
3. **Properties** — list of property addresses. Add property form: street, city, state, zip, type (SINGLE_FAMILY/MULTI_FAMILY/COMMERCIAL/etc), sqft, year built, notes.
4. **Estimates** — quotes linked to this account. Columns: name, status badge, total, created date. Link to `/quotes/[id]`.
5. **Contracts** — sales linked to this account. Columns: contract#, status badge, value, date.
6. **Documents** — file upload + list. Types: CONTRACT/PERMIT/PHOTO/INVOICE/OTHER.

---

### 7.6 Estimates List (`/quotes`)

**Stats (4 cards):** Total, Draft, Presented (Sent), Accepted.

**Tabs:** All | Draft | Sent | Accepted | Rejected | Expired

**Filters:** Search (estimate name / customer), Department dropdown.

**Table:** Estimate # (link), Customer, Assigned To, Department, Status (badge), Total (currency), Created date.

**Row click** → `/quotes/[id]`

**"New Estimate" button** → `/quotes/builder`

---

### 7.7 Quote Builder (`/quotes/builder`) ← MOST COMPLEX SCREEN

**6-step wizard with stepper UI.** State managed in `QuoteBuilderContext`.

#### Step 1 — Department
- Select card for each active department (Roofing, Siding, Gutters, etc.)
- Selecting a dept clears the product cart
- Required to proceed

#### Step 2 — Products
**Left panel: Product Catalog** (searchable, by category tabs)
- Category tabs derived from `product_categories` for selected department
- Each product card: name, code, default price, unit. "+ Add" button.
- Products have types: PRODUCT (blue-tinted) vs SERVICE (orange-tinted)
- Multiple add: clicking "+ Add" again increments qty

**Right panel: Quote Cart** (`QuoteCart` component)
- Lists added items: name, qty input (editable inline), unit, @ price, line total
- Sell price override: click price to edit inline (clamped between `min_price` and `max_price`)
- "X" button removes item
- Subtotal at bottom

**Internal Pricing Table** (only visible to sales_manager/owner/admin — `InternalPricingTable` component):
- Per line: default price, redline price (min), sell price (editable), cost, seller profit, company profit, margin%
- Status indicator: default (grey), custom (blue), below_redline (red), above_max (orange)
- Summary row: total cost, total redline, total sell, seller profit, company profit, margin%

**Commission Preview** (`CommissionSummaryCard`):
- Seller commission = sum(sell_price - min_price) per PRODUCT line
- Manager commission = 18% × base_profit (min - cost total)
- Owner commission = 5% × base_profit
- Company retained = gross_profit - all commissions

#### Step 3 — Customer
- **Search existing:** text input searches `accounts` by name/email → shows result card with name, email, phone
- **OR "New Customer"** toggle: shows inline form (name, email, phone, property address fields, lead source)
- Lead source selector affects commission split preview

#### Step 4 — Review
- Summary: items list, customer name, property address
- Discount field: toggle PERCENTAGE or FIXED amount → `QuickDiscountButtons` (preset %/$ buttons)
- Tax rate field (default 7%)
- Quote validity days (default 30)
- Notes textarea
- Totals: Subtotal → Dealer fee (if financing) → After discount → Tax → **Total**
- Internal pricing table visible to managers/admins

#### Step 5 — Financing
- Toggle: Cash or Financing
- If Financing: show active `financing_plans` as selectable cards
  - Each card: provider name, plan name, term (months), APR%, dealer fee%
  - Selected plan shows monthly payment calculation: `P × r(1+r)^n / ((1+r)^n - 1)`
  - Dealer fee added to subtotal (passed to customer)

#### Step 6 — Estimate (Generate)
- Shows `EstimatePreviewDocument` component: branded PDF preview
  - Company name/logo
  - Customer name, property address
  - Line items table (name, qty, unit, unit price, total)
  - Financing disclosure (if applicable)
  - Totals breakdown
  - Terms & conditions
  - Signature capture area
- Buttons: "Download PDF" (`generate-estimate-pdf` util with jspdf), "Send to Customer" (generates `accept/quote` link)
- On "Save Estimate": INSERT quote + quote_line_items → redirect `/quotes/[id]`

**Accept Quote URL format:** `/accept/quote#d=<base64(JSON)>` where JSON = `{ quoteId, quote, signature: { name, title, signedAt } }`

---

### 7.8 Quote Detail (`/quotes/[id]`)

**Header:** Quote name, status badge, version#, total, valid until. Buttons: Edit, "Send", "Mark Accepted/Rejected", "Convert to Contract".

**Tabs:**
1. **Overview** — line items table, discount/tax/total breakdown, financing details
2. **Notes** — add/view internal notes
3. **Documents** — attach/view files
4. **Activity** — status history log

**Convert to Contract:** opens modal → fills in `sales` table from quote data, creates `commission_entries` per commission plan.

---

### 7.9 Contracts (`/sales`)

**Stats (5 cards):** Total Contracts, Total Value, Active (green), Pending (orange), This Month.

**View toggle:** List view ↔ Board view (Kanban)

**Filters:** Search (name/contract#/account), Status tabs (All/Pending/Active/Completed/Cancelled), Department dropdown.

**Table columns:** Date, Contract # (link), Client, Seller, Total, Status (badge), Stage (colored badge), Paid, Balance (red if >0).

**Row click** → `/sales/[id]`

**Board view:** `PipelineBoard` component — columns = workflow stages for selected dept. Cards show: contract name, customer, value, seller. Drag-and-drop to move stages (creates `workflow_logs` entry).

---

### 7.10 Contract Detail (`/sales/[id]`)

**Header:** Contract name, number, status badge, contract date. Workflow stage selector. Buttons: Edit, Cancel.

**Tabs:**
1. **Overview** — line items, financial summary (value, cost of goods, gross profit), financing info
2. **Payments** — list of `sale_payments`. Add payment form: amount, date, method, reference #.
3. **Workflow** — current stage, stage history from `workflow_logs`. Button to advance/move stage.
4. **Commission** — commission breakdown per role (seller markup, manager share, owner share, company retained).
5. **Documents** — contract PDF, signed contract, attachments.
6. **Notes** — internal notes.

---

### 7.11 Pipeline (`/pipeline`)

**Purpose:** Kanban view of contracts in workflow stages.

**Department selector** (if multiple depts).

**Columns:** one per `workflow_stage` ordered by `sort_order`.

**Cards:** contract name, customer name, contract value, seller name. Color accent = stage color.

**Drag-drop:** moves contract to new stage. Creates `workflow_logs` entry. Calls `UPDATE sales SET workflow_stage_id = X`.

**Empty state:** "Go to Settings > Workflows to create a workflow."

---

### 7.12 Commissions (`/commissions`)

**Stats (3 cards):** Total Earned (seller commissions), Paid Out (green), Pending (orange).

**Tabs:** All | Pending | Partial | Paid

**Filters:** Search (sale/customer), Role dropdown (Seller/Manager/Company).

**Table:** Sale, Customer, Role (badge), Total Owed, Paid (green), Remaining (orange), Job Status (badge), Payout Status (badge).

**Row click** → opens `CommissionDetailModal`:
- 3 metric cards: Total Owed, Paid, Remaining
- Details grid: role, dept, contract value, upfront collected, seller, job status
- Formula explanation text (seller earns markup; manager earns % of base profit)
- Quick links: Customer, Contract

**Commission calculation logic (replicate exactly):**
```
seller_markup = SUM(sell_price - min_price) for PRODUCT items  
base_profit = SUM(min_price - cost) for all items  
seller_commission = seller_markup - discount_applied_to_seller  
manager_commission = base_profit × 0.18  
owner_commission = base_profit × 0.05  
company_retained = gross_profit - seller_commission - manager_commission - owner_commission  
```

---

### 7.13 Admin Settings

All admin routes protected by `role IN ('owner', 'admin')`.

Sidebar nav:
- Company (`/admin/settings`)
- Products (`/admin/settings/products`)
- Users (`/admin/settings/users`)
- Departments (`/admin/settings/departments`)
- Financing (`/admin/settings/financing`)
- Lead Sources (`/admin/settings/lead-sources`)
- Commission Plans (`/admin/settings/commissions`)
- Workflows (`/admin/settings/workflows`)

#### Company Settings
Fields: Company Name, Legal Name, Email, Phone, Website, Tax ID, Address, Default Tax Rate, Quote Validity Days, Contract Prefix (`RE-`), Estimate Prefix (`EST-`), Terms & Conditions (textarea).
Saved to `company_settings` table (single row, upsert).

#### Products
Table with search + dept filter. Columns: name, code, type badge, default price, cost, min price, max price, unit, dept, status.
CRUD modal (edit/new/delete) with all price fields (CurrencyInput component), type selector, category/dept selectors.

#### Users
Table: name, email, role badge, dept, status badge. Admin can create/edit users → maps to Supabase Admin API for auth user creation + `profiles` row.

#### Departments
CRUD for departments. Fields: name, code, color picker, description. Toggle active.

#### Financing
CRUD for financing plans. Fields: provider name, plan name, term (months), APR %, dealer fee %, active toggle.

#### Lead Sources
CRUD. Fields: name, value (slug), seller share % (default 100%). Active toggle.

#### Commission Plans
CRUD. Fields: name, lead source filter, seller %, secondary seller %, manager %, owner %, company %, split ratio, upfront %, monthly %, monthly duration. Department.

#### Workflows
Visual stage builder per department. Add/remove/reorder stages. Each stage: name, color (color picker), assignable roles checkboxes, is_terminal toggle.

---

### 7.14 Quote Acceptance (`/accept/quote`) — PUBLIC, NO AUTH

**URL shape:** `/accept/quote#d=<base64url-encoded-json>`

**JSON payload:** `{ quoteId: string, quote: { id, name }, signature: { name, title, signedAt } }`

**Behavior:**
1. Parse `#d=...` from URL hash
2. Base64-decode → JSON.parse
3. Call Supabase with `service_role` key (server component or edge function): `UPDATE quotes SET status='ACCEPTED', accepted_at=NOW()` where id = quoteId
4. INSERT `quote_documents` with type='SIGNED_ESTIMATE'
5. Show success: "Estimate accepted. Redirecting..." → redirect `/quotes/[quoteId]`
6. If quoteId not found in same browser session: show "Signature received. Open in the same browser where you use the CRM."

---

## 8. Key Components to Build

| Component | Description |
|---|---|
| `NavBar` | Top sticky nav — logo, dept-scoped nav links, user email, sign-out |
| `Sidebar` | Admin settings sidebar nav |
| `QuoteBuilderStepper` | 6-step wizard header with step indicators |
| `QuoteCart` | Right-panel cart with qty/price controls |
| `ProductCatalog` | Left-panel searchable product grid with category tabs |
| `InternalPricingTable` | Manager-only table showing cost/redline/sell/profit per line |
| `CommissionSummaryCard` | Live commission breakdown preview |
| `EstimatePreviewDocument` | PDF-ready estimate layout (used for preview + download) |
| `PipelineBoard` | Kanban board with drag-and-drop stage columns |
| `WorkflowProgress` | Stage progress indicator on contract detail |
| `ReassignModal` | Reassign contract/quote to different seller |
| `Badge` | Status/role badges (colors: green/blue/orange/red/purple/teal) |
| `Table` | Generic sortable table with Column<T> type |
| `CurrencyInput` | Formatted dollar input |
| `Modal` | Centered overlay modal |
| `Tabs` | Tab bar with count badges |
| `EmptyState` | Centered empty content with icon, title, description, optional action |

---

## 9. Auth & Role Gate Pattern

```tsx
// useAuth hook wraps supabase.auth.getUser() + profile lookup
const { user, profile, loading } = useAuth();

// Route guard in layout or page
if (!user) redirect('/login');
if (profile.role !== 'admin' && profile.role !== 'owner') redirect('/');
```

Supabase `auth.users` → `profiles` joined on `profiles.id = auth.uid()`.

---

## 10. Critical Business Logic

### Quote → Contract Conversion
1. Read quote + quote_line_items
2. INSERT `sales` with `quote_id = quote.id`, `status='PENDING'`, copy all financial fields
3. INSERT `sale_line_items` from `quote_line_items`
4. INSERT `commission_entries` based on active `commission_plan` for the department/lead_source
5. UPDATE `quotes SET status='ACCEPTED', accepted_at=NOW()`

### Auto-generate Contract Number
```sql
-- Sequence per department, formatted as "RE-0001"
contract_number = company_settings.contract_prefix || LPAD(nextval('contract_seq')::text, 4, '0')
```

### Commission Entry Generation
On sale creation (or on quote acceptance):
```
seller_commission_entry: amount = seller_markup, role = 'PRIMARY_SELLER', status = 'PENDING'
manager_commission_entry: amount = base_profit × 0.18, role = 'MANAGER', status = 'PENDING'
owner_commission_entry: amount = base_profit × 0.05, role = 'COMPANY', status = 'PENDING'
```

### Estimate PDF
Client-side only (jspdf + html2canvas). Render `EstimatePreviewDocument` to a hidden DOM node, screenshot it, attach to PDF. Include:
- Company name/logo
- Customer name + address
- Line items table
- Financing disclosure if applicable
- Subtotal / discount / tax / total
- Signature block (name, date, signature line)
- Terms & conditions

---

## 11. Env Vars Pattern (same as RE++)

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-key>     # used only in server actions / edge functions

# For deploy
CLOUDFLARE_API_TOKEN=<token>
CLOUDFLARE_ACCOUNT_ID=<id>
CLOUDFLARE_PAGES_PROJECT=roofing-experts-sales-tool
```

---

## 12. Design System

The source uses a custom Tailwind token layer. Port these exactly:

```css
/* Color tokens */
--text-primary: #f5f5f5
--text-secondary: #a1a1aa
--text-tertiary: #71717a
--text-muted: #52525b
--surface-0: #0a0a0a       /* page bg */
--surface-1: #111111       /* card bg */
--surface-2: #1a1a1a       /* input bg, hover bg */
--surface-3: #262626       /* active/selected */
--border-subtle: #27272a
--border: #3f3f46
--border-strong: #52525b
--accent: #3b82f6          /* links, primary interactive */
--status-green: #22c55e
--status-orange: #f97316
--status-red: #ef4444
--status-purple: #a855f7
--status-blue: #3b82f6
--status-teal: #14b8a6
```

Typography scale: `text-heading-lg` (2rem 700), `text-heading-sm` (1rem 600), `text-body-sm` (0.875rem 400), `text-caption` (0.75rem 400), `text-micro` (0.6875rem 500).

**Anti-AI-slop rules:**
- No centered hero with 3-card grid
- No gradient text headings
- No glassmorphism cards
- No generic "Inter + purple" aesthetic
- Status badges use ring-1 with color-tinted bg (same pattern as existing RE++ redesign)

---

## 13. File Structure (proposed)

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx              ← NavBar + Sidebar wrapper, auth guard
      page.tsx                ← Dashboard
      accounts/page.tsx
      accounts/new/page.tsx
      accounts/[id]/page.tsx
      quotes/page.tsx
      quotes/builder/page.tsx ← 6-step wizard
      quotes/[id]/page.tsx
      sales/page.tsx
      sales/[id]/page.tsx
      pipeline/page.tsx
      commissions/page.tsx
      admin/settings/
        layout.tsx            ← admin role guard + sidebar
        page.tsx
        products/page.tsx
        users/page.tsx
        departments/page.tsx
        financing/page.tsx
        lead-sources/page.tsx
        commissions/page.tsx
        workflows/page.tsx
    accept/quote/page.tsx     ← public
    globals.css
    layout.tsx
  components/
    layout/NavBar.tsx, Sidebar.tsx, PageHeader.tsx
    ui/Badge, Button, Card, CurrencyInput, Dropdown, EmptyState,
       Input, Modal, Select, Skeleton, Spinner, Table, Tabs, Textarea, Toast, Tooltip
    quotes/QuoteCart, ProductCatalog, InternalPricingTable,
            CommissionSummaryCard, EstimatePreviewDocument, QuickDiscountButtons
    contracts/PipelineBoard, WorkflowProgress, ContractStateMachine
    shared/ReassignModal
  lib/
    supabase.ts               ← singleton client (same pattern as RE++)
    contexts/QuoteBuilderContext.tsx
    hooks/useAuth.ts
    utils/format-number.ts, date.ts, cn.ts, generate-estimate-pdf.ts
  types/database.ts           ← generated Supabase types
```

---

## 14. Build Phase Priorities

Phase 2 (build) should be ordered as:

1. **Supabase schema** — run all CREATE TABLE migrations, seed default data (departments: Roofing/Siding/Gutters, default commission plan, sample products)
2. **Auth + profiles** — login page, useAuth hook, role-based route guard
3. **Dashboard** — metrics, pipeline bar, quick actions
4. **Customers (CRUD)** — accounts + contacts + properties
5. **Product catalog** (admin) — needed before quote builder
6. **Quote Builder** — 6-step wizard (most complex, ~40% of the work)
7. **Estimates list + detail** — with quote→contract conversion
8. **Contracts + Pipeline** — list, board, detail with payments
9. **Commissions** — auto-generated entries + tracker UI
10. **Admin settings** (users, departments, financing, workflows, lead sources, commission plans)
11. **PDF generation** — estimate PDF download + accept URL
12. **Deploy** — Cloudflare Pages (same deploy.sh pattern as RE++)

**Estimated total scope:** ~4,000–5,000 lines of TSX. Recommend 2–3 build sessions.

---

## 15. Recon Notes

- **localStorage data layer:** The source app used localStorage exclusively. The replica must never use localStorage for persistence — all state goes to Supabase. Only use localStorage for UI preferences (view mode toggle: list/board).
- **Real-time:** Not required for v1. Simple refetch on mutation is sufficient.
- **File uploads:** Supabase Storage for documents/photos. Bucket: `sales-tool-docs`.
- **E-signature:** Keep the base64 hash-URL pattern from the original — it works without a dedicated e-sign service.
- **Drag-and-drop pipeline board:** Use `@hello-pangea/dnd` (formerly `react-beautiful-dnd`). The source had a `PipelineBoard` component — replicate the visual pattern.
- **Multi-version quotes:** Source supports `previousVersionId` and `isLatestVersion` — include in schema, build UI for v1 (at minimum show version number).
