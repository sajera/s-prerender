
// outsource dependencies
import { createClient } from 'redis';

// local dependencies
import { logError, debug, log } from '../config.js';

// NOTE required interface for "cache"
export default { start, set, get, isReady };

// configure
let client;
let CONNECTED;
export function set (key, value) { return client.set(key, value); }
export function get (key) { return client.get(key); }
export function isReady () { return CONNECTED; }

export async function start (config) {
  log('[redis:connecting]', config);
  client = createClient(config);
  client.on('connect', () => debug('[redis:start]', CONNECTED = true));
  client.on('ready', () => debug('[redis:ready]'));
  client.on('end', () => debug('[redis:stopped]', CONNECTED = false));
  client.on('error', error => logError('REDIS', { message: error.message, stack: error.stack }));
  await client.connect();
  log('[redis:connected]');
}

