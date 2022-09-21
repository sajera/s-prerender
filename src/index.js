
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

/******************************************************
 * GET /health
 *****************************************************/
api.middleware.GET['/health'] = health;
health.contentType = 'application/json';
function health () {
  let ready = false;
  try {
    checkReadyState();
    ready = true;
  } catch (e) { }
  return JSON.stringify({ status: ready ? 'UP' : 'DOWN' });
}

/******************************************************
 * GET /render?url=http://example.com/
 *****************************************************/
api.middleware.GET['/render'] = render;
render.contentType = 'text/html';
async function render (request) {
  checkReadyState();
  const url = validUrl(request);
  const results = await cache.get(url);
  if (results) {
    log('[api:from-cache]', url);
    return results;
  }
  log('[api:no-cache]', url);
  return refresh(request);
}

/******************************************************
 * GET /refresh?url=http://example.com/
 *****************************************************/
api.middleware.GET['/refresh'] = refresh;
refresh.contentType = 'text/html';
async function refresh (request) {
  checkReadyState();
  const url = validUrl(request);
  const results = await prerender.render(url);
  log('[api:generate]', url);
  await cache.set(url, results);
  log('[api:to-cache]', url);
  return results;
}

/******************************************************
 * GET /cached?url=http://example.com/
 *****************************************************/
api.middleware.GET['/cached'] = getCached;
getCached.contentType = 'text/html';
async function getCached (request) {
  checkReadyState();
  const url = validUrl(request);
  const results = await cache.get(url);
  if (!results) { throw { code: 404, message: `Cache empty for "${url}"` }; }
  return results;
}

/******************************************************
 * DELETE /cached?url=http://example.com/
 *****************************************************/
api.middleware.DELETE['/cached'] = deleteCached;
deleteCached.contentType = 'text/plain';
async function deleteCached (request) {
  checkReadyState();
  const url = validUrl(request);
  await cache.del(url);
  return 'OK';
}

/******************************************************
 *            ///////////////////
 *****************************************************/
function checkReadyState () {
  if (!api.isReady()) { throw { code: 503, message: 'Service(API) not ready yet' }; }
  if (!cache.isReady()) { throw { code: 503, message: 'Service(CACHE) not ready yet' }; }
  if (!prerender.isReady()) { throw { code: 503, message: 'Service(PRERENDER) not ready yet' }; }
  return true;
}

function validUrl (request) {
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 400, message: `Invalid query parameter url "${url}"` }; }
  return url;
}
