
// setup process.env before any imports
import './config.js';

// outsource dependencies
import url from 'node:url';
import http from 'node:http';
import qs from 'node:querystring';
import { v4 as uuid } from 'uuid';
import { isWebUri } from 'valid-url';

// local dependencies
import redis from './redis/index.js';
import prerender from './prerender/index.js';

// configure
let READY;
const port = process.env.PORT || 80;
const host = process.env.HOST || '127.0.0.1';

// NOTE create
const server = http.createServer(middleware);
// server.close(() => console.warn('[server:stopped]', `http://${host}:${port}/`));
// NOTE starting
server.listen(port, host, async () => {
  console.warn('[server:start]', `http://${host}:${port}/`);
  await redis.start();
  await prerender.start();
  READY = true;
});

// TODO handle better
process.on('unhandledRejection', error => { throw error; });
process.on('uncaughtException', error => console.log('[process:uncaughtException]', error, process.exit(1)));

/**
 * Primitive middleware
 * @param request
 * @param response
 */
async function middleware (request, response) {
  const uid = uuid();
  console.time(`[server:${uid}]`);
  const { pathname, query } = url.parse(request.url);
  const options = qs.parse(query);
  const prerenderURL = qs.unescape(options.url);
  try {
    if (!READY) { throw { code: 503, message: 'Service not ready yet' }; }
    if (!isWebUri(options.url)) { throw { code: 400, message: `Invalid query parameter url "${options.url}"` }; }
    let results;
    switch (pathname) {
      default: throw { code: 404, message: 'Not found' };
      case '/render':
        results = await redis.get(prerenderURL);
        results && console.log('[server:cache]', prerenderURL);
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
    console.error('[server:error]', request.method, pathname, '=>', error.code, error.message, error);
  }
  console.timeEnd(`[server:${uid}]`);
}

async function refresh (url) {
  const results = await prerender.render(url);
  await redis.set(url, results);
  return results;
}
