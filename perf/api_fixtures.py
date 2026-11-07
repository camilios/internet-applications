"""Create and remove only explicitly owned live-API verification fixtures."""
import base64
import json
import requirement3 as r

def inventory(mode, product_id, keys, quantity=10):
    code='''
const fs=require('node:fs'); const mysql=require('mysql2/promise');
(async()=>{
const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),
user:process.env.DB_USER,database:process.env.DB_NAME,password:fs.readFileSync(process.env.DB_PASSWORD_FILE,'utf8').trimEnd()});
const [[identity]]=await c.query('SELECT DATABASE() AS db,CURRENT_USER() AS account');
if(identity.db!=='inventory_db'||!identity.account.startsWith('inventory_service@'))throw new Error('Unexpected inventory database');
const id=PRODUCT_ID,keys=KEYS;
if(MODE==='create'){
const [existing]=await c.execute('SELECT product_id FROM inventory_items WHERE product_id=?',[id]);
if(existing.length)throw new Error('Refusing to overwrite existing inventory');
await c.execute('INSERT INTO inventory_items (product_id,total_quantity,reserved_quantity) VALUES (?,QUANTITY,0)',[id]);
}else{
const [reservations]=keys.length?await c.execute('SELECT reservation_id FROM reservations WHERE idempotency_key IN ('+keys.map(()=>'?').join(',')+')',keys):[[]];
const ids=reservations.map(x=>x.reservation_id);
const [items]=await c.execute('SELECT reservation_id FROM reservation_items WHERE product_id=?',[id]);
if(items.some(x=>!ids.includes(x.reservation_id)))throw new Error('Unowned reservation references fixture');
const [[stock]]=await c.execute('SELECT reserved_quantity FROM inventory_items WHERE product_id=?',[id]);
if(stock&&Number(stock.reserved_quantity)!==0)throw new Error('Fixture stock is still reserved');
for(const reservation of ids){await c.execute('DELETE FROM reservation_items WHERE reservation_id=?',[reservation]);await c.execute('DELETE FROM reservations WHERE reservation_id=?',[reservation]);}
await c.execute('DELETE FROM inventory_items WHERE product_id=?',[id]);
}
await c.end();console.log('Inventory fixture '+MODE+' complete');
})().catch(e=>{console.error(e.message);process.exit(1)});
'''.replace('QUANTITY',str(int(quantity))).replace('PRODUCT_ID',str(int(product_id))).replace('KEYS',json.dumps(keys)).replace('MODE',json.dumps(mode))
    return r.docker('exec','-i','ecommerce-inventory','node',input=code).stdout

def clean(fixture):
    if not fixture.get('product_id'):return
    for order_id in ([] if fixture.get('orders_cancelled') else fixture.get('order_ids',[])):
        order=r.api('/orders/'+str(order_id),email='admin@example.com')['data']
        if order['status']!='cancelled':
            r.api('/admin/orders/'+str(order_id)+'/status',email='admin@example.com',method='PATCH',body={'status':'cancelled'})
    if fixture.get('inventory_created'):inventory('delete',fixture['product_id'],fixture.get('keys',[]))
    encoded=base64.b64encode(json.dumps(fixture).encode()).decode()
    code=r'''
$fixture=json_decode(base64_decode('ENCODED'),true);
$product=App\Models\Product::withTrashed()->find($fixture['product_id']);
if (!$product || $product->name!==$fixture['name']) throw new RuntimeException('Fixture ownership check failed');
Illuminate\Support\Facades\DB::transaction(function () use ($fixture,$product) {
    $operations=App\Models\InventoryOperation::whereIn('idempotency_key',$fixture['keys'])->get();
    $orders=$operations->pluck('order_id')->filter()->all();
    $customer=App\Models\User::where('email','customer@example.com')->firstOrFail();
    foreach (App\Models\Order::whereIn('id',$orders)->get() as $order) {
        if ($order->user_id!==$customer->id) throw new RuntimeException('Unowned order');
    }
    Illuminate\Support\Facades\DB::table('notifications')->where('notifiable_id',$customer->id)->whereIn('data->order_id',$orders)->delete();
    App\Models\FailedCompensation::whereIn('operation_id',$operations->pluck('id'))->delete();
    App\Models\InventoryOperation::whereIn('id',$operations->pluck('id'))->delete();
    Illuminate\Support\Facades\DB::table('order_items')->whereIn('order_id',$orders)->delete();
    App\Models\Order::whereIn('id',$orders)->delete();
    $product->forceDelete();
    app(App\Services\ProductCache::class)->forget($fixture['product_id']);
    App\Services\DashboardCache::forgetCache($customer->id);
});
echo 'Owned API fixtures removed'.PHP_EOL;
'''.replace('ENCODED',encoded)
    print(r.php(code),flush=True)
    r.save('results/live-api-cleanup-counts.txt',r.counts())
