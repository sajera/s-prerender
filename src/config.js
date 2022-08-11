
// outsource dependencies
import dotenv from 'dotenv';

// local dependencies

dotenv.config({ override: false, debug: varBoolean(process.env.DEBUG) });
export const DEBUG = varBoolean(process.env.DEBUG);

export const API = {
  PORT: varNumber(process.env.PORT) || 80,
  HOST: varString(process.env.HOST) || '127.0.0.1',
};

export const REDIS = {
  url: varString(process.env.REDIS_URL),
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
console.log('process.env.CHROME_FORWARD_HEADERS', process.env.CHROME_FORWARD_HEADERS);
console.log('process.env.CHROME_FLAGS', process.env.CHROME_FLAGS);
console.log('varArray(process.env.CHROME_FLAGS)', varArray(process.env.CHROME_FLAGS));
export const PRERENDER = {
  forwardHeaders: varBoolean(process.env.CHROME_FORWARD_HEADERS),
  chromeLocation: varString(process.env.CHROME_BIN),
  chromeFlags: varArray(process.env.CHROME_FLAGS),
  browserDebuggingPort: 9222,
  waitAfterLastRequest: 5e2,
  pageDoneCheckInterval: 5e2,
  pageLoadTimeout: 2e4,
  // chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
  // timeoutStatusCode: null,
  // captureConsoleLog: false,
  // followRedirects: false,
  // logRequests: false,
  // enableServiceWorker: false,
  // userAgent: null,
  // chromeFlags: null, // []
};
export default { DEBUG, API, REDIS, PRERENDER };
/******************************************************
 *            variables parsers
 *****************************************************/
function varBoolean (value) {
  return /^(true|1)$/i.test(value);
}
function varNumber (value) {
  return parseFloat(value) || void 0;
}
function varArray (value) {
  return value ? value.split(',') : void 0;
}
function varString (value) {
  return /^(null|undefined)$/i.test(value) ? void 0 : value;
}
