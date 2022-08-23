
// outsource dependencies
import url from 'node:url';
import { v4 as uuid } from 'uuid';
import { createServer } from 'node:http';

// local dependencies
import { logError, log, DEBUG } from '../config.js';

// NOTE required interface for "api"
export default { start, isReady, middleware };

// configure
let api;

export function isReady () { return Boolean(api && api.address()); }

export function start (config) {
  isReady() && api.close(() => log('[api:stopped]'));
  return new Promise(resolve => {
    api = createServer(middleware);
    log('[api:starting]', config);
    api.listen(config.port, config.host, () => {
      log('[api:started]', `http://${config.host}:${config.port}/`);
      resolve();
    });
  });
}

export async function middleware (request, response) {
  let uid = DEBUG && uuid();
  uid && console.time(uid);
  request.url = url.parse(request.url);
  log(`[api:request] ${uid} ${request.method}:${request.url.pathname}`);
  try {
    const endpoint = middleware[request.url.pathname];
    if (!endpoint) { throw { code: 404, message: 'Not found' }; }
    const results = await endpoint(request, response);
    response.setHeader('Content-Type', endpoint.contentType || 'text/plain');
    response.statusCode = 200;
    response.end(results);
  } catch ({ code = 500, message, stack }) {
    response.statusCode = code;
    response.setHeader('Content-Type', 'text/plain');
    response.end(`[ERROR:${code}] ${message}`);
    logError(`API ${code}`, { [request.method]: request.url.pathname, message, stack });
  }
  uid && console.timeEnd(uid);
}