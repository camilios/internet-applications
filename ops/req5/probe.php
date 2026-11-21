<?php
// Invoked over stdin by verify.py, inside an isolated API container only.
use App\Models\Order;
use App\Models\OutboxEvent;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$run = getenv('REQ5_RUN');
if (!Str::isUuid($run) || config('database.connections.mysql.database') !== 'ecommerce_req5'
    || config('mail.default') !== 'array' || !config('mail.order_email_allow_mock') || !app()->environment('local')) {
    throw new RuntimeException('This fixture requires the isolated Req5 database and mock mailer.');
}
$key = 'req5-proof-'.$run;
$path = $key.'.txt';
$disk = Storage::disk('public');
$email = $run.'@example.invalid';
$result = null;
switch (getenv('REQ5_ACTION')) {
    case 'write':
        Log::channel('single')->info($key); // Control: the original local-file logging channel.
        $disk->put($path, $key);
        Cache::put($key, $key, 600);
        $result = true;
        break;
    case 'read':
        $log = storage_path('logs/laravel.log');
        $result = ['local_log' => is_file($log) && str_contains(file_get_contents($log), $key),
            'public_file' => $disk->get($path) === $key, 'redis' => Cache::get($key) === $key];
        break;
    case 'remove-markers':
        $disk->delete($path);
        Cache::forget($key);
        $result = true;
        break;
    case 'user':
        $user = User::create(['name'=>'Req5 demo', 'email'=>$email, 'password'=>Str::random(48), 'role'=>'customer']);
        $result = ['token'=>auth('api')->login($user), 'id'=>$user->id];
        break;
    case 'enqueue':
        $user = User::where('email', $email)->firstOrFail();
        $result = DB::transaction(function () use ($user) {
            $ids = [];
            for ($i=0; $i<150; $i++) {
                $order = Order::create(['user_id'=>$user->id, 'status'=>'pending', 'total'=>0]);
                $id = (string) Str::uuid();
                OutboxEvent::create(['event_id'=>$id, 'order_id'=>$order->id, 'event_type'=>'OrderCreated',
                    'payload'=>['event_id'=>$id, 'type'=>'OrderCreated', 'order_id'=>$order->id, 'occurred_at'=>now()->toISOString()], 'available_at'=>now()]);
                $ids[] = $id;
            }
            return $ids;
        });
        break;
    case 'delivered':
        $result = DB::table('notification_deliveries as d')->join('orders as o','o.id','=','d.order_id')
            ->join('users as u','u.id','=','o.user_id')->where('u.email',$email)->whereNotNull('d.delivered_at')
            ->where('d.delivery_mode','mock')->pluck('d.event_id');
        break;
    default: throw new RuntimeException('Unexpected action');
}
echo json_encode($result, JSON_THROW_ON_ERROR), "\n";
