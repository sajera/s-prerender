
// outsource dependencies
import { createClient } from 'redis';

// local dependencies
import { logError, debug } from './log.js';

// configure
let client;
export const set = (key, value) => client.set(key, value);
export const get = key => client.get(key);

export async function start (config) {
  client = createClient(config);
  client.on('error', error => logError('REDIS', error));
  client.on('connect', () => debug('[redis:start]'));
  client.on('ready', () => debug('[redis:ready]'));
  client.on('end', () => debug('[redis:stopped]'));
  await client.connect();
}

export default { start, set, get };
