import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const specPath = path.join(root, 'for frontend.json')
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const realtimeDescription = 'Requirement 4: orders commit with a transactional outbox; a separate publisher and RabbitMQ email worker process confirmations. Local email is explicitly mocked. Private Reverb channels use JWT authorization before subscription. OrderCreated: private-admin.orders; OrderStatusUpdated: private-orders.{id}. Broadcasting uses its own database queue, independent of email. REST remains authoritative.'
spec.info.version = '1.1.0'
if (!spec.info.description.includes('Requirement 4:')) spec.info.description += '\n' + realtimeDescription
if (!spec.tags.some(tag => tag.name === 'Real-Time')) spec.tags.push({ name: 'Real-Time', description: 'JWT authorization for private Reverb/Pusher channels.' })
spec.paths['/broadcasting/auth'] = {
  post: {
    tags: ['Real-Time'], summary: 'Authorize a private WebSocket channel', operationId: 'authorizePrivateChannel',
    description: 'Connect to Reverb first and copy the actual socket_id from pusher:connection_established. Admins may authorize private-admin.orders; only the order owner may authorize private-orders.{id}, with no admin ownership override. This endpoint returns a signature; subscribe over the WebSocket using that signature. It does not stream events or create a socket.',
    security: [{ bearerAuth: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['socket_id', 'channel_name'], properties: { socket_id: { type: 'string', example: '123456.789012' }, channel_name: { type: 'string', example: 'private-orders.1' } } } } } },
    responses: {
      '200': { description: 'Private-channel signature', content: { 'application/json': { schema: { type: 'object', required: ['auth'], properties: { auth: { type: 'string', description: 'Public app key followed by an HMAC signature.' } } } } } },
      '401': { description: 'JWT missing, invalid or expired' }, '403': { description: 'Role or order ownership does not permit subscription' },
      '429': { description: 'Rate limited' },
    },
  },
}
const created = spec.paths['/orders'].post
if (!created.description.includes('transactional outbox')) created.description += '\n' + realtimeDescription + ' A successful response does not mean email delivery has completed. On RESERVATION_OUTCOME_UNKNOWN retry the identical payload with the same Idempotency-Key.'
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n')

// Keep the existing human-readable YAML layout; JSON flow values are also valid YAML.
const yamlPath = path.join(root, 'for frontend.yaml')
let yaml = fs.readFileSync(yamlPath, 'utf8').replace(/^(  version:) 1\.0\.0$/m, '$1 1.1.0')
if (!yaml.includes('  /broadcasting/auth:')) {
  yaml = yaml.replace(/^components:/m, `  /broadcasting/auth: ${JSON.stringify(spec.paths['/broadcasting/auth'])}\ncomponents:`)
}
if (!yaml.includes('\nx-req4-realtime:')) yaml += '\nx-req4-realtime: ' + JSON.stringify(realtimeDescription) + '\n'
fs.writeFileSync(yamlPath, yaml)

