
// outsource dependencies
import { createClient } from 'redis';

// local dependencies

// configure
let client;
const config = {
  url: process.env.REDIS_URL,
  name: process.env.REDIS_NAME,
  database: process.env.REDIS_DB,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  // commandsQueueMaxLength?: number;
  // disableOfflineQueue?: boolean;
  // readonly?: boolean;
  // legacyMode?: boolean;
  // isolationPoolOptions?: PoolOptions;
};

export default { start, set, get };

async function start () {
  client = createClient(config);
  client.on('error', err => console.log('[redis:error]', err));
  client.on('connect', () => console.log('[redis:start]', config.url));
// client.on('ready', () => console.log('[redis:ready]', config));
  client.on('end', () => console.log('[redis:stopped]', config.url));
  await client.connect();
}

function set (key, value) { client.set(key, value); }
function get (key) { client.get(key); }
