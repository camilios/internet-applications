// Local, repeatable provisioning for the shared demo catalog and its inventory.
// Uses each running service's own database configuration; never prints credentials.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/seed-demo-products.mjs\nStart the local Docker stack first. Creates missing demo products and missing 100-unit inventory rows. Existing metadata, stock, reservations and deletions are preserved.')
  process.exit(0)
}
const data = JSON.parse(fs.readFileSync(new URL('./demo-products.json', import.meta.url), 'utf8'))
assert.equal(data.products.length, 10)
assert.equal(new Set(data.products.map(product => product.name)).size, 10)
assert.ok(data.products.every(product => product.name && product.price > 0 && product.initial_stock === 100))

const direct = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', windowsHide: true, timeout: 8000 })
const viaWsl = direct.status !== 0 && process.platform === 'win32'
if (direct.status !== 0 && !viaWsl) throw new Error('Docker is unavailable. Start Docker and the project stack first.')
if (viaWsl && !/^[A-Za-z]:[\\/]/.test(root)) throw new Error('Run from a local drive or run this command inside WSL.')
const project = viaWsl ? '/mnt/' + root[0].toLowerCase() + root.slice(2).replaceAll('\\', '/') : root
const executable = viaWsl ? 'C:\\Windows\\System32\\wsl.exe' : 'docker'
const leading = viaWsl ? ['-d', process.env.WSL_DISTRO_NAME || 'Ubuntu', '--', 'docker'] : []
function execute(service, runtime, source) {
  try {
    const output = execFileSync(executable, [...leading, 'compose', '--project-directory', project, '-f', project + '/docker-compose.yml', 'exec', '-T', service, runtime], { cwd: root, input: source, encoding: 'utf8', windowsHide: true, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] })
    return JSON.parse(output)
  } catch {
    throw new Error(`Demo seeding failed in ${service}. Confirm the local stack is running and configured. No credentials or raw process output are printed; rerunning preserves existing rows.`)
  }
}

const encoded = Buffer.from(JSON.stringify(data)).toString('base64')
const catalog = execute('backend', 'php', `<?php
require '/var/www/html/vendor/autoload.php';
$app=require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
if(!app()->environment('local') || config('database.connections.mysql.database')!=='ecommerce')throw new RuntimeException('Local application guard failed');
Illuminate\\Support\\Facades\\DB::connection()->useWriteConnectionWhenReading();
$data=json_decode(base64_decode('${encoded}'),true,512,JSON_THROW_ON_ERROR);
$lock=Illuminate\\Support\\Facades\\DB::selectFromWriteConnection("SELECT GET_LOCK('demo_products_seed_v1',10) AS acquired");
if((int)$lock[0]->acquired!==1)throw new RuntimeException('Another demo seed is running');
try{
 $result=Illuminate\\Support\\Facades\\DB::transaction(function()use($data){
  $category=App\\Models\\Category::query()->firstOrCreate($data['category']);
  $products=[];$created=0;
  foreach($data['products'] as $item){
   $product=App\\Models\\Product::withTrashed()->where('category_id',$category->id)->where('name',$item['name'])->first();
   if(!$product){$product=app(App\\Services\\ProductService::class)->create(['name'=>$item['name'],'description'=>$item['description'],'price'=>$item['price'],'category_id'=>$category->id,'is_active'=>true]);$created++;}
   $products[]=['id'=>$product->id,'name'=>$product->name,'initial_stock'=>$item['initial_stock'],'is_active'=>$product->is_active,'deleted'=>$product->trashed()];
  }
  return ['category_id'=>$category->id,'created'=>$created,'existing'=>count($products)-$created,'products'=>$products];
 });
 App\\Services\\DashboardCache::forgetAdmin();
 echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}finally{Illuminate\\Support\\Facades\\DB::selectFromWriteConnection("SELECT RELEASE_LOCK('demo_products_seed_v1')");}
`)
assert.equal(catalog.products.length, 10)
assert.ok(catalog.products.every(product => Number.isSafeInteger(product.id) && product.id > 0))
const inventoryProducts = catalog.products.filter(product => !product.deleted)
const inventory = execute('inventory-service', 'node', `
const mysql=require('mysql2/promise');
const {config}=require('/app/dist/config.js');
(async()=>{
 if(config.db.host!=='inventory-mysql'||config.db.database!=='inventory_db'||config.db.user!=='inventory_service')throw Error('Local inventory guard failed');
 const connection=await mysql.createConnection(config.db);
 try{
  await connection.beginTransaction();
  let created=0;const products=[];
  for(const product of ${JSON.stringify(inventoryProducts)}){
   const [before]=await connection.execute('SELECT product_id,total_quantity,reserved_quantity FROM inventory_items WHERE product_id=? FOR UPDATE',[product.id]);
   if(!before.length){await connection.execute('INSERT INTO inventory_items(product_id,total_quantity,reserved_quantity) VALUES (?,?,0)',[product.id,product.initial_stock]);created++;}
   const [rows]=await connection.execute('SELECT product_id,total_quantity,reserved_quantity,total_quantity-reserved_quantity AS available_stock FROM inventory_items WHERE product_id=?',[product.id]);
   if(before.length && (Number(before[0].total_quantity)!==Number(rows[0].total_quantity)||Number(before[0].reserved_quantity)!==Number(rows[0].reserved_quantity)))throw Error('Existing inventory changed');
   products.push(rows[0]);
  }
  await connection.commit();
  console.log(JSON.stringify({created,existing:products.length-created,products}));
 }catch(error){await connection.rollback();throw error;}finally{await connection.end();}
})().catch(()=>{console.error('Local inventory seed failed');process.exitCode=1;});
`)
assert.equal(inventory.products.length, inventoryProducts.length)
const byId = new Map(inventory.products.map(product => [Number(product.product_id), product]))
for (const product of catalog.products) {
  if (product.deleted) continue
  const stock = byId.get(product.id)
  assert.ok(stock && Number(stock.available_stock) >= 0)
}
console.log(JSON.stringify({ status: 'PASS', catalog_created: catalog.created, catalog_existing: catalog.existing, inventory_created: inventory.created, inventory_existing: inventory.existing, category_id: catalog.category_id, products: catalog.products.map(product => ({ id: product.id, name: product.name, is_active: product.is_active, deleted: product.deleted, ...(byId.has(product.id) ? { stock: Number(byId.get(product.id).available_stock), reserved: Number(byId.get(product.id).reserved_quantity) } : {}) })) }, null, 2))
