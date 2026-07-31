-- ------------------------------------------------------------
-- 🐢 Contributions, Commissioning & OpenBooks: schema draft
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Backs the three /dashboard action panels documented in CLAUDE.md under
-- "Contributions, Commissioning & OpenBooks": Make a Contribution,
-- Manifest a Turtle (/commission), and Our OpenBooks (/openbooks). All three
-- routes currently render UI-only placeholders (views/commission.ejs,
-- views/openbooks.ejs) against sample data — nothing here is wired up to
-- the app yet. This migration is the draft to build that wiring against.
--
-- Five tables, created in dependency order:
--   1. components_tb      — single catalog for everything a turtle can be
--                            built from: turtle base models, foodstuffs,
--                            electronics add-ons, and engraving messages.
--   2. commissions_tb      — one row per user's turtle build (the "Save" /
--                            "Commission" flow on /commission). A header
--                            row; the actual foodstuff/add-on picks live in...
--   3. commission_items_tb — ...line items against components_tb, so a
--                            commission's picks stay queryable (e.g. "how
--                            many coffee bottles shipped this month") rather
--                            than buried in a JSON blob.
--   4. transactions_tb     — the OpenBooks ledger: every contribution,
--                            commission payment, expense, and refund. A
--                            commission can have more than one transaction
--                            (deposit + balance, or a refund), so the FK
--                            points from transactions_tb to commissions_tb,
--                            not the other way — avoids a circular FK and
--                            matches "one commission, many payments."
--
-- Deliberately NOT built as part of this migration (follow-up work once the
-- app-side wiring lands): Stripe webhook handling, admin CRUD for
-- components_tb, and the real /openbooks query. See CLAUDE.md.
-- ------------------------------------------------------------

