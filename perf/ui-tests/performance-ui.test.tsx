import React from 'react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  orders: { create:vi.fn(), getMine:vi.fn(), getById:vi.fn(), adminGetAll:vi.fn(), adminUpdateStatus:vi.fn() },
  products: { getById:vi.fn(), getAll:vi.fn(), create:vi.fn(), update:vi.fn(), delete:vi.fn() },
  dashboard: { getSummary:vi.fn() }, navigate:vi.fn(),
}))
vi.mock('@/features/orders/api/orders.api', () => ({ ordersApi:mocks.orders }))
vi.mock('@/features/products/api/products.api', () => ({ productsApi:mocks.products }))
vi.mock('@/features/dashboard/api/dashboard.api', () => ({ dashboardApi:mocks.dashboard }))
vi.mock('@/features/auth/stores/auth.store', () => ({ useAuthStore:(selector:any)=>selector({user:{role:'customer'}}) }))
vi.mock('@/lib/toast', () => ({ toastService:{success:vi.fn(),error:vi.fn()} }))
vi.mock('@tanstack/react-router', () => ({ useNavigate:()=>mocks.navigate,
  Link:({children,to}:any)=><a href={to}>{children}</a> }))
vi.mock('lucide-react', () => ({ Pencil:()=>null, ArrowRight:()=>null, ShoppingCart:()=>null }))
vi.mock('@/components/ui/button', () => ({ Button:({children,asChild,...props}:any)=>
  asChild ? React.cloneElement(children,props) : <button {...props}>{children}</button> }))
vi.mock('@/components/ui/input', () => ({ Input:(props:any)=><input {...props}/> }))
vi.mock('@/components/ui/badge', () => ({ Badge:({children}:any)=><span>{children}</span> }))
vi.mock('@/components/ui/card', () => ({ Card:({children}:any)=><div>{children}</div>,
  CardContent:({children}:any)=><div>{children}</div>, CardHeader:({children}:any)=><div>{children}</div>,
  CardTitle:({children}:any)=><h2>{children}</h2> }))
vi.mock('@/components/feedback/loading-spinner', () => ({ LoadingSpinner:({text}:any)=><div>{text}</div> }))
vi.mock('@/components/feedback/empty-state', () => ({ EmptyState:({title}:any)=><div>{title}</div> }))

import { ProductDetails } from '@/features/products/components/product-details'
import { useOrders, useUpdateOrderStatus } from '@/features/orders/hooks/use-orders'
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard'
import { useProducts, useCreateProduct, useDeleteProduct } from '@/features/products/hooks/use-products'

configure({ asyncUtilTimeout:5000 })
const evidence:any = { scope:'jsdom components and real query/mutation hooks; API functions replaced by controlled fixtures' }
const clients:QueryClient[]=[]
let state:any
const clone = (value:any)=>JSON.parse(JSON.stringify(value))
const product = (id:number)=>({id,name:`Fixture product ${id}`,description:'Verification fixture',price:'1.00',
  image_url:null,category:{id:1,name:'Fixture category'},is_active:true,stock:10,
  created_at:'2026-11-07T00:00:00.000000Z',updated_at:'2026-11-07T00:00:00.000000Z'})
const page = (data:any[])=>({data:clone(data),meta:{current_page:1,last_page:1,per_page:15,total:data.length},links:{}})
function context(){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:120000,gcTime:0},mutations:{retry:false}}})
  clients.push(client)
  return {client,wrapper:({children}:any)=><QueryClientProvider client={client}>{children}</QueryClientProvider>}
}

beforeEach(()=>{
  vi.resetAllMocks()
  state={products:{1:product(1)},orders:[],failNext:0,dashboard:{total_products:1,total_orders:0,orders_today:0,total_users:null,total_sales:'0.00'}}
  mocks.dashboard.getSummary.mockImplementation(async()=>clone(state.dashboard))
  mocks.products.getById.mockImplementation(async(id)=>{
    if(!state.products[id])throw {statusCode:404,message:'Not found'}
    return clone(state.products[id])
  })
  mocks.products.getAll.mockImplementation(async()=>page(Object.values(state.products)))
  mocks.orders.getMine.mockImplementation(async()=>page(state.orders))
  mocks.orders.adminGetAll.mockImplementation(async()=>page(state.orders))
  mocks.orders.getById.mockImplementation(async(id)=>clone(state.orders.find((order:any)=>order.id===id)))
  mocks.orders.create.mockImplementation(async(items)=>{
    if(state.failNext>0){state.failNext--;throw {statusCode:503,message:'Inventory unavailable'}}
    const order={id:100+state.orders.length,status:'pending',total:'1.00',items:[]}
    state.orders.push(order);state.products[items[0].product_id].stock-=items[0].quantity
    state.dashboard.total_orders++;state.dashboard.orders_today++;state.dashboard.total_sales='1.00'
    return clone(order)
  })
  mocks.orders.adminUpdateStatus.mockImplementation(async(id,status)=>{
    const order=state.orders.find((order:any)=>order.id===id);order.status=status
    state.products[1].stock=10;state.dashboard.total_sales='0.00';return clone(order)
  })
  mocks.products.create.mockImplementation(async(input)=>{
    const value={...product(2),...input,id:2};state.products[2]=value;state.dashboard.total_products++
    return clone(value)
  })
  mocks.products.delete.mockImplementation(async(id)=>{delete state.products[id];state.dashboard.total_products--})
})
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear())})
afterAll(()=>{
  const folder=path.resolve(import.meta.dirname,'../../docs/performance/results')
  mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,'frontend-component-evidence.json'),JSON.stringify(evidence,null,2))
})

