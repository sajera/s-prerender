
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
const servicesIds = Object.keys(services);
// run all services
Promise.all(servicesIds.map(id => services[id].start(config[id])))
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
    checkReadyState(servicesIds);
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
  try {
    return await getCached(request);
  } catch (error) {
    return getRefresh(request);
  }
}

/******************************************************
 * GET /refresh?url=http://example.com/
 *****************************************************/
api.middleware.GET['/refresh'] = getRefresh;
getRefresh.contentType = 'text/html';
async function getRefresh (request) {
  checkReadyState(['CACHE', 'PRERENDER']);
  const url = validUrl(request);
  const results = await prerender.render(url);
  log('[api:generate]', url);
  await cache.set(url, results);
  log('[api:to-cache]', url);
  return qs.parse(request.url.query).ignoreResults ? 'OK' : results;
}

/******************************************************
 * POST /refresh
 *****************************************************/
api.middleware.POST['/refresh'] = postRefresh;
postRefresh.contentType = 'text/html';
async function postRefresh (request) {
  checkReadyState(['CACHE', 'QUEUE']);
  const urls = await parseUrls(request);
  // TODO message schema
  await queue.sendToQueue(urls);
  log('[api:to-queue]', urls.length);
  return 'OK';
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
  log('[api:from-cache]', url);
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
function checkReadyState (required = servicesIds) {
  return required.map(id => {
    if (!services[id].isReady()) {
      throw { code: 503, message: `Service(${id}) unavailable` };
    }
  });
}

function validUrl (request) {
  const url = qs.unescape(qs.parse(request.url.query).url);
  if (!isUrl(url)) { throw { code: 422, message: `Unsupported url "${url}"` }; }
  return url;
}

const parseUrls = request => new Promise((resolve, reject) => {
  let data = '';
  request.on('data', chunk => data += chunk);
  request.on('end', () => {
    let urls = [];
    try { urls = JSON.parse(data); } catch (error) {
      logError('[api:parseUrls]', { message: error.message, stack: error.stack });
    }
    if (!Array.isArray(urls)) { reject({ code: 422, message: 'Invalid data, expected an Array with URLs' }); }
    const obj = {};
    for (const url of urls) { obj[url] = 1; }
    urls = [];
    // NOTE only uniq and valid url
    for (const url in obj) { isUrl(url) && urls.push(url); }
    if (!urls.length) { reject({ code: 422, message: 'Invalid data, expected an Array with URLs' }); }
    resolve(urls);
  });
});
