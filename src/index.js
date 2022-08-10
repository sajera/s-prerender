
// outsource dependencies
import url from 'node:url';
import dotenv from 'dotenv';
import http from 'node:http';
import qs from 'node:querystring';
import { v4 as uuid } from 'uuid';
import { isWebUri } from 'valid-url';

// local dependencies
import redis from './redis/index.js';
import prerender from './prerender/index.js';
import { logError, log, debug } from './log.js'

// configure
let READY;
dotenv.config({ override: false, debug: process.env.DEBUG });
const configAPI = {
  port: process.env.PORT || 80,
  host: process.env.HOST || '127.0.0.1',
};
const configRedis = {
  url: process.env.REDIS_URL,
  // name: process.env.REDIS_NAME,
  // database: process.env.REDIS_DB,
  // username: process.env.REDIS_USERNAME,
  // password: process.env.REDIS_PASSWORD,
  // commandsQueueMaxLength?: number;
  // disableOfflineQueue?: boolean;
  // readonly?: boolean;
  // legacyMode?: boolean;
  // isolationPoolOptions?: PoolOptions;
};
const configPrerender = {
  chromeLocation: process.env.CHROME_BIN,
  browserDebuggingPort: 9222,
  waitAfterLastRequest: 5e2,
  pageDoneCheckInterval: 5e2,
  pageLoadTimeout: 2e4,
  // timeoutStatusCode: null,
  // captureConsoleLog: false,
  // followRedirects: false,
  // logRequests: false,
  // enableServiceWorker: false,
  // userAgent: null,
  // chromeFlags: null, // []
};

// NOTE create
const api = http.createServer(middleware);
// api.close(() => log('[api:stopped]', `http://${configAPI.host}:${configAPI.port}/`));
log('[api:start]', `http://${configAPI.host}:${configAPI.port}/`);
api.listen(configAPI.port, configAPI.host, async () => {
  log('[redis:start]', configRedis);
  await redis.start(configRedis);
  log('[prerender:start]', configPrerender);
  await prerender.start(configPrerender);
  READY = true;
});

/**
 * Primitive middleware
 * @param request
 * @param response
 */
async function middleware (request, response) {
  let uid = process.env.DEBUG && uuid();
  uid && console.time(uid);
  const { pathname, query } = url.parse(request.url);
  const options = qs.parse(query);
  debug(`[api:request]`, { method: request.method, pathname, options });
  const prerenderURL = qs.unescape(options.url);
  try {
    if (!READY) { throw { code: 503, message: 'Service not ready yet' }; }
    if (!isWebUri(options.url)) { throw { code: 400, message: `Invalid query parameter url "${options.url}"` }; }
    let results;
    switch (pathname) {
      default: throw { code: 404, message: 'Not found' };
      case '/render':
        results = await redis.get(prerenderURL);
        results && debug('[api:cache]', prerenderURL);
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
    logError('API', { method: request.method, pathname, error });
  }
  uid && console.timeEnd(uid);
}

async function refresh (url) {
  const results = await prerender.render(url);
  await redis.set(url, results);
  return results;
}