describe('Requirement 3 approved frontend behavior',()=>{
  it('reuses a failed order key and refreshes dashboard, order list and live stock after writes',async()=>{
    const {wrapper}=context()
    const dashboard=renderHook(()=>useDashboard(),{wrapper})
    const orders=renderHook(()=>useOrders(1),{wrapper})
    render(<ProductDetails productId={1}/>,{wrapper})
    await screen.findByRole('button',{name:'اطلب الآن'})
    await waitFor(()=>expect(dashboard.result.current.data?.total_orders).toBe(0))
    state.failNext=1
    await userEvent.click(screen.getByRole('button',{name:'اطلب الآن'}))
    await waitFor(()=>expect(mocks.orders.create).toHaveBeenCalledTimes(1))
    await waitFor(()=>expect(screen.getByRole('button',{name:'اطلب الآن'}).hasAttribute('disabled')).toBe(false))
    await userEvent.click(screen.getByRole('button',{name:'اطلب الآن'}))
    await waitFor(()=>expect(dashboard.result.current.data?.total_orders).toBe(1))
    await waitFor(()=>expect(orders.result.current.data?.meta.total).toBe(1))
    await waitFor(()=>expect(screen.getByText('المخزون المتوفر').nextElementSibling?.textContent).toBe('9'))
    const keys=mocks.orders.create.mock.calls.map(call=>call[1])
    expect(keys).toHaveLength(2);expect(keys[0]).toBeTruthy();expect(keys[1]).toBe(keys[0]);expect(state.orders).toHaveLength(1)
    const update=renderHook(()=>useUpdateOrderStatus(100),{wrapper})
    await act(async()=>{await update.result.current.mutateAsync('cancelled')})
    await waitFor(()=>expect(dashboard.result.current.data?.total_sales).toBe('0.00'))
    await waitFor(()=>expect(orders.result.current.data?.data[0].status).toBe('cancelled'))
    await waitFor(()=>expect(screen.getByText('المخزون المتوفر').nextElementSibling?.textContent).toBe('10'))
    evidence.orderRetry={sameKey:keys[0]===keys[1],ordersCreated:state.orders.length,
      dashboardOrders:dashboard.result.current.data?.total_orders,stockAfterOrder:9,stockAfterCancellation:10,
      salesAfterCancellation:dashboard.result.current.data?.total_sales}
  })

  it('changes the retry key when quantity or the product changes',async()=>{
    const {wrapper}=context();state.failNext=3;state.products[2]=product(2)
    const view=render(<ProductDetails productId={1}/>,{wrapper})
    await screen.findByRole('button',{name:'اطلب الآن'})
    await userEvent.click(screen.getByRole('button',{name:'اطلب الآن'}))
    await waitFor(()=>expect(mocks.orders.create).toHaveBeenCalledTimes(1))
    await waitFor(()=>expect(screen.getByRole('button',{name:'اطلب الآن'}).hasAttribute('disabled')).toBe(false))
    fireEvent.change(screen.getByLabelText('الكمية'),{target:{value:'2'}})
    await userEvent.click(screen.getByRole('button',{name:'اطلب الآن'}))
    await waitFor(()=>expect(mocks.orders.create).toHaveBeenCalledTimes(2))
    view.rerender(<ProductDetails productId={2}/>)
    await screen.findByText('Fixture product 2')
    await userEvent.click(screen.getByRole('button',{name:'اطلب الآن'}))
    await waitFor(()=>expect(mocks.orders.create).toHaveBeenCalledTimes(3))
    const calls=mocks.orders.create.mock.calls
    expect(new Set(calls.map(call=>call[1])).size).toBe(3)
    expect(calls[1][0]).toEqual([{product_id:1,quantity:2}])
    expect(calls[2][0]).toEqual([{product_id:2,quantity:2}])
    evidence.changedItems={distinctKeys:3,quantityChangeCreatesKey:true,productChangeCreatesKey:true}
  })

  it('refreshes dashboard and product queries after creating and deleting products',async()=>{
    const {wrapper}=context()
    const dashboard=renderHook(()=>useDashboard(),{wrapper})
    const products=renderHook(()=>useProducts(),{wrapper})
    const create=renderHook(()=>useCreateProduct(),{wrapper})
    const remove=renderHook(()=>useDeleteProduct(),{wrapper})
    render(<ProductDetails productId={1}/>,{wrapper})
    await screen.findByText('Fixture product 1')
    await waitFor(()=>expect(dashboard.result.current.data?.total_products).toBe(1))
    await act(async()=>{await create.result.current.mutateAsync({name:'Added fixture',price:2,category_id:1,is_active:true})})
    await waitFor(()=>expect(dashboard.result.current.data?.total_products).toBe(2))
    await waitFor(()=>expect(products.result.current.data?.meta.total).toBe(2))
    await act(async()=>{await remove.result.current.mutateAsync(1)})
    await waitFor(()=>expect(dashboard.result.current.data?.total_products).toBe(1))
    await waitFor(()=>expect(products.result.current.data?.meta.total).toBe(1))
    await screen.findByText('المنتج غير موجود')
    expect(mocks.products.getById.mock.calls.length).toBeGreaterThan(1)
    evidence.productWrites={dashboardAfterCreate:2,dashboardAfterDelete:1,deletedDetailRefetched:true}
  })
})
