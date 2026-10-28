import { getPool, closePool } from './pool';

const products = [
  { product_id: 1, total_quantity: 50 },
  { product_id: 2, total_quantity: 30 },
  { product_id: 3, total_quantity: 100 },
  { product_id: 4, total_quantity: 25 },
  { product_id: 5, total_quantity: 10 },
  { product_id: 6, total_quantity: 75 },
  { product_id: 7, total_quantity: 200 },
  { product_id: 8, total_quantity: 15 },
  { product_id: 9, total_quantity: 5 },
  { product_id: 10, total_quantity: 60 },
  { product_id: 11, total_quantity: 40 },
  { product_id: 12, total_quantity: 80 },
  { product_id: 13, total_quantity: 20 },
  { product_id: 14, total_quantity: 35 },
  { product_id: 15, total_quantity: 45 },
];

async function seed(): Promise<void> {
  const pool = getPool();
  console.log('Seeding inventory data...');

  try {
    for (const product of products) {
      await pool.query(
        `INSERT INTO inventory_items (product_id, total_quantity, reserved_quantity)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE total_quantity = VALUES(total_quantity), updated_at = CURRENT_TIMESTAMP(6)`,
        [product.product_id, product.total_quantity]
      );
      console.log(`  Product ${product.product_id}: ${product.total_quantity} units`);
    }
    console.log('Seeding completed successfully.');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run seed if this is the main module
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { seed };
