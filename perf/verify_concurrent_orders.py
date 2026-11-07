# Thirty simultaneous HTTP attempts compete for one real inventory unit.
import json
import uuid
import requirement3 as r
from api_fixtures import inventory, clean

def main():
    fixture={'name':'Concurrent order verification '+str(uuid.uuid4()),'keys':[str(uuid.uuid4()) for _ in range(30)],'order_ids':[]}
    before=r.counts()
    admin=r.api('/login',method='POST',body={'email':'admin@example.com','password':'admin123456'})['access_token']
    customer=r.api('/login',method='POST',body={'email':'customer@example.com','password':'password123'})['access_token']
    try:
        product=r.api('/products',token=admin,method='POST',body={'name':fixture['name'],'price':'1.00','category_id':1,'is_active':True})['data']
        fixture['product_id']=product['id']
        inventory('create',product['id'],[],quantity=1);fixture['inventory_created']=True
        arguments=json.dumps({'product':product['id'],'token':customer,'keys':fixture['keys']})
        node=r'''
const args=ARGS;
(async()=>{
  const results=await Promise.all(args.keys.map(async(key,index)=>{
    const response=await fetch('http://loadtest-proxy/api/orders',{method:'POST',headers:{
      Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+args.token,
      'Idempotency-Key':key,'X-Forwarded-For':`198.18.220.${index+1}`},
      body:JSON.stringify({items:[{product_id:args.product,quantity:1}]})});
    return {index,status:response.status,body:await response.json()};
  }));
  console.log(JSON.stringify(results));
})().catch(error=>{console.error(error.message);process.exit(1)});
'''.replace('ARGS',arguments)
        response=r.docker('exec','-i','ecommerce-inventory','node',input=node)
        results=json.loads(response.stdout)
        fixture['order_ids']=[row['body']['data']['id'] for row in results if row['status']==201]
        r.save('professor-fixes/concurrency/fixture.json',json.dumps(fixture))
        success=[row for row in results if row['status']==201]
        rejected=[row for row in results if row['status']==409 and row['body'].get('code')=='INSUFFICIENT_STOCK']
        assert len(success)==1 and len(rejected)==29,[(row['status'],row['body'].get('code')) for row in results]
        key=fixture['keys'][success[0]['index']]
        replay=r.api('/orders',token=customer,method='POST',headers={'Idempotency-Key':key},body={'items':[{'product_id':product['id'],'quantity':1}]})['data']
        assert replay['id']==fixture['order_ids'][0]
        stock=r.api('/products/'+str(product['id']),token=customer)['data']['stock']
        assert stock==0,stock
        count=int(r.php("echo App\\Models\\OrderItem::where('product_id', "+str(product['id'])+")->count();").strip())
        assert count==1,count
        result={'passed':True,'concurrent_http_attempts':30,'initial_stock':1,'created':1,'insufficient_stock':29,
            'remaining_stock':stock,'persisted_order_items':count,'same_key_replay_same_order':True,'statuses':[row['status'] for row in results],
            'scope':'Real Laravel HTTP, primary MySQL, live inventory gRPC and its own MySQL; requests sent concurrently through internal benchmark proxy.'}
        r.save('professor-fixes/concurrency/result.json',json.dumps(result,indent=2))
        print(json.dumps(result,indent=2),flush=True)
    finally:
        clean(fixture)
        after=r.counts()
        r.save('professor-fixes/concurrency/cleanup-counts.txt',after)
        if before!=after:raise RuntimeError('Fixture cleanup did not restore original counts')

if __name__=='__main__':main()
