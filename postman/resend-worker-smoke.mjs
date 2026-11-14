// Actual local order -> outbox -> RabbitMQ -> independent SMTP worker.
// Credentials stay in ignored files; provider authentication transcripts are never printed.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const privateState=path.join(root,'backend/my-project/.tools/resend-test-state.json')
const privateEnvironment=path.join(root,'postman/E-Commerce.Resend.local.postman_environment.json')
const baseEnvironment=path.join(root,'postman/E-Commerce.local.postman_environment.json')
const api='http://localhost:8000/api'
const recipient=process.env.RESEND_TEST_RECIPIENT
assert.ok(recipient && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient),'Set RESEND_TEST_RECIPIENT to the authorized Resend account email.')
const state=fs.existsSync(privateState)?JSON.parse(fs.readFileSync(privateState,'utf8')):{recipient,idempotency_key:randomUUID(),product_id:23}
assert.equal(state.recipient,recipient,'Refuse changing the recipient of an existing test state')
const save=()=>fs.writeFileSync(privateState,JSON.stringify(state,null,2)+'\n')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(predicate,label,timeout=45000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await predicate())return;await sleep(350)}throw new Error('Timed out: '+label)}
function docker(args,input){
  try{return execFileSync('C:\\Windows\\System32\\wsl.exe',['-d','Ubuntu','--','docker','compose','--project-directory','/mnt/e/projects/internet-applications',...args],{cwd:root,input,encoding:'utf8',windowsHide:true,timeout:45000,stdio:['pipe','pipe','pipe']})}
  catch{throw new Error(`Local Docker operation failed: ${args[0]}/${args[1]}; sensitive output suppressed.`)}
}
function php(body,service='backend'){
  const source=`<?php
require '/var/www/html/vendor/autoload.php';
$app=require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
if(!app()->environment('local') || config('database.connections.mysql.database')!=='ecommerce') throw new RuntimeException('Local application guard failed.');
Illuminate\\Support\\Facades\\DB::connection()->useWriteConnectionWhenReading();
${body}`
  return JSON.parse(docker(['exec','-T',service,'php'],source))
}
function inspect(){
  const orderId=Number(state.order_id||0);assert.ok(Number.isSafeInteger(orderId))
  return php(`
$events=App\\Models\\OutboxEvent::query()->where('order_id',${orderId})->get();
$deliveries=App\\Models\\NotificationDelivery::query()->whereIn('event_id',$events->pluck('event_id'))->get();
$connection=new PhpAmqpLib\\Connection\\AMQPStreamConnection(config('rabbitmq.host'),config('rabbitmq.port'),config('rabbitmq.user'),config('rabbitmq.password'),config('rabbitmq.vhost'));
$channel=$connection->channel();
$queue=$channel->queue_declare(config('rabbitmq.queue'),true);
$connection->close();
echo json_encode(['mode'=>app(App\\Services\\Messaging\\MailDeliveryConfiguration::class)->assertDeliverable(),'mailer'=>config('mail.default'),'host'=>config('mail.mailers.smtp.host'),'mock_allowed'=>(bool)config('mail.order_email_allow_mock'),'outbox'=>$events->count(),'event_id'=>$events->first()?->event_id,'published'=>$events->whereNotNull('published_at')->count(),'deliveries'=>$deliveries->count(),'external_completed'=>$deliveries->where('delivery_mode','external')->whereNotNull('delivered_at')->count(),'queue_ready'=>$queue[1]]);`)
}
async function http(method,route,body,headers={}){
  return fetch(api+route,{method,headers:{Accept:'application/json','Content-Type':'application/json',...(state.token?{Authorization:`Bearer ${state.token}`}:{ }),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)})
}
async function prepare(){
  const lookup=php(`$user=App\\Models\\User::query()->where('email',${JSON.stringify(recipient)})->first();echo json_encode(['exists'=>(bool)$user,'id'=>$user?->id,'role'=>$user?->role]);`)
  let customerPassword
  const environment=JSON.parse(fs.readFileSync(fs.existsSync(privateEnvironment)?privateEnvironment:baseEnvironment,'utf8'))
  const values=new Map(environment.values.map(item=>[item.key,item.value]))
  if(!lookup.exists){
    customerPassword=randomBytes(24).toString('base64url')
    const response=await http('POST','/register',{name:'Resend confirmation demo',email:recipient,password:customerPassword,password_confirmation:customerPassword})
    assert.equal(response.status,201,'Local mail-test customer registration')
    const result=await response.json();state.user_id=result.user.id;state.token=result.access_token
  }else{
    assert.equal(lookup.role,'customer','Existing recipient account must remain a customer; no account role/password is changed')
    state.user_id=lookup.id
    const result=php(`$user=App\\Models\\User::query()->findOrFail(${Number(state.user_id)});echo json_encode(['token'=>auth('api')->login($user)]);`)
    state.token=result.token
    if(values.get('customer_email')===recipient) customerPassword=values.get('customer_password')
  }
  values.set('customer_email',recipient);values.set('customer_password',customerPassword||'')
  for(const name of ['customer_token','customer_id','order_id','product_id','category_id','idempotency_key']) values.delete(name)
  environment.name='E-Commerce — Resend real-email recipient'
  environment.values=[...values].map(([key,value])=>({key,value,enabled:true,type:key.includes('password')?'secret':'default'}))
  fs.writeFileSync(privateEnvironment,JSON.stringify(environment,null,2)+'\n');save()
  const stock=await http('GET',`/products/${state.product_id}`)
  assert.equal(stock.status,200);assert.ok((await stock.json()).data.stock>0,'Real inventory must be available')
  console.log(JSON.stringify({status:'READY',customer_id:state.user_id,product_id:state.product_id,credentials:'stored in ignored local environment, not printed',email_sent:false}))
}
async function send(){
  assert.equal(process.env.RUN_RESEND_WORKER_TEST,'true','Explicit real-email test gate is required')
  assert.ok(state.token && state.user_id,'Run --prepare first')
  const before=inspect()
  assert.equal(before.mode,'external');assert.equal(before.mailer,'smtp');assert.equal(before.host,'smtp.resend.com');assert.equal(before.mock_allowed,false)
  let restore=false
  try{
    restore=true;docker(['stop','--timeout','5','email-worker'])
    const baseline=inspect();assert.equal(baseline.queue_ready,0,'Refuse mixing the authorized test with unrelated queued emails')
    const started=Date.now()
    const response=await http('POST','/orders',{items:[{product_id:state.product_id,quantity:1}]},{'Idempotency-Key':state.idempotency_key})
    assert.equal(response.status,201,'Actual HTTP order flow while independent email worker is stopped')
    const order=(await response.json()).data;assert.equal(order.user_id,state.user_id)
    state.order_id=order.id;save()
    const httpMs=Date.now()-started
    await until(()=>inspect().published===1,'confirmed outbox publication')
    const stopped=inspect();assert.equal(stopped.deliveries,0);assert.equal(stopped.queue_ready,1);assert.equal(stopped.outbox,1)
    console.log(JSON.stringify({status:'PASS',step:'worker_stopped',order_id:state.order_id,http_ms:httpMs,queued:stopped.queue_ready,deliveries:stopped.deliveries}))
    docker(['start','email-worker'])
    await until(()=>inspect().external_completed===1,'real SMTP transport acceptance',60000)
    const completed=inspect();assert.equal(completed.deliveries,1);assert.equal(completed.queue_ready,0)
    restore=false
    const replay=await http('POST','/orders',{items:[{product_id:state.product_id,quantity:1}]},{'Idempotency-Key':state.idempotency_key})
    assert.equal(replay.status,201);assert.equal((await replay.json()).data.id,state.order_id)
    const sentEvent=completed.event_id;assert.ok(/^[a-f0-9-]{36}$/i.test(sentEvent))
    php(`$event=App\\Models\\OutboxEvent::query()->findOrFail('${sentEvent}');app(App\\Services\\Messaging\\MessageBroker::class)->publish(json_encode($event->payload,JSON_THROW_ON_ERROR),$event->event_id,config('rabbitmq.exchange'),config('rabbitmq.routing_key'));echo json_encode(['replayed'=>true]);`)
    await until(()=>inspect().queue_ready===0,'safe duplicate event acknowledgement')
    const final=inspect();assert.equal(final.external_completed,1);assert.equal(final.deliveries,1);assert.equal(final.outbox,1)
    const transport=php(`$id=null;foreach(file(storage_path('logs/laravel.log'),FILE_IGNORE_NEW_LINES)?:[] as $line){if(str_contains($line,'${sentEvent}') && preg_match('/\\{.*\\}/',$line,$matches)){$context=json_decode($matches[0],true);if(($context['event_id']??null)==='${sentEvent}' && ($context['delivery_mode']??null)==='external')$id=$context['transport_message_id']??$id;}}echo json_encode(['transport_message_id'=>$id]);`,'email-worker')
    const report={status:'PASS',executed_at:new Date().toISOString(),scope:'Actual HTTP order flow, real MySQL and gRPC inventory, confirmed RabbitMQ publication, independent worker stop/restart, TLS Resend SMTP; provider transport acceptance is not a user inbox receipt assertion.',recipient:'authorized Resend account email (redacted)',sender:'onboarding@resend.dev',smtp_host:'smtp.resend.com',smtp_port:465,order_id:state.order_id,event_id:sentEvent,idempotency_key:`order-confirmation/${sentEvent}`,http_ms:httpMs,worker_stopped:stopped,worker_restarted:completed,after_duplicate:final,...transport,inbox_receipt:'awaiting recipient confirmation'}
    fs.writeFileSync(path.join(root,'docs/req4-evidence/resend-external-email.json'),JSON.stringify(report,null,2)+'\n')
    state.transport_message_id=transport.transport_message_id;save()
    console.log(JSON.stringify({status:'PASS',order_id:state.order_id,delivery_mode:'external',worker_restart:'PASS',event_replay:'one recorded delivery',...transport,inbox_receipt:'not yet confirmed by recipient'}))
  }finally{if(restore)docker(['start','email-worker'])}
}
if(process.argv.includes('--prepare')) await prepare()
else if(process.argv.includes('--send')) await send()
else throw new Error('Use --prepare or --send; no action performed')
