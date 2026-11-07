"""Live HTTP/gRPC verification using strictly owned, subsequently removed fixtures."""
from decimal import Decimal
import json
import uuid
import urllib.request
import urllib.error
import requirement3 as r
from api_fixtures import inventory, clean

def request(method,path,token=None,body=None,headers=None):
    hdr={'Accept':'application/json','Content-Type':'application/json','X-Forwarded-For':'198.19.250.1',**(headers or {})}
    if token:hdr['Authorization']='Bearer '+token
    req=urllib.request.Request('http://localhost:8000/api'+path,method=method,headers=hdr,
        data=json.dumps(body).encode() if body is not None else None)
    try:response=urllib.request.urlopen(req,timeout=30)
    except urllib.error.HTTPError as error:response=error
    raw=response.read()
    return response.code, json.loads(raw) if raw else None, response.headers

if __name__=='__main__':
    fixture={'name':'Requirement3 API verification '+str(uuid.uuid4()),'keys':[str(uuid.uuid4())],'order_ids':[]}
    result={'scope':'live HTTP endpoints, actual MySQL and inventory gRPC; browser UI not controlled','checks':{}}
    r.save('results/live-api-counts-before.txt',r.counts())
    admin=r.api('/login',method='POST',body={'email':'admin@example.com','password':'admin123456'})['access_token']
    customer=r.api('/login',method='POST',body={'email':'customer@example.com','password':'password123'})['access_token']
    try:
        _,admin_before,_=request('GET','/dashboard',admin)
        _,customer_before,_=request('GET','/dashboard',customer)
        status,value,_=request('POST','/products',admin,{'name':fixture['name'],'price':'1.00','category_id':1,'is_active':True})
        assert status==201,(status,value)
        fixture['product_id']=value['data']['id']
        r.save('results/live-api-fixture.json',json.dumps(fixture))
        _,admin_after,_=request('GET','/dashboard',admin)
        assert admin_after['data']['total_products']==admin_before['data']['total_products']+1
        inventory('create',fixture['product_id'],[])
        fixture['inventory_created']=True
        detail='/products/'+str(fixture['product_id'])
        status,value,_=request('GET',detail,customer)
        assert status==200 and value['data']['stock']==10
        status,_,_=request('PATCH',detail,admin,{'price':'1.25'})
        assert status==200
        status,value,head=request('GET',detail,customer)
        assert status==200 and value['data']['price']=='1.25'
        etag=head['ETag']
        result['checks']['price_update_immediate']=True
        result['checks']['stock_before']=value['data']['stock']
        key=fixture['keys'][0]
        payload={'items':[{'product_id':fixture['product_id'],'quantity':1}]}
        r.compose('stop','inventory-service')
        try:
            stock_status,stock_body,_=request('GET',detail,customer,headers={'If-None-Match':etag})
            order_status,order_body,_=request('POST','/orders',customer,payload,{'Idempotency-Key':key})
            result['checks']['outage']={'conditional_product_status':stock_status,'order_status':order_status,
                'stock_error':stock_body,'order_error':order_body}
            assert stock_status==503 and order_status==503
        finally:
            r.compose('up','-d','--no-build','--wait','--wait-timeout','120','inventory-service')
        status,created,_=request('POST','/orders',customer,payload,{'Idempotency-Key':key})
        assert status==201,(status,created)
        order_id=created['data']['id'];fixture['order_ids']=[order_id]
        r.save('results/live-api-fixture.json',json.dumps(fixture))
        status,replayed,_=request('POST','/orders',customer,payload,{'Idempotency-Key':key})
        assert status==201 and replayed['data']['id']==order_id
        _,customer_after,_=request('GET','/dashboard',customer)
        assert customer_after['data']['total_orders']==customer_before['data']['total_orders']+1
        status,value,head=request('GET',detail,customer,headers={'If-None-Match':etag})
        assert status==200 and value['data']['stock']==9 and head['ETag']!=etag
        result['checks']['retry_same_key_one_order']=True
        result['checks']['dashboard_before_after_order']={'before':customer_before,'after':customer_after}
        result['checks']['stock_after_order']=9
        new_etag=head['ETag']
        status,cancelled,_=request('PATCH','/admin/orders/'+str(order_id)+'/status',admin,{'status':'cancelled'})
        assert status==200 and cancelled['data']['status']=='cancelled'
        fixture['orders_cancelled']=True
        _,admin_cancelled,_=request('GET','/dashboard',admin)
        assert Decimal(admin_cancelled['data']['total_sales'])==Decimal(admin_before['data']['total_sales'])
        status,value,head=request('GET',detail,customer,headers={'If-None-Match':new_etag})
        assert status==200 and value['data']['stock']==10 and head['ETag']!=new_etag
        result['checks']['stock_after_cancellation']=10
        status,_,_=request('DELETE',detail,admin)
        assert status==200
        _,admin_deleted,_=request('GET','/dashboard',admin)
        assert admin_deleted['data']['total_products']==admin_before['data']['total_products']
        status,_,_=request('GET',detail,customer)
        assert status==404
        result['checks']['delete_refreshes_dashboard_and_detail']=True
        result['passed']=True
        r.save('results/live-api-verification.json',json.dumps(result,indent=2))
        print(json.dumps(result,indent=2),flush=True)
    finally:
        r.compose('up','-d','--no-build','--wait','--wait-timeout','120','inventory-service')
        clean(fixture)
