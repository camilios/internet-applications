import { options, setup, request } from './common.js';
export { options, setup };
export default function (auth) { request('customer-orders', auth); }
