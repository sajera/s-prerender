
// local dependencies
import redis from './redis.js';

// NOTE module interface
const noop = () => null;
const cache = { start, isReady: noop, set: noop, get: noop, del: noop };

// TODO switching based on environment variables
// NOTE for now implemented only Redis ¯\_(ツ)_/¯
function start (config) {
  if (config.redis) {
    Object.assign(cache, redis);
    return redis.start(config);
  }
  throw new Error('No useful CACHE configuration found');
}

export default cache;
