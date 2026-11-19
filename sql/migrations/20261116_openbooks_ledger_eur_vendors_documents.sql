-- ------------------------------------------------------------
-- OpenBooks ledger, v2: euros, vendors, receipt/invoice documents
-- ------------------------------------------------------------
-- Builds on 20260731_commissioning_transactions.sql, which must be applied
-- FIRST (it creates transactions_tb). See
-- docs/financial_open_books_system_roadmap.md, Phases 0–1.
--
-- What this does:
--   1. Euros become the books' currency. transactions_tb.amount_usd is
--      renamed amount_eur. Money that moved in another currency (IDR cash,
--      a USD invoice, ...) keeps its original figure and the rate used in
--      original_amount / original_currency / exchange_rate.
--   2. vendors_tb: payees admins set up once and pick from a list when
--      logging repeat expenses (cash or otherwise).
--   3. transaction_documents_tb: photos/scans of receipts and invoices.
--   4. The rest of the ledger columns the roadmap's Phase 1 calls for:
--      payment_method, category, occurred_on, fee_eur, reversals, refunds.
--   5. The commission catalog moves to euros too: components_tb.price_usd,
--      commissions_tb.estimated_subtotal_usd / shipping_estimate_usd and
--      commission_items_tb.unit_price_usd become *_eur. The figures keep
--      their numbers (the $400 Smart Turtle becomes €400): they were
--      ballpark prices, not converted ones. Re-price in components_tb if
--      needed. Any commissions already saved keep their snapshot numbers,
--      now read as euros.
--
-- PRECONDITION: transactions_tb holds no USD rows. Stripe was not connected
-- when this was written, so it should be empty. Check before running:
--     SELECT COUNT(*) FROM transactions_tb;
-- If that is not 0, stop: those rows are in USD and need converting (set
-- original_amount = amount_usd, original_currency = 'USD', exchange_rate,
-- and amount_eur) rather than just relabelling.
--
-- RUN ONCE. MySQL commits each ALTER as it goes, so this is not atomic and
-- not re-runnable: if it stops partway, check which statements landed
-- (SHOW CREATE TABLE ...) and run only the rest. Take a backup first.
--
-- DEPLOY TOGETHER with the code from the same change (contributions,
-- commissions): the old code reads *_usd and the new code *_eur, so
-- /commission and the Stripe webhook break while the two disagree.
-- ------------------------------------------------------------

