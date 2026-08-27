CREATE TABLE `packing_lists` (
  `id` CHAR(36) NOT NULL,
  `organisation_id` CHAR(36) NOT NULL,
  `invoice_id` CHAR(36) NULL,
  `company_id` CHAR(36) NULL,
  `buyer_id` CHAR(36) NULL,
  `consignee_buyer_id` CHAR(36) NULL,
  `status` ENUM('draft', 'issued', 'cancelled') NOT NULL DEFAULT 'draft',
  `packing_list_number` VARCHAR(120) NULL,
  `sequence_number` INTEGER NULL,
  `packing_list_date` DATE NOT NULL,
  `export_reference` VARCHAR(120) NULL,
  `container_number` VARCHAR(120) NULL,
  `seal_number` VARCHAR(120) NULL,
  `shipment_mode` VARCHAR(80) NULL,
  `port_of_loading` VARCHAR(120) NULL,
  `port_of_discharge` VARCHAR(120) NULL,
  `final_destination` VARCHAR(120) NULL,
  `total_packages` INTEGER NOT NULL DEFAULT 0,
  `total_quantity` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `total_net_weight_kg` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `total_gross_weight_kg` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `total_volume_cbm` DECIMAL(18, 6) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_by_id` CHAR(36) NOT NULL,
  `updated_by_id` CHAR(36) NULL,
  `issued_by_id` CHAR(36) NULL,
  `issued_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `packing_lists_organisation_id_packing_list_number_key`(`organisation_id`, `packing_list_number`),
  INDEX `packing_lists_organisation_id_status_packing_list_date_idx`(`organisation_id`, `status`, `packing_list_date`),
  INDEX `packing_lists_organisation_id_invoice_id_idx`(`organisation_id`, `invoice_id`),
  INDEX `packing_lists_company_id_idx`(`company_id`),
  INDEX `packing_lists_buyer_id_idx`(`buyer_id`),
  INDEX `packing_lists_consignee_buyer_id_idx`(`consignee_buyer_id`),
  INDEX `packing_lists_created_by_id_idx`(`created_by_id`),
  INDEX `packing_lists_updated_by_id_idx`(`updated_by_id`),
  INDEX `packing_lists_issued_by_id_idx`(`issued_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `packing_list_lines` (
  `id` CHAR(36) NOT NULL,
  `organisation_id` CHAR(36) NOT NULL,
  `packing_list_id` CHAR(36) NOT NULL,
  `item_id` CHAR(36) NULL,
  `invoice_item_id` CHAR(36) NULL,
  `sort_order` INTEGER NOT NULL,
  `package_no` VARCHAR(80) NULL,
  `marks_and_numbers` VARCHAR(160) NULL,
  `sku` VARCHAR(80) NULL,
  `description` TEXT NOT NULL,
  `hsn_sac` VARCHAR(20) NULL,
  `quantity` DECIMAL(18, 4) NOT NULL,
  `unit_code` VARCHAR(20) NULL,
  `net_weight_kg` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `gross_weight_kg` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  `length_cm` DECIMAL(12, 4) NULL,
  `width_cm` DECIMAL(12, 4) NULL,
  `height_cm` DECIMAL(12, 4) NULL,
  `volume_cbm` DECIMAL(18, 6) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `packing_list_lines_organisation_id_packing_list_id_sort_order_idx`(`organisation_id`, `packing_list_id`, `sort_order`),
  INDEX `packing_list_lines_organisation_id_invoice_item_id_idx`(`organisation_id`, `invoice_item_id`),
  INDEX `packing_list_lines_packing_list_id_idx`(`packing_list_id`),
  INDEX `packing_list_lines_item_id_idx`(`item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_organisation_id_fkey` FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `buyers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_consignee_buyer_id_fkey` FOREIGN KEY (`consignee_buyer_id`) REFERENCES `buyers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `packing_lists` ADD CONSTRAINT `packing_lists_issued_by_id_fkey` FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `packing_list_lines` ADD CONSTRAINT `packing_list_lines_organisation_id_fkey` FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `packing_list_lines` ADD CONSTRAINT `packing_list_lines_packing_list_id_fkey` FOREIGN KEY (`packing_list_id`) REFERENCES `packing_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `packing_list_lines` ADD CONSTRAINT `packing_list_lines_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `packing_list_lines` ADD CONSTRAINT `packing_list_lines_invoice_item_id_fkey` FOREIGN KEY (`invoice_item_id`) REFERENCES `invoice_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
