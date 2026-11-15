# Loading the shared demo products on another laptop

Git transfers code and seed definitions. Database rows live in each laptop's Docker volumes. Laravel migrations update table structure; they do not copy another laptop's users, orders or product records.

To load the **10 shared sample products with 100 initial units each**, use the following from the project root after the new seed files have been committed and pushed. Docker, Node.js 22+ and the local `.env`/`secrets/` must already be configured.

```powershell
git pull
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml exec -T backend php artisan migrate --force
node scripts/seed-demo-products.mjs
```

The seed command detects Docker Desktop's CLI, or falls back to Docker in Ubuntu WSL on Windows. If using a different WSL distribution, set `WSL_DISTRO_NAME` to its name before running the Node command. Docker commands above can also be run inside the colleague's Ubuntu terminal, from their own checkout directory.

The command creates missing products in Laravel's catalog and provisions missing stock rows inside the Inventory service. Product IDs are resolved on that laptop and can differ from this laptop's IDs. It reuses the shared category and product names, preserving existing prices, active/deleted flags, stock and reservations. A product already ordered may have less than 100 available units; rerunning the seed does not replenish it or create a duplicate.

The definitions are in [demo-products.json](../scripts/demo-products.json); the executable command is [seed-demo-products.mjs](../scripts/seed-demo-products.mjs). Refresh the Products page after a successful run.

To copy the **entire current database state**, including the same customers and orders, a separate export/import of both `ecommerce` and `inventory_db` is required. This seed command does not synchronize those records between laptops. Do not use `migrate:fresh`, `down -v`, or a general reseed to update an existing database.
