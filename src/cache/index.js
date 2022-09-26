
// local dependencies
import redis from './redis.js';

// configure
const noop = () => null;
// NOTE module interface
const cache = { start, isReady: noop, set: noop, get: noop, del: noop };

// NOTE switching based on environment variables
function start (config) {
  if (config.redis) {
    Object.assign(cache, redis);
    return redis.start(config);
  }
  // NOTE for now implemented only Redis ¯\_(ツ)_/¯
  // throw new Error('No useful CACHE configuration found');
}

export default cache;
