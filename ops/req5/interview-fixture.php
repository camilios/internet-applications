<?php
// Only provision a unique customer/catalog item; orders must go through HTTP.
use App\Models\{Category, Product, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$run = getenv('REQ5_INTERVIEW_RUN');
if (!Str::isUuid($run) || !app()->environment('local') || config('database.connections.mysql.database') !== 'ecommerce_req5') {
    throw new RuntimeException('Requires the isolated interview stack');
}
$email = $run.'@example.invalid';
$action = getenv('REQ5_INTERVIEW_ACTION');
if ($action === 'mailer') {
    $result = config('mail.default') === 'smtp' && config('mail.mailers.smtp.host') === 'mailpit'
        && (int)config('mail.mailers.smtp.port') === 1025 && !config('mail.mailers.smtp.url')
        && !config('mail.order_email_allow_mock');
} elseif ($action === 'setup') {
    $user = User::create(['name'=>'Interview', 'email'=>$email, 'password'=>Str::random(48), 'role'=>'customer']);
    $category = Category::firstOrCreate(['name'=>'Req5 interview']);
    $product = Product::create(['name'=>'Interview '.$run, 'category_id'=>$category->id, 'price'=>2, 'is_active'=>true]);
    $result = ['token'=>auth('api')->login($user),'product'=>$product->id];
} elseif ($action === 'events') {
    $result = DB::table('outbox_events as e')->join('orders as o','o.id','=','e.order_id')
        ->join('users as u','u.id','=','o.user_id')->where('u.email',$email)
        ->pluck('e.event_id','o.id');
} elseif ($action === 'replay') {
    $user = User::where('email',$email)->firstOrFail();
    $event = App\Models\OutboxEvent::whereIn('order_id', $user->orders()->select('id'))->orderBy('order_id')->firstOrFail();
    app(App\Services\Messaging\MessageBroker::class)->publish(json_encode($event->payload, JSON_THROW_ON_ERROR),$event->event_id,config('rabbitmq.exchange'),config('rabbitmq.routing_key'));
    $result = $event->event_id;
} else { throw new RuntimeException('Unknown action'); }
echo json_encode($result, JSON_THROW_ON_ERROR);
