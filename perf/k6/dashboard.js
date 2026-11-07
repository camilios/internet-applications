import { options, setup, request } from './common.js';
export { options, setup };
export default function (auth) { request('dashboard', auth); }