const event = (listen, source) => ({ listen, script: { type: 'text/javascript', exec: source.split('\n') } })
const status = codes => `pm.test('Expected HTTP status', () => pm.expect(pm.response.code).to.be.oneOf(${JSON.stringify(codes)}));`
const jsonBody = value => ({ mode: 'raw', raw: typeof value === 'string' ? value : JSON.stringify(value, null, 2), options: { raw: { language: 'json' } } })
const auth = role => role === false ? { type: 'noauth' } : { type: 'bearer', bearer: [{ key: 'token', value: `{{${role || 'customer'}_token}}`, type: 'string' }] }
function request(name, method, endpoint, { role = 'customer', body, expected = [200], tests = '', prerequest = '', description = '', headers = [] } = {}) {
  const item = {
    name,
    request: { method, auth: auth(role), header: [...(headers.some(header => header.key.toLowerCase() === 'accept') ? [] : [{ key: 'Accept', value: 'application/json' }]), ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []), ...headers], url: '{{base_url}}' + endpoint, description },
    event: [event('test', status(expected) + (tests ? '\n' + tests : ''))],
  }
  if (body) item.request.body = jsonBody(body)
  if (prerequest) item.event.unshift(event('prerequest', prerequest))
  return item
}
const capture = (variable, expression) => `if (pm.response.code >= 200 && pm.response.code < 300) { const result = pm.response.json(); pm.collectionVariables.set('${variable}', ${expression}); }`
function login(role) {
  return request(`Login ${role} (saves ${role}_token)`, 'POST', '/login', {
    role: false, body: { email: `{{${role}_email}}`, password: `{{${role}_password}}` },
    tests: capture(`${role}_token`, 'result.access_token') + '\n' + capture(`${role}_id`, 'result.user.id'),
  })
}
const orderBody = '{\n  "items": [{ "product_id": {{product_id}}, "quantity": {{quantity}} }]\n}'
const orderHeaders = [{ key: 'Idempotency-Key', value: '{{idempotency_key}}' }]
const create = request('Create order (retains key for safe retry)', 'POST', '/orders', {
  body: orderBody, expected: [201], headers: orderHeaders,
  prerequest: "if (!pm.collectionVariables.get('idempotency_key')) pm.collectionVariables.set('idempotency_key', pm.variables.replaceIn('{{$guid}}'));",
  tests: capture('order_id', 'result.data.id') + "\npm.test('Order belongs to customer', () => pm.expect(pm.response.json().data.user_id).to.eql(Number(pm.collectionVariables.get('customer_id'))));",
  description: 'Creates a real order and reserves real inventory. The key is retained on failure and retry. Use Prepare next order only when intentionally creating another order. Email is mocked locally and processed separately.',
})
const replay = request('Replay same order (same key and payload)', 'POST', '/orders', {
  body: orderBody, expected: [201], headers: orderHeaders,
  tests: "pm.test('Same order returned', () => pm.expect(pm.response.json().data.id).to.eql(Number(pm.collectionVariables.get('order_id'))));",
})
const authorize = (name, channel, role, code = 200) => request(name, 'POST', '/broadcasting/auth', {
  role, body: { socket_id: '{{socket_id}}', channel_name: channel }, expected: [code],
  tests: code === 200 ? capture('channel_auth', 'result.auth') : '',
  description: 'Set socket_id from the currently open Postman WebSocket connection first. For subscription, copy channel_auth into the pusher:subscribe message described in postman/README.md.',
})
const catalog = [
  request('Categories', 'GET', '/categories', { role: false, tests: "const data=pm.response.json().data; if (!pm.collectionVariables.get('category_id') && data.length) pm.collectionVariables.set('category_id', data[0].id);" }),
  request('Category detail', 'GET', '/categories/{{category_id}}', { role: false }),
  request('Products (page/filter preserved)', 'GET', '/products?per_page=15&page=1', {
    role: false, tests: "const data=pm.response.json().data; if (!pm.collectionVariables.get('product_id') && data.length) pm.collectionVariables.set('product_id', data[0].id);",
  }),
  request('Product detail and real stock', 'GET', '/products/{{product_id}}', { role: false }),
]
const administrative = [
  request('Admin dashboard', 'GET', '/dashboard', { role: 'admin' }),
  request('Admin users', 'GET', '/users', { role: 'admin' }),
  request('Admin orders', 'GET', '/admin/orders?page=1', { role: 'admin' }),
  request('Create category', 'POST', '/categories', { role: 'admin', body: { name: 'Postman category', description: 'Local manual testing' }, expected: [201], tests: capture('created_category_id', 'result.data.id') }),
  request('Update created category', 'PATCH', '/categories/{{created_category_id}}', { role: 'admin', body: { name: 'Postman category updated' } }),
  request('Create product', 'POST', '/products', { role: 'admin', body: '{"name":"Postman product","price":12.50,"category_id":{{created_category_id}},"is_active":true}', expected: [201], tests: capture('created_product_id', 'result.data.id'), description: 'Creates catalog metadata. Inventory quantities are owned separately by the inventory service.' }),
  request('Update created product', 'PATCH', '/products/{{created_product_id}}', { role: 'admin', body: { price: 15.50 } }),
  request('PUT created product', 'PUT', '/products/{{created_product_id}}', { role: 'admin', body: { name: 'Postman product updated', price: 15.50 } }),
  request('PUT created category', 'PUT', '/categories/{{created_category_id}}', { role: 'admin', body: { name: 'Postman category updated' } }),
  request('Deactivate created product', 'DELETE', '/products/{{created_product_id}}', { role: 'admin', description: 'Only the product captured by Create product is targeted.' }),
  request('Delete created category', 'DELETE', '/categories/{{created_category_id}}', { role: 'admin', description: 'May fail while products reference it; only the category captured by Create category is targeted.', expected: [200, 409, 422] }),
]
const collection = {
  info: { name: 'E-Commerce API — Req 4', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Import the local environment and run login requests first. Req 4 folder covers real order creation, safe replay, private-channel auth and admin approval. Mail is explicitly MOCK locally. WebSocket instructions and worker stop/restart commands: postman/README.md. Run requests deliberately: catalog admin requests mutate data.' },
  variable: Object.entries({ base_url: 'http://localhost:8000/api', reverb_url: 'ws://localhost:8080/app/ecommerce-local?protocol=7&client=postman&version=1.0&flash=false', customer_token: '', admin_token: '', other_customer_token: '', customer_id: '', admin_id: '', other_customer_id: '', product_id: '', category_id: '', quantity: '1', order_id: '', idempotency_key: '', socket_id: '', channel_auth: '', created_category_id: '', created_product_id: '', notification_id: '' }).map(([key, value]) => ({ key, value, type: 'string' })),
  item: [
    { name: '01 Authentication', item: [login('customer'), login('admin'), login('other_customer'), request('Current customer', 'GET', '/me'), request('Register a new customer (optional)', 'POST', '/register', { role: false, body: { name: 'Postman customer', email: '{{$randomEmail}}', password: '{{registration_password}}', password_confirmation: '{{registration_password}}' }, expected: [201], description: 'Creates a new customer; existing customer_token is preserved. Registration cannot assign admin role.' })] },
    { name: '02 Catalog', item: catalog },
    { name: '03 Req 4 — orders and private channels', item: [
      create, replay,
      request('Customer orders', 'GET', '/orders?page=1'),
      request('Customer order detail', 'GET', '/orders/{{order_id}}'),
      request('Admin sees new order', 'GET', '/admin/orders?page=1', { role: 'admin' }),
      authorize('Owner channel authorization', 'private-orders.{{order_id}}', 'customer'),
      authorize('Admin channel authorization', 'private-admin.orders', 'admin'),
      authorize('Reject customer on admin channel', 'private-admin.orders', 'customer', 403),
      authorize('Reject another customer on owner channel', 'private-orders.{{order_id}}', 'other_customer', 403),
      authorize('Reject non-owner admin on owner channel', 'private-orders.{{order_id}}', 'admin', 403),
      authorize('Reject unauthenticated subscription', 'private-orders.{{order_id}}', false, 401),
      request('Reject another customer reading order', 'GET', '/orders/{{order_id}}', { role: 'other_customer', expected: [403] }),
      request('Reject customer opening admin orders', 'GET', '/admin/orders', { expected: [403] }),
      request('Approve order as admin', 'PATCH', '/admin/orders/{{order_id}}/status', { role: 'admin', body: { status: 'confirmed' }, tests: "pm.test('Confirmed', () => pm.expect(pm.response.json().data.status).to.eql('confirmed'));" }),
      request('Customer sees confirmed status', 'GET', '/orders/{{order_id}}', { tests: "pm.test('Confirmed', () => pm.expect(pm.response.json().data.status).to.eql('confirmed'));" }),
      request('Prepare next order key (intentional new purchase)', 'GET', '/me', { prerequest: "pm.collectionVariables.set('idempotency_key', pm.variables.replaceIn('{{$guid}}')); pm.collectionVariables.unset('order_id');", description: 'Run this only when intentionally starting a NEW purchase. Retry an uncertain reservation using its existing key instead.' }),
    ] },
    { name: '04 Dashboard and notifications', item: [
      request('Customer dashboard', 'GET', '/dashboard'),
      request('Notifications', 'GET', '/notifications?page=1', { tests: "const data=pm.response.json().data; if(data.length) pm.collectionVariables.set('notification_id', data[0].id);" }),
      request('Notification SSE snapshot', 'GET', '/notifications/events', { headers: [{ key: 'Accept', value: 'text/event-stream' }] }),
      request('Read notification', 'PATCH', '/notifications/{{notification_id}}/read'),
      request('Read all notifications', 'PATCH', '/notifications/read-all'),
    ] },
    { name: '05 Admin catalog management — manual writes', item: administrative },
    { name: '06 Logout — run last', item: [request('Logout customer', 'POST', '/logout'), request('Logout admin', 'POST', '/logout', { role: 'admin' })] },
  ],
}
fs.writeFileSync(path.join(root, 'postman/E-Commerce.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n')
const environment = {
  name: 'E-Commerce local — fill credentials', values: Object.entries({ base_url: 'http://localhost:8000/api', customer_email: 'customer@example.com', customer_password: '', admin_email: 'admin@example.com', admin_password: '', other_customer_email: 'sarah@example.com', other_customer_password: '', registration_password: '' }).map(([key, value]) => ({ key, value, enabled: true, type: key.includes('password') ? 'secret' : 'default' })),
  _postman_variable_scope: 'environment',
}
fs.writeFileSync(path.join(root, 'postman/E-Commerce.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n')
console.log(`Updated OpenAPI JSON/YAML and generated Postman collection (${collection.item.reduce((n, f) => n + f.item.length, 0)} requests).`)
