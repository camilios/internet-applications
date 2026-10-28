import { DatabaseConfig, config } from '../config';
import { closePool, getPool } from './pool';

const migrationStatements = [
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    total_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    reserved_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_inventory_items_product_id (product_id),
    CONSTRAINT chk_inventory_total_non_negative CHECK (total_quantity >= 0),
    CONSTRAINT chk_inventory_reserved_non_negative CHECK (reserved_quantity >= 0),
    CONSTRAINT chk_inventory_reserved_not_exceeds_total CHECK (reserved_quantity <= total_quantity)
  ) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS reservations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    idempotency_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'confirmed',
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_reservations_reservation_id (reservation_id),
    UNIQUE KEY uq_reservations_idempotency_key (idempotency_key),
    KEY idx_reservations_status (status),
    CONSTRAINT chk_reservations_status CHECK (status IN ('confirmed', 'released', 'expired'))
  ) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS reservation_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reservation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_reservation_items_reservation_product (reservation_id, product_id),
    CONSTRAINT chk_reservation_item_quantity_positive CHECK (quantity > 0),
    CONSTRAINT fk_reservation_items_reservation
      FOREIGN KEY (reservation_id) REFERENCES reservations (reservation_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export async function migrate(databaseConfig: DatabaseConfig = config.db): Promise<void> {
  const pool = getPool(databaseConfig);
  console.log('Running MySQL inventory database migration...');

  try {
    for (const statement of migrationStatements) {
      await pool.query(statement);
    }
    console.log('MySQL inventory database migration completed successfully.');
  } catch (error) {
    console.error('MySQL inventory database migration failed.');
    throw error;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
