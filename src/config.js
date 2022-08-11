
// outsource dependencies
import dotenv from 'dotenv';

// local dependencies

dotenv.config({ override: false, debug: varBoolean(process.env.DEBUG) });
export const DEBUG = varBoolean(process.env.DEBUG);

export const API = {
  PORT: varNumber(process.env.PORT) || 80,
  HOST: varString(process.env.HOST),
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
export const PRERENDER = {
  browserDebuggingPort: varNumber(process.env.CHROME_DEBUGGING_PORT),
  forwardHeaders: varBoolean(process.env.CHROME_FORWARD_HEADERS),
  cleanupHtmlScript: varString(process.env.CHROME_CLEANUP_HTML),
  chromeLocation: varString(process.env.CHROME_BIN),
  chromeFlags: varArray(process.env.CHROME_FLAGS),
  pageDoneCheckInterval: 3e2,
  waitAfterLastRequest: 5e2,
  pageLoadTimeout: 2e4,
  enableServiceWorker: false,
  // chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
  // captureConsoleLog: false,
  // followRedirects: false,
  // logRequests: false,
  // userAgent: null,
  // chromeFlags: null, // []
};
export default { DEBUG, API, REDIS, PRERENDER };
/******************************************************
 *            variables parsers
 *****************************************************/
export function varBoolean (value) {
  return /^(true|1)$/i.test(value);
}
export function varNumber (value) {
  return parseFloat(value) || void 0;
}
export function varArray (value) {
  return value ? value.split(',') : void 0;
}
export function varString (value) {
  return /^(null|undefined)$/i.test(value) ? void 0 : value;
}
