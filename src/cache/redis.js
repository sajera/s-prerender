
// outsource dependencies
import { createClient } from 'redis';

// local dependencies
import { logError, debug, log } from '../config.js';

// NOTE required interface for "cache"
export default { start, set, get, del, isReady };

// configure
let client;
let CONNECTED;
export function set (key, value) { return client.set(key, value); }
export function get (key) { return client.get(key); }
export function del (key) { return client.del(key); }
export function isReady () { return CONNECTED; }

export async function start (config) {
  log('[redis:connecting]', config);
  client = createClient({ url: config.redisUrl });
  client.on('connect', () => debug('[redis:start]'));
  client.on('ready', () => debug('[redis:connected]', CONNECTED = true));
  client.on('end', () => debug('[redis:stopped]', CONNECTED = false));
  client.on('error', error => logError('REDIS', { message: error.message, stack: error.stack }));
  await client.connect();
  log('[redis:started]', config.redisUrl);
}