-- VENDORS TABLE ------------------------------------------------------------
-- Who the project pays. Admins create a vendor once (hardware shop, timber
-- yard, hosting provider, boat operator ...) and then pick it from a list
-- when logging an expense; the defaults below pre-fill the form.
--
-- Vendors are never deleted once a transaction references them (FK is
-- RESTRICT); set is_active = 0 to drop one from the picker instead.
--
-- Privacy: OpenBooks shows public_label if set, otherwise name. Use
-- public_label for private individuals (e.g. name = 'Wayan S.',
-- public_label = 'Local carpenter, Bali'). contact_notes is admin-only.
CREATE TABLE IF NOT EXISTS `vendors_tb` (
  `vendor_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(160) NOT NULL,
  `public_label` VARCHAR(160) DEFAULT NULL,
  `default_category` ENUM(
      'materials','electronics','tools','shipping','travel',
      'hosting_software','services','payment_fees','other'
  ) DEFAULT NULL,
  `default_payment_method` ENUM('cash','bank_transfer','card','other') DEFAULT NULL,
  -- Currency this vendor normally bills in (ISO 4217), e.g. 'IDR' for a
  -- local shop. The form pre-selects it and asks for an exchange rate.
  `default_currency` CHAR(3) NOT NULL DEFAULT 'EUR',
  -- For fixed repeating payments (rent, a monthly subscription). Optional.
  `default_amount` DECIMAL(14,2) DEFAULT NULL,
  `default_description` VARCHAR(255) DEFAULT NULL,
  `location` VARCHAR(160) DEFAULT NULL,
  `website` VARCHAR(255) DEFAULT NULL,
  `contact_notes` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vendor_id`),
  UNIQUE KEY `uq_vendor_name` (`name`),
  KEY `is_active` (`is_active`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `vendors_created_by_fk` FOREIGN KEY (`created_by`)
      REFERENCES `users_tb`(`buwana_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TRANSACTIONS TABLE: euros + ledger columns --------------------------------
ALTER TABLE `transactions_tb`
  -- The amount in the books' currency. Always EUR, always positive;
  -- `direction` says whether it came in or went out.
  CHANGE COLUMN `amount_usd` `amount_eur` DECIMAL(12,2) NOT NULL,

  MODIFY `type` ENUM('contribution','commission_payment','expense','refund','adjustment') NOT NULL,

  -- How the money moved. 'card' = paid with a project card (not Stripe).
  ADD COLUMN `payment_method` ENUM('stripe','cash','bank_transfer','card','other')
      NOT NULL DEFAULT 'stripe' AFTER `direction`,

  -- What the money was for. Drives the OpenBooks breakdown.
  ADD COLUMN `category` ENUM(
      'contribution','commission',
      'materials','electronics','tools','shipping','travel',
      'hosting_software','services','payment_fees','other'
  ) DEFAULT NULL AFTER `type`,

  -- The day the money actually moved. created_at is only when it was entered.
  ADD COLUMN `occurred_on` DATE DEFAULT NULL AFTER `amount_eur`,

  -- When the money moved in another currency. Rule:
  --   amount_eur = ROUND(original_amount * exchange_rate, 2)
  -- so exchange_rate is EUR per one unit of original_currency
  -- (e.g. IDR: ~0.0000580). All three NULL when the money moved in EUR.
  ADD COLUMN `original_amount` DECIMAL(14,2) DEFAULT NULL AFTER `occurred_on`,
  ADD COLUMN `original_currency` CHAR(3) DEFAULT NULL AFTER `original_amount`,
  ADD COLUMN `exchange_rate` DECIMAL(18,10) DEFAULT NULL AFTER `original_currency`,

  -- Stripe's processing fee on this payment, in EUR. Net = amount_eur - fee_eur.
  ADD COLUMN `fee_eur` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `exchange_rate`,

  -- Payee. vendor_id for anyone in vendors_tb; counterparty (free text)
  -- for one-off payees not worth a vendor record. Donor names never go here.
  ADD COLUMN `vendor_id` BIGINT UNSIGNED DEFAULT NULL AFTER `commission_id`,
  ADD COLUMN `counterparty` VARCHAR(160) DEFAULT NULL AFTER `vendor_id`,

  -- Corrections: completed rows are never edited. A reversing 'adjustment'
  -- row points at the row it cancels.
  ADD COLUMN `reverses_transaction_id` BIGINT UNSIGNED DEFAULT NULL AFTER `counterparty`,

  -- Stripe refund ID, so a re-delivered refund webhook can't double-record.
  ADD COLUMN `stripe_refund_id` VARCHAR(255) DEFAULT NULL AFTER `stripe_payment_intent_id`,

  ADD KEY `occurred_on` (`occurred_on`),
  ADD KEY `payment_method` (`payment_method`),
  ADD KEY `category` (`category`),
  ADD KEY `vendor_id` (`vendor_id`),
  ADD KEY `reverses_transaction_id` (`reverses_transaction_id`),
  ADD UNIQUE KEY `uq_transactions_stripe_refund` (`stripe_refund_id`),
  ADD CONSTRAINT `transactions_vendor_fk` FOREIGN KEY (`vendor_id`)
      REFERENCES `vendors_tb`(`vendor_id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `transactions_reverses_fk` FOREIGN KEY (`reverses_transaction_id`)
      REFERENCES `transactions_tb`(`transaction_id`) ON DELETE RESTRICT;

-- Fill the new columns on any existing (Stripe contribution) rows.
UPDATE `transactions_tb`
   SET `category` = 'contribution'
 WHERE `type` = 'contribution' AND `category` IS NULL;
UPDATE `transactions_tb`
   SET `occurred_on` = DATE(`created_at`)
 WHERE `occurred_on` IS NULL;

-- TRANSACTION DOCUMENTS TABLE ------------------------------------------------
-- Photos/scans of receipts and invoices (JPEG, PNG, WebP or PDF), several per
-- transaction allowed (e.g. an invoice and its payment receipt). An invoice
-- that hasn't been paid yet hangs off a `pending` transaction.
--
-- Deliberately separate from photos_tb: these files can show names,
-- addresses, tax IDs or partial card numbers, so they are stored OUTSIDE
-- public/ (which Express serves statically) and are streamed through an
-- admin-guarded route. is_public = 1 lets an admin publish one (ideally a
-- redacted copy) on OpenBooks.
CREATE TABLE IF NOT EXISTS `transaction_documents_tb` (
  `document_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_id` BIGINT UNSIGNED NOT NULL,
  `doc_type` ENUM('receipt','invoice','other') NOT NULL DEFAULT 'receipt',
  -- Server-generated name on disk. Never the uploader's file name.
  `file_name` VARCHAR(255) NOT NULL,
  -- The uploader's original file name, for admins only.
  `original_name` VARCHAR(255) DEFAULT NULL,
  `mime_type` VARCHAR(80) NOT NULL,
  `file_size_bytes` INT UNSIGNED NOT NULL,
  `is_public` TINYINT(1) NOT NULL DEFAULT 0,
  `uploaded_by` INT DEFAULT NULL,
  `uploaded_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  UNIQUE KEY `uq_document_file_name` (`file_name`),
  KEY `transaction_id` (`transaction_id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `documents_transaction_fk` FOREIGN KEY (`transaction_id`)
      REFERENCES `transactions_tb`(`transaction_id`) ON DELETE RESTRICT,
  CONSTRAINT `documents_uploaded_by_fk` FOREIGN KEY (`uploaded_by`)
      REFERENCES `users_tb`(`buwana_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COMMISSION CATALOG: euros ------------------------------------------------
-- Same numbers, new currency (see header, point 5).
ALTER TABLE `components_tb`
  CHANGE COLUMN `price_usd` `price_eur` DECIMAL(8,2) NOT NULL DEFAULT 0.00;

ALTER TABLE `commissions_tb`
  CHANGE COLUMN `estimated_subtotal_usd` `estimated_subtotal_eur` DECIMAL(8,2) DEFAULT NULL,
  CHANGE COLUMN `shipping_estimate_usd` `shipping_estimate_eur` DECIMAL(6,2) NOT NULL DEFAULT 20.00;

-- unit_price_eur snapshots components_tb.price_eur at commission time.
ALTER TABLE `commission_items_tb`
  CHANGE COLUMN `unit_price_usd` `unit_price_eur` DECIMAL(8,2) NOT NULL;
