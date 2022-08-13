
// outsource dependencies
import url from 'node:url';
import qs from 'node:querystring';
import { v4 as uuid } from 'uuid';
import { isWebUri } from 'valid-url';
import { createServer } from 'node:http';

// local dependencies
import redis from './redis.js';
import prerender from './prerender/index.js';
import { logError, log, debug, API, REDIS, PRERENDER, DEBUG } from './config.js';

//
export { logError };

// configure
let READY;
// NOTE create
const api = createServer(middleware);
// api.close(() => log('[api:stopped]', `http://${API.HOST}:${API.PORT}/`));
log('[api:starting]', API);
api.listen(API.PORT, API.HOST, async () => {
  log('[api:started]', `http://${API.HOST}:${API.PORT}/`);
  log('[prerender:starting]', PRERENDER);
  await prerender.start(PRERENDER);
  log('[prerender:started]');
  log('[redis:connecting]', REDIS);
  await redis.start(REDIS);
  log('[redis:connected]');
  READY = true;
});

/**
 * Primitive middleware
 * @param request
 * @param response
 */
async function middleware (request, response) {
  let uid = DEBUG && uuid();
  uid && console.time(uid);
  const { pathname, query } = url.parse(request.url);
  const options = qs.parse(query);
  log(`[api:request] ${request.method} ${pathname}`, options.url);
  const prerenderURL = qs.unescape(options.url);
  try {
    if (!READY) { throw { code: 503, message: 'Service not ready yet' }; }
    if (!isWebUri(options.url)) { throw { code: 400, message: `Invalid query parameter url "${options.url}"` }; }
    let results;
    switch (pathname) {
      default: throw { code: 404, message: 'Not found' };
      case '/render':
        results = await redis.get(prerenderURL);
        results && log('[api:cache]', prerenderURL);
        if (!results) { results = await refresh(prerenderURL); }
        break;
      case '/refresh':
        results = await refresh(prerenderURL);
        break;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    response.end(results);
  } catch (error) {
    response.statusCode = error.code || 500;
    response.setHeader('Content-Type', 'text/plain');
    response.end(`[ERROR:${response.statusCode}] ${error.message}`);
    logError('API', {
      method: request.method,
      pathname,
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
  }
  uid && console.timeEnd(uid);
}

async function refresh (url) {
  const results = await prerender.render(url);
  log('[api:generate]', url);
  await redis.set(url, results);
  return results;
}
