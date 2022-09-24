
// outsource dependencies
import qs from 'node:querystring';

// local dependencies
import api from './api/index.js';
import cache from './cache/index.js';
import queue from './queue/index.js';
import prerender from './prerender/index.js';
import { isUrl, logError, log, config } from './config.js';

// configure
let READY;
const services = { API: api, CACHE: cache, PRERENDER: prerender, QUEUE: queue };
const sids = Object.keys(services);
// run all services
Promise.all(sids.map(id => services[id].start(config[id])))
  .then(() => log('[service:started]', READY = true))
  .catch(error => {
    logError('SERVICES', error.message);
    process.exit(100500);
  });

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
  checkReadyState(['CACHE']);
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
  checkReadyState(['CACHE', 'PRERENDER']);
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
  checkReadyState(['CACHE']);
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
  checkReadyState(['CACHE']);
  const url = validUrl(request);
  await cache.del(url);
  return 'OK';
}

/*********************************************
 *   ////////      THROW       ///////////   *
 *********************************************/
function checkReadyState (required = sids) {
  return required.map(id => {
    if (!services[id].isReady()) {
      throw { code: 503, message: `Service(${id}) not ready yet` };
    }
  });
}

function validUrl (request) {
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 400, message: `Invalid query parameter url "${url}"` }; }
  return url;
}