-- COMPONENTS TABLE ------------------------------------------------------------
-- Catalog for the turtle-builder (/commission) and any future admin pricing
-- UI. `category` distinguishes what a row is for; `key_name` is a stable
-- slug the app can reference in code (e.g. category='turtle_base',
-- key_name='smart') without hardcoding component_id values.
CREATE TABLE IF NOT EXISTS `components_tb` (
  `component_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category` ENUM('turtle_base','foodstuff','electronics_addon','engraving') NOT NULL,
  `key_name` VARCHAR(60) NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `description` TEXT,
  `price_usd` DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  -- NULL = unlimited/always available. 0 = out of stock. N = limited stock.
  `stock_quantity` INT DEFAULT NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` SMALLINT NOT NULL DEFAULT 0,
  -- Points into the existing polymorphic photos_tb (related_type='component').
  -- Nullable and denormalized here purely so the catalog list query doesn't
  -- need a join to find each component's primary photo.
  `photo_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`component_id`),
  KEY `photo_id` (`photo_id`),
  KEY `category_available` (`category`, `is_available`),
  UNIQUE KEY `uq_component_category_key` (`category`, `key_name`),
  CONSTRAINT `components_photo_fk` FOREIGN KEY (`photo_id`) REFERENCES `photos_tb`(`photo_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COMMISSIONS TABLE ------------------------------------------------------------
-- One row per turtle build a user has configured. `status` carries it from
-- the "Save" button (draft, no payment) through "Commission" (submitted,
-- awaiting/confirmed payment via transactions_tb) to fulfillment. Once a
-- physical turtle is registered against this build, `turtle_id` links it —
-- nullable because most commissions won't have a matching turtles_tb row
-- until it's actually launched (see routes/web.js "Launch Turtle").
CREATE TABLE IF NOT EXISTS `commissions_tb` (
  `commission_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `buwana_id` INT NOT NULL,
  `mission_id` BIGINT UNSIGNED DEFAULT NULL,
  `deployment_type` ENUM('flotilla','self') NOT NULL DEFAULT 'flotilla',
  `turtle_base_component_id` BIGINT UNSIGNED DEFAULT NULL,
  `engraving_component_id` BIGINT UNSIGNED DEFAULT NULL,
  `status` ENUM('draft','submitted','in_production','fulfilled','cancelled') NOT NULL DEFAULT 'draft',
  -- Snapshot of the estimate shown to the user at Save/Commission time, so a
  -- later catalog price change never rewrites what they were quoted.
  `estimated_subtotal_usd` DECIMAL(8,2) DEFAULT NULL,
  `shipping_estimate_usd` DECIMAL(6,2) NOT NULL DEFAULT 20.00,
  `turtle_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`commission_id`),
  KEY `buwana_id` (`buwana_id`),
  KEY `mission_id` (`mission_id`),
  KEY `turtle_base_component_id` (`turtle_base_component_id`),
  KEY `engraving_component_id` (`engraving_component_id`),
  KEY `turtle_id` (`turtle_id`),
  KEY `status` (`status`),
  CONSTRAINT `commissions_user_fk` FOREIGN KEY (`buwana_id`) REFERENCES `users_tb`(`buwana_id`) ON DELETE CASCADE,
  CONSTRAINT `commissions_mission_fk` FOREIGN KEY (`mission_id`) REFERENCES `missions_tb`(`mission_id`) ON DELETE SET NULL,
  CONSTRAINT `commissions_turtle_base_fk` FOREIGN KEY (`turtle_base_component_id`) REFERENCES `components_tb`(`component_id`) ON DELETE SET NULL,
  CONSTRAINT `commissions_engraving_fk` FOREIGN KEY (`engraving_component_id`) REFERENCES `components_tb`(`component_id`) ON DELETE SET NULL,
  CONSTRAINT `commissions_turtle_fk` FOREIGN KEY (`turtle_id`) REFERENCES `turtles_tb`(`turtle_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- COMMISSION ITEMS TABLE ------------------------------------------------------------
-- Line items for a commission's foodstuff picks (one per food bottle,
-- `bottle_slot` numbering them) and control-bottle electronics add-ons
-- (`bottle_slot` NULL — they apply to the build as a whole, not a bottle).
-- `unit_price_usd` snapshots components_tb.price_usd at commission time.
CREATE TABLE IF NOT EXISTS `commission_items_tb` (
  `commission_item_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `commission_id` BIGINT UNSIGNED NOT NULL,
  `component_id` BIGINT UNSIGNED NOT NULL,
  `bottle_slot` TINYINT UNSIGNED DEFAULT NULL,
  `quantity` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price_usd` DECIMAL(8,2) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`commission_item_id`),
  KEY `commission_id` (`commission_id`),
  KEY `component_id` (`component_id`),
  CONSTRAINT `commission_items_commission_fk` FOREIGN KEY (`commission_id`) REFERENCES `commissions_tb`(`commission_id`) ON DELETE CASCADE,
  CONSTRAINT `commission_items_component_fk` FOREIGN KEY (`component_id`) REFERENCES `components_tb`(`component_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TRANSACTIONS TABLE ------------------------------------------------------------
-- The OpenBooks ledger. Every dollar in or out gets a row here — general
-- contributions, commission payments/deposits, manually-logged expenses,
-- and refunds. `is_public` lets an admin keep a processor-fee reconciliation
-- entry off the public /openbooks view without deleting it; it does not
-- gate a donor's identity, which the OpenBooks view should anonymize at the
-- display layer regardless.
CREATE TABLE IF NOT EXISTS `transactions_tb` (
  `transaction_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `buwana_id` INT DEFAULT NULL,
  `type` ENUM('contribution','commission_payment','expense','refund') NOT NULL,
  `direction` ENUM('in','out') NOT NULL,
  `amount_usd` DECIMAL(10,2) NOT NULL,
  `status` ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  `commission_id` BIGINT UNSIGNED DEFAULT NULL,
  `stripe_payment_intent_id` VARCHAR(255) DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `recorded_by` INT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`transaction_id`),
  KEY `buwana_id` (`buwana_id`),
  KEY `commission_id` (`commission_id`),
  KEY `recorded_by` (`recorded_by`),
  KEY `type_status` (`type`, `status`),
  UNIQUE KEY `uq_transactions_stripe_intent` (`stripe_payment_intent_id`),
  CONSTRAINT `transactions_user_fk` FOREIGN KEY (`buwana_id`) REFERENCES `users_tb`(`buwana_id`) ON DELETE SET NULL,
  CONSTRAINT `transactions_commission_fk` FOREIGN KEY (`commission_id`) REFERENCES `commissions_tb`(`commission_id`) ON DELETE SET NULL,
  CONSTRAINT `transactions_recorded_by_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users_tb`(`buwana_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend the polymorphic photo ENUM to cover component catalog photos.
-- Uses MODIFY (not DROP+ADD) so all existing values are preserved as-is.
ALTER TABLE `photos_tb`
  MODIFY `related_type` ENUM('turtle','bottle','success','mission','hub',
                              'ecojoiner_bottle_profile','ecojoiner_design',
                              'component') NOT NULL;

-- Seed the catalog with the sample options views/commission.ejs currently
-- hardcodes, so switching the front end from mock data to a real query is a
-- drop-in swap. Prices match the ballpark figures already shown to users.
INSERT IGNORE INTO `components_tb` (`category`, `key_name`, `label`, `description`, `price_usd`, `sort_order`) VALUES
  ('turtle_base', 'simple', 'Simple Turtle', 'Six food bottles, no command bottle or electronics.', 250.00, 1),
  ('turtle_base', 'smart', 'Smart Turtle', 'Five food bottles plus a command bottle carrying the onboard electronics.', 400.00, 2),
  ('foodstuff', 'coffee', 'Coffee', NULL, 8.00, 1),
  ('foodstuff', 'tea', 'Tea', NULL, 6.00, 2),
  ('foodstuff', 'chickpeas', 'Chickpeas', NULL, 5.00, 3),
  ('foodstuff', 'lentils', 'Lentils', NULL, 5.00, 4),
  ('foodstuff', 'rice', 'Rice', NULL, 4.00, 5),
  ('foodstuff', 'milk_powder', 'Milk powder', NULL, 9.00, 6),
  ('foodstuff', 'baby_food_powder', 'Baby food powder', NULL, 12.00, 7),
  ('electronics_addon', 'core_package', 'Turtle Microcontroller Package', 'Core electronics: XIAO ESP32-S3, GPS unit, and the rest of the turtleOS hardware stack. Required for every Smart Turtle.', 85.00, 1),
  ('electronics_addon', 'cell_internet', 'Onboard Cell Internet', 'A cellular modem for telemetry when out of wifi or LoRa range.', 35.00, 2),
  ('electronics_addon', 'mesh_lora', 'Mesh LoRa Connectivity', 'Long-range mesh radio for turtle-to-turtle and hub relay.', 45.00, 3),
  ('electronics_addon', 'mother_storage', 'Mother Turtle Storage', 'Expanded onboard storage so this turtle can log and relay data from others nearby.', 60.00, 4),
  ('engraving', 'sent_with_hope', 'Sent with Hope', NULL, 0.00, 1),
  ('engraving', 'sea_to_sea', 'From Sea to Sea', NULL, 0.00, 2),
  ('engraving', 'currents_of_care', 'Carried by Currents, Delivered by Care', NULL, 0.00, 3),
  ('engraving', 'hope_floats', 'Hope Floats', NULL, 0.00, 4),
  ('engraving', 'human_to_human', 'Human to Human', NULL, 0.00, 5);
