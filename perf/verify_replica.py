"""Verify read routing and immediate product visibility while replication is paused."""
import json
import uuid
import time
import requirement3 as r
from mysql_replication import mysql, status, wait_for_replica
from api_fixtures import clean

def probe(token=None):
    # A temporary route is installed only inside this CLI process, never in the live route file.
    code = r'''
Illuminate\Support\Facades\Route::middleware('api')->get('/api/__replica_verification', function () {
    return response()->json(['server_id' => (int) Illuminate\Support\Facades\DB::selectOne('SELECT @@server_id AS id')->id]);
});
$request=Illuminate\Http\Request::create('/api/__replica_verification','GET');
$request->headers->set('Accept','application/json');
TOKEN
$kernel=app(Illuminate\Contracts\Http\Kernel::class);
$response=$kernel->handle($request);
echo json_encode(['status'=>$response->getStatusCode(),'body'=>json_decode($response->getContent(),true)]);
$kernel->terminate($request,$response);
'''
    token_code = '$request->headers->set("Authorization", "Bearer ".'+json.dumps(token)+');' if token else ''
    value = json.loads(r.php(code.replace('TOKEN', token_code)))
    assert value['status'] == 200, value
    return value['body']['server_id']

def main():
    before = r.counts()
    fixture = {'name': 'Replica verification '+str(uuid.uuid4()), 'keys': [], 'order_ids': []}
    admin = r.api('/login',method='POST',body={'email':'admin@example.com','password':'admin123456'})['access_token']
    result = {'checks': {}, 'scope': 'Real MySQL replication, live HTTP product writes/reads, and in-process HTTP middleware routing probe'}
    try:
        wait_for_replica()
        result['status_before'] = status()
        result['checks']['caught_up_anonymous_server'] = probe()
        assert result['checks']['caught_up_anonymous_server'] == 2
        mysql('ecommerce-mysql-replica','STOP REPLICA SQL_THREAD')
        product = r.api('/products',token=admin,method='POST',body={'name':fixture['name'],'price':'1.00','category_id':1,'is_active':True})['data']
        fixture['product_id'] = product['id']
        fetched = r.api('/products/'+str(product['id']),token=admin)['data']
        assert fetched['id'] == product['id']
        r.api('/products/'+str(product['id']),token=admin,method='PUT',body={'price':'2.25'})
        fetched = r.api('/products/'+str(product['id']),token=admin)['data']
        assert fetched['price'] == '2.25', fetched
        result['checks']['immediate_create_and_update_visible'] = True
        result['checks']['recent_writer_server'] = probe(admin)
        result['checks']['lagged_anonymous_server'] = probe()
        assert result['checks']['recent_writer_server'] == result['checks']['lagged_anonymous_server'] == 1
        result['status_paused'] = status()
        time.sleep(6)
        result['checks']['after_marker_ttl_with_lag_server'] = probe()
        assert result['checks']['after_marker_ttl_with_lag_server'] == 1
        fetched = r.api('/products/'+str(product['id']))['data']
        assert fetched['price'] == '2.25'
        mysql('ecommerce-mysql-replica','START REPLICA SQL_THREAD')
        wait_for_replica()
        result['checks']['caught_up_again_server'] = probe()
        assert result['checks']['caught_up_again_server'] == 2
        result['status_after'] = status()
        result['passed'] = True
        r.save('professor-fixes/replica/verification.json',json.dumps(result,indent=2))
        print(json.dumps(result['checks'],indent=2),flush=True)
    finally:
        mysql('ecommerce-mysql-replica','START REPLICA SQL_THREAD')
        wait_for_replica()
        if fixture.get('product_id'): clean(fixture)
        wait_for_replica()
        after = r.counts()
        r.save('professor-fixes/replica/cleanup-counts.txt',after)
        if before != after: raise RuntimeError('Fixture cleanup did not restore original counts')

if __name__ == '__main__':
    main()
