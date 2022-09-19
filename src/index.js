
// outsource dependencies
import qs from 'node:querystring';

// local dependencies
import api from './api/index.js';
import cache from './cache/index.js';
import prerender from './prerender/index.js';
import { isUrl, logError, log, API, CACHE, PRERENDER } from './config.js';

// NOTE log unhandled promise exception
process.on('unhandledRejection', error => logError('[service:unhandledRejection]', error && {
  message: error.message,
  stack: error.stack,
  code: error.code,
}));
// NOTE log process exception
process.on('uncaughtException', error => logError('[service:uncaughtException]', error && {
  message: error.message,
  stack: error.stack,
  code: error.code,
}) || process.exit(1));

// configure
let READY;
// run all services
Promise.all([
  api.start(API),
  cache.start(CACHE),
  prerender.start(PRERENDER),
]).then(() => log('[service:ready]', READY = true));

function isReady () {
  if (!api.isReady()) { throw { code: 503, message: 'Service [API] not ready yet' }; }
  if (!cache.isReady()) { throw { code: 503, message: 'Service [CACHE] not ready yet' }; }
  if (!prerender.isReady()) { throw { code: 503, message: 'Service [PRERENDER] not ready yet' }; }
  return true;
}

api.middleware.GET['/health'] = health;
health.contentType = 'application/json';
function health () {
  let ready = false;
  try {
    isReady();
    ready = true;
  } catch (e) { }
  return JSON.stringify({ status: ready ? 'UP' : 'DOWN' });
}

api.middleware.GET['/render'] = render;
render.contentType = 'text/html';
async function render (request) {
  isReady();
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 400, message: `Invalid query parameter url "${url}"` }; }
  const results = await cache.get(url);
  if (results) {
    log('[api:cache]', url);
    return results;
  }
  return refresh(request);
}

api.middleware.GET['/refresh'] = refresh;
refresh.contentType = 'text/html';
async function refresh (request, response, uid) {
  isReady();
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 400, message: `Invalid query parameter url "${url}"` }; }
  const results = await prerender.render(url);
  log('[api:generate]', { url, uid });
  await cache.set(url, results);
  log('[api:cached]', { url, uid });
  return results;
}

api.middleware.GET['/cached'] = getCached;
getCached.contentType = 'text/html';
async function getCached (request) {
  isReady();
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 400, message: `Invalid query parameter url "${url}"` }; }
  const results = await cache.get(url);
  if (!results) { throw { code: 404, message: `Cache empty for "${url}"` }; }
  log('[api:cache]', url);
  return results;
}

api.middleware.DELETE['/cached'] = deleteCached;
deleteCached.contentType = 'text/plain';
async function deleteCached (request) {
  isReady();
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 400, message: `Invalid query parameter url "${url}"` }; }
  await cache.del(url);
  return 'OK';
}
