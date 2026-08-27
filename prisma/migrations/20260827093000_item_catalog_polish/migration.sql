ALTER TABLE `items`
  ADD COLUMN `category` VARCHAR(120) NULL,
  ADD COLUMN `subcategory` VARCHAR(120) NULL,
  ADD COLUMN `manufacturer` VARCHAR(160) NULL,
  ADD COLUMN `barcode` VARCHAR(120) NULL,
  ADD COLUMN `weight_kg` DECIMAL(12, 4) NULL,
  ADD COLUMN `image_asset_id` VARCHAR(160) NULL,
  ADD COLUMN `image_status` VARCHAR(40) NOT NULL DEFAULT 'pending';

CREATE INDEX `items_organisation_id_category_idx` ON `items`(`organisation_id`, `category`);
CREATE INDEX `items_organisation_id_barcode_idx` ON `items`(`organisation_id`, `barcode`);
