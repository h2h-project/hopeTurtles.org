# Financial OpenBooks System — Roadmap

_Drafted 2026-11-14, revised 2026-11-16 (euros, vendors, receipt/invoice documents)._
_Status: proposal, nothing below is built unless marked ✅._

## Goal

Run the Hope Turtle Project's bookkeeping on hopeturtles.org itself, in a way that can
eventually be shown to anyone. Two streams feed one ledger:

1. **Money in through Stripe** is logged automatically by the webhook, with no human step.
2. **Everything else** (cash received, bank transfers, and every expense) is logged by
   admins through an admin page: pick a vendor from a list, attach a photo of the receipt
   or invoice.

**The books are kept in euros (EUR).** Money that moves in another currency (IDR cash, a USD
invoice) is recorded in euros with its original amount and exchange rate kept alongside.

`/openbooks` then reads that ledger and publishes it, with donor identities anonymized.

Guiding rules for the whole system:

- **One ledger.** All money lives in `transactions_tb`, whatever the payment method. No
  separate cash or expense tables, so the public page and the totals come from one query.
- **Append-only once settled.** A completed row is never edited or deleted. Mistakes are
  fixed with a reversing entry that points at the original, so the public history can't
  be quietly rewritten. That is what makes the transparency believable.
- **The server decides amounts.** Stripe amounts come from Stripe's own objects, never
  from the browser. Admin entries are validated server-side.
- **Every manual row has an author.** `recorded_by` is always the logged-in admin, never
  a form field.
- **Receipts are private until published.** Receipt and invoice files never sit in a
  publicly served folder.

---

## Where we are today

| Piece | State |
|---|---|
| `transactions_tb` schema | ✅ Created by `sql/migrations/20260731_commissioning_transactions.sql` |
| Euros, vendors, receipt/invoice documents | ✅ `sql/migrations/20261116_openbooks_ledger_eur_vendors_documents.sql`, **applied to production 2026-11-19** and verified. |
| Migrations applied to `hopeturtle_db` | ✅ Both 20260731 and 20261116 (2026-11-19). |
| Stripe Checkout for contributions | ✅ Code written, charging in **EUR**: `POST /api/contributions/checkout` (`controllers/contributionsController.js`) |
| Stripe account connected (API key + webhook) | ❌ **Not yet.** `STRIPE_SECRET_KEY` is empty, so checkout answers 503. |
| Webhook → ledger row | ✅ `POST /api/stripe/webhook` → `recordStripeContribution()` in `models/transactionsModel.js` (writes `amount_eur`, so it needs the 20261116 migration) |
| Stripe fees, refunds, disputes | ❌ Not recorded. Rows hold the **gross** amount only. |
| Admin logging of cash, transfers, expenses | ❌ No model function, route or UI |
| Vendors | ❌ Table designed (`vendors_tb`); no admin UI |
| Receipts and invoices | ❌ Table designed (`transaction_documents_tb`); no upload or storage |
| `/openbooks` | ❌ Static "coming soon" page (`views/openbooks.ejs`), plus a dashboard `alert()` intercept in `public/js/dashboard.js` |
| Commission payments | ❌ Not wired to Stripe. The commission catalog prices in **EUR** (same 20261116 migration). |

---

## Phase 0 — Connect Stripe and confirm the foundation

The contribution code is written but **Stripe is not connected yet**: with
`STRIPE_SECRET_KEY` empty, `POST /api/contributions/checkout` answers 503 and no money can
move. Nothing else in this roadmap can be tested end to end until this phase is done.

Do it in this order. The table must exist before the webhook is live, or every paid
contribution's webhook answers 500 until it does.

1. **Create the ledger tables.** On production, against `hopeturtle_db`:
   - `SHOW TABLES LIKE 'transactions_tb';`. If it's missing, apply
     `sql/migrations/20260731_commissioning_transactions.sql`.
   - `SELECT COUNT(*) FROM transactions_tb;` must be 0 (see the migration's header), then
     apply `sql/migrations/20261116_openbooks_ledger_eur_vendors_documents.sql`.
   - Deploy the matching code at the same time: since 2026-11-16 the webhook writes
     `amount_eur`, which only exists after the second migration.
2. **Test-mode connection, locally.**
   - In the Stripe dashboard (test mode / sandbox), create an API key for hopeturtles.org.
   - Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Stripe CLI) to get
     a local webhook signing secret.
   - Put both in the local `.env` (`STRIPE_SECRET_KEY=sk_test_…` or `rk_test_…`,
     `STRIPE_WEBHOOK_SECRET=whsec_…`, `SITE_URL=http://localhost:3000`).
   - Make a contribution with test card `4242 4242 4242 4242` and confirm a `completed`
     row lands in the local `transactions_tb`, with `amount_eur` set.
