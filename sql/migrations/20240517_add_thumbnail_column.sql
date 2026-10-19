-- Adds thumbnail_url support for turtle profile photos gg
ALTER TABLE `photos_tb`
  ADD COLUMN `thumbnail_url` VARCHAR(255) NULL AFTER `url`;