3. **Live API key.** In live mode, create a key used **only** by hopeturtles.org (not
   earthcal's key), so either app's key can be rotated or revoked without breaking the other.
4. **Live webhook endpoint.** Add a webhook destination for
   `https://hopeturtles.org/api/stripe/webhook`, subscribed to
   `checkout.session.completed` and `checkout.session.async_payment_succeeded` (more events
   are added in Phase 2). Copy its signing secret. It is different from earthcal's.
5. **Production `.env`.** On the server (`/root/hopeturtles.org/.env`), set
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL=https://hopeturtles.org` and
   the `CONTRIBUTION_MIN_EUR`/`MAX_EUR` limits, then `pm2 restart` the app.
6. **Live smoke test.** Make a small real contribution (e.g. €1), check the webhook
   delivery shows `200` in Stripe, and that the row is in production `transactions_tb`.
   Refund it from the Stripe dashboard afterwards if wanted (it stays in the ledger until
   Phase 2 adds refund handling; reverse it by hand then).
7. **Check the Stripe account's settlement currency.** The account is shared with
   earthcal. If its balance settles in USD, every EUR charge is converted, and the fee and
   payout figures Stripe reports are in USD. Either add a EUR balance/bank account in Stripe
   (Settings → Bank accounts and currencies) or accept that Phase 2 must convert fees back to
   EUR. Decide before Phase 2.
8. **Update CLAUDE.md** to say the migrations are applied and Stripe is live.

Keys never go in git, chat, or the issue tracker: only in `.env` files on the machines
that use them.

---

## Phase 1 — Ledger schema: euros, vendors, documents

✅ **Done:** `sql/migrations/20261116_openbooks_ledger_eur_vendors_documents.sql`, tested
against a replica of production's tables and **applied to production on 2026-11-19**.
It runs once: its `ALTER TABLE` is not idempotent.

**`transactions_tb` changes**

| Column | Purpose |
|---|---|
| `amount_eur` (was `amount_usd`) | Amount in the books' currency, always positive. `direction` says in or out. |
| `type` + `'adjustment'` | Reversing entries and opening balances. |
| `payment_method` | `stripe` / `cash` / `bank_transfer` / `card` (a project card, not Stripe) / `other`. |
| `category` | `contribution`, `commission`, `materials`, `electronics`, `tools`, `shipping`, `travel`, `hosting_software`, `services`, `payment_fees`, `other`. |
| `occurred_on` | The day the money moved (`created_at` is only when it was entered). |
| `original_amount`, `original_currency`, `exchange_rate` | For non-EUR money. Rule: `amount_eur = ROUND(original_amount × exchange_rate, 2)`, so the rate is **EUR per one unit** of the original currency. All NULL for EUR. |
| `fee_eur` | Stripe's fee. Net = `amount_eur − fee_eur`. |
| `vendor_id` → `vendors_tb` | The payee, when they're a set-up vendor. |
| `counterparty` | Free-text payee for one-offs not worth a vendor record. Never used for donors. |
| `reverses_transaction_id` | Points a reversing entry at the row it cancels. |
| `stripe_refund_id` (unique) | Makes refund webhooks idempotent. |

**`vendors_tb`**: payees set up once and picked from a list when logging repeat
expenses. Each vendor carries defaults that pre-fill the expense form: `default_category`,
`default_payment_method`, `default_currency` (e.g. `IDR` for a local shop),
`default_amount` (for fixed repeating payments) and `default_description`. Also `location`,
`website` and admin-only `contact_notes`.
- **Never deleted** once a transaction uses it (the foreign key refuses). `is_active = 0`
  removes it from the picker instead.
- **`public_label`** is what OpenBooks shows instead of `name`. Use it for private
  individuals: `name = 'Wayan S.'`, `public_label = 'Local carpenter, Bali'`.

**`transaction_documents_tb`**: photos or scans of receipts and invoices, several per
transaction (`doc_type` = `receipt` / `invoice` / `other`). It holds a server-generated
`file_name`, the uploader's `original_name` (admins only), `mime_type`, `file_size_bytes`,
`is_public` (default 0), `uploaded_by` and `uploaded_at`. An invoice that isn't paid yet
hangs off a `pending` transaction. Kept separate from `photos_tb` because these files need
private storage (see Phase 3).

**Commission catalog in euros too:** `components_tb.price_eur`,
`commissions_tb.estimated_subtotal_eur` / `shipping_estimate_eur` and
`commission_items_tb.unit_price_eur` (renamed from `*_usd`). The figures keep their numbers
(the $400 Smart Turtle is now €400); they were ballpark prices, so re-price in
`components_tb` if needed. `/commission` shows €.

**Code already switched to euros** (same change): Stripe Checkout charges in `eur`, the
webhook writes `amount_eur` / `category` / `payment_method` / `occurred_on` and refuses a
non-EUR session, the contribute modal and thank-you page show €, and the limits are
`CONTRIBUTION_MIN_EUR` / `CONTRIBUTION_MAX_EUR`.

Still to do: fold the new tables into `hopeturtle_schema_v1.1.sql`.

---

## Phase 2 — Make Stripe logging complete

Today the webhook records the gross amount of a paid contribution and nothing else. To make
the books match the bank:

1. **Record fees.** On `checkout.session.completed`, retrieve the PaymentIntent with
   `expand: ['latest_charge.balance_transaction']` and store `balance_transaction.fee / 100`
   in `fee_eur`. If the balance transaction's `currency` isn't `eur` (see Phase 0, step 7),
   convert with its `exchange_rate`, never store a USD fee in `fee_eur`.
2. **Record refunds.** Subscribe to `charge.refunded` (or `refund.created`). Filter on
   `metadata.app === 'hopeturtles'` as the session handler does: the account is shared with
   earthcal. Insert a `refund` / `out` row keyed on `stripe_refund_id`, with
   `reverses_transaction_id` pointing at the original contribution, and set the original's
   `status = 'refunded'` (only on full refunds).
3. **Record async failures.** Handle `checkout.session.async_payment_failed` by logging only;
   no row is written for money that never arrived.
4. **Disputes (later).** `charge.dispute.created` / `closed`: an `adjustment` / `out` row
   when a dispute is lost, plus the dispute fee.
5. **Backfill script.** `scripts/backfill_stripe_ledger.js`: list this app's Checkout
   sessions from Stripe (filter on metadata), upsert any missing contributions, and fill in
   `fee_eur` for existing rows. Safe to re-run thanks to the unique keys. Also useful after
   any webhook outage.
6. **Keep the guardrails** already in place: `metadata.app` filter, `ht_buwana_id` (never
   `buwana_id`), no Stripe Customers, 500 on DB failure so Stripe retries.

Model functions to add in `models/transactionsModel.js`: `recordStripeRefund()`,
`setStripeFee()`.

---

## Phase 3 — Admin logging of expenses and offline income

### Routes

| Route | Guard | Purpose |
|---|---|---|
| `GET /admin/openbooks` | `ensureAuth, ensureAdmin` | Ledger table with filters + "Log transaction" button |
| `GET /admin/openbooks/new` | same | Form |
| `POST /api/openbooks/transactions` | same | Create a manual row (+ receipts, multipart) |
| `POST /api/openbooks/transactions/:id/reverse` | same | Create a reversing entry with a required reason |
| `PATCH /api/openbooks/transactions/:id` | same | Edit, **only while `status = 'pending'`** |
| `GET /admin/openbooks/documents/:documentId` | same (or public if `is_public`) | Stream a receipt/invoice file |
| `POST /api/openbooks/transactions/:id/documents` | same | Attach more receipts/invoices to an existing row |
| `GET /admin/openbooks/vendors` | same | Vendor list: add, edit, deactivate |
| `POST /api/openbooks/vendors`, `PATCH /api/openbooks/vendors/:id` | same | Create / edit a vendor (no DELETE) |
| `GET /api/openbooks/vendors?active=1` | same | Picker data for the expense form, defaults included |

Files: `routes/api/openbooks.js`, `controllers/openbooksController.js`,
`views/admin-openbooks.ejs`, `views/admin-openbooks-form.ejs`, `views/admin-vendors.ejs`,
`public/js/admin-openbooks.js`, `models/vendorsModel.js`, `models/transactionDocumentsModel.js`.

### The form

- **Kind:** Expense · Cash contribution · Bank-transfer contribution · Other income.
  The server derives `type`, `direction` and `payment_method` from this; the client never
  sends them directly.
- **Date** (`occurred_on`, required, not in the future).
- **Vendor** (expenses): a searchable picker over active vendors, first on the form.
  Choosing one pre-fills category, payment method, currency, amount and description from
  its defaults; the admin can still change any of them. A "+ New vendor" link opens a small
  inline dialog so a new payee doesn't mean leaving the form. For a true one-off, "Other
  payee" reveals the free-text `counterparty` field instead.
- **Amount + currency.** EUR by default (or the vendor's default currency). For any other
  currency, show an exchange-rate field (EUR per 1 unit) and a live "≈ €x.xx" preview;
  the server recomputes `amount_eur = ROUND(original_amount × exchange_rate, 2)` itself.
  Pre-fill the rate from the vendor's last transaction, or a rates API later.
- **Category** (required for expenses).
- Contributions don't get a free-text donor name field, so personal details never end up in
  a public column. Instead the admin can optionally link a `buwana_id` if the donor has an
  account, and that is never shown publicly.
- **Description** (required, public-facing: write it for the public).
- **Receipts / invoices**: one or more photos or PDFs, each marked receipt or invoice.
  On phones the file input opens the camera (`accept="image/*,application/pdf"`, with a
  `capture` option), so an admin can photograph a cash receipt at the till. Required for
  expenses over a threshold (e.g. €20), optional below. Per-file "publish on OpenBooks"
  checkbox, off by default.
- **Show on OpenBooks** (`is_public`, default on). Turning it off requires a reason in the
  description, and the public page still shows the row count of hidden entries so nothing
  vanishes silently.

### Server rules

- `recorded_by` = `req.session.user` buwana ID. Validate amount > 0, max 2 decimals, sane
  upper bound, valid date, enum membership, ISO currency code, exchange rate > 0 whenever a
  non-EUR currency is given, and that `vendor_id` (if any) exists and is active.
- Documents can still be **added** to a completed row (receipts often arrive later) but not
  removed; a wrong upload is hidden by an admin (`is_public = 0`) and noted, not deleted.
- Manual rows are created as `completed` (money already moved), or `pending` if the admin
  ticks "awaiting confirmation". Once completed, the row is locked.
- **Reversal** creates an `adjustment` row with the opposite `direction`, same amount,
  `reverses_transaction_id` set, `recorded_by` the reversing admin, and the reason in
  `description`. The original stays visible, marked "reversed".
- **No DELETE endpoint.**

### Receipt and invoice storage

`public/uploads/` is served statically, so these files must **not** go there: they often show
names, addresses or partial card numbers. Store them under a non-served directory (e.g.
`storage/transaction_documents/`, git-ignored, created on boot) with server-generated file names, and
serve them through the guarded route above. Accept only JPEG/PNG/WebP/PDF, cap size
(e.g. 10 MB), check the real file type, not just the extension. Downscale large phone
photos (and strip their EXIF/GPS data) before saving; `sharp` is a reasonable choice. The production deploy needs
this directory to persist across `git pull` (add to the deploy notes).

---

## Phase 4 — Admin ledger view & reconciliation

`/admin/openbooks` should let an admin trust the numbers before the public sees them:

- Filterable table (date range, kind, method, category, vendor, status, public/hidden),
  running balance, totals in / out / net / fees, all in EUR.
- **Per-vendor view:** spend per vendor over a period, and expenses missing a receipt.
- **Reconciliation helpers:**
  - Stripe: compare the ledger's Stripe net total for a period against Stripe payouts
    (`stripe.payouts.list`). Flag differences.
  - Cash: an "opening balance" `adjustment` row when the system goes live, so the running
    balance matches the real cash box and bank.
- **Audit trail:** each row shows who recorded it and when, and any reversal links.
- CSV export of the filtered view.
- Optional, later: second-admin approval for expenses above a threshold
  (`approved_by`, `approved_at` columns).

---

## Phase 5 — Public `/openbooks`

Replace the placeholder with the real ledger. Public, no login.

- **Summary band:** total raised, total spent, current balance, Stripe fees paid,
  spending by category (bar or donut; follow the dataviz conventions).
- **Transaction list:** date, kind, category, payee (vendor `public_label` or name),
  description, amount (EUR, plus the original currency and rate when present), method, receipt link when published, and "reversed" markers that
  link to the correcting entry.
- **Anonymization at the display layer.** Contributions show as "Contribution" plus
  method; never a name, email or buwana ID. A future opt-in "credit me publicly" flag can
  change that per donor. Expenses do show the payee.
- Query only `is_public = 1`, and show a line like "3 entries are not public (internal fee
  reconciliations)" so hidden rows are acknowledged.
- Monthly grouping and a period picker; CSV/JSON download of the public data
  (`GET /api/openbooks/public`), because transparency means people can check the totals
  themselves.
- Remove the `data-openbooks-notice` intercept in `public/js/dashboard.js`.
- i18n: new strings in `locales/en.json` first, then the other locales.

---

## Phase 6 — Reporting

- Monthly / annual summary page and PDF (in, out, by category, balance), suitable for
  partners and grant reports.
- Year-end export for the project's accountant.
- Optional: a monthly email or alert to admins with the period's summary and any
  unreceipted expenses.

---

## Phase 7 — Commission payments (depends on `/commission` going live)

When the commission flow is wired to `commissions_tb`, its Stripe Checkout sessions use
`metadata.kind = 'commission'` and `metadata.ht_commission_id`. The same webhook writes
`commission_payment` rows linked by `commission_id`, with the same fee and refund handling
as Phase 2. Nothing new is needed in the ledger itself; the commission catalog is already
in euros.

---

## Suggested order

| Step | Phase | Size | Notes |
|---|---|---|---|
| 1 | 0 | S | Apply the migration, connect Stripe (test, then live), smoke-test. Blocks everything else. |
| 2 | 1 | ✅ | Schema migration (euros, vendors, documents), applied to production 2026-11-19 |
| 3 | 3 | M | Vendor admin, expense/cash logging, receipt/invoice uploads. The big usability win. |
| 4 | 2 | M | Stripe fees + refunds + backfill script |
| 5 | 4 | S–M | Admin ledger view, opening balance, CSV |
| 6 | 5 | M | Public OpenBooks |
| 7 | 6 | S | Reports |
| 8 | 7 | — | With the commission build |

Admin logging comes before Stripe fees because expenses are currently recorded nowhere,
whereas Stripe already keeps its own history that can be backfilled later.

---

## Open questions

1. **Who counts as an admin for the books?** Everyone `isAdminRole()` accepts, or a
   narrower "treasurer" role?
2. **Receipt publishing default.** Proposed: private unless ticked. Should expense
   receipts be public by default, with redaction expected?
3. **Currencies.** ✅ EUR is the books' currency. Still open: which local currencies come up
   (IDR, USD, others), and where exchange rates come from (manual entry, the bank's rate on
   the day, or a rates API)?
4. **Stripe settlement currency.** Does the shared Stripe account have a EUR balance, or
   does everything settle in USD? (Phase 0, step 7.)
5. **Commission prices.** ✅ Moved to euros, same numbers. Still open: are the ballpark
   prices (Simple €250, Smart €400, add-ons, €20 shipping) right in euros?
6. **Opening balance.** What cash and bank balances exist today that the ledger should
   start from, and from what date?
7. **Approval.** Is a second-admin approval step wanted for larger expenses, and above
   what amount?
8. **Donor credit.** Should contributors be able to opt in to being named publicly?
9. **Legal/accounting.** Does the project's legal entity or accountant need specific
   categories (e.g. matching a chart of accounts or grant-reporting codes)? Worth asking
   before the migration is applied, since changing the category ENUM later needs another
   migration.
