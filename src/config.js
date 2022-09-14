
// outsource dependencies
import dotenv from 'dotenv';

// local dependencies

dotenv.config({ override: false, debug: varBoolean(process.env.DEBUG) });
export const DEBUG = varBoolean(process.env.DEBUG);

export const API = {
  port: varNumber(process.env.PORT) || 80,
  host: varString(process.env.HOST) || '0.0.0.0',
  renderFallback: varBoolean(process.env.RENDER_FALLBACK),
};
// NOTE for now Redis only
export const CACHE = {
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
  chromeLocation: varString(process.env.CHROME_BIN),
  chromeFlags: varArray(process.env.CHROME_FLAGS),
  // chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
  pageLoadTimeout: varNumber(process.env.CHROME_PAGE_LOAD_TIMEOUT) || 2e4, // Maximum time to page rendering
  pageReadyDelay: varNumber(process.env.CHROME_PAGE_READY_DELAY) || 3e2, // Give a bit time after last request to render data in html or trigger more requests
  pageDoneCheckInterval: varNumber(process.env.CHROME_PAGE_DONE_CHECK_INTERVAL) || 3e2, // How often page should be checked about ready state
  followRedirects: varBoolean(process.env.CHROME_FOLLOW_REDIREC) || false, // Weather to follow redirect
  cleanupHtmlScript: varString(process.env.CHROME_CLEANUP_HTML_SCRIPT) || defaultCleanupHtmlScript(), // ability to pass string with JS to execute on all pages
};
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
export function defaultCleanupHtmlScript () {
  return `(tags => {
  for(const tag of tags) {
    const collection = document.getElementsByTagName(tag);
    while(collection.length) collection[0].remove();
  }
})(['noscript', 'script', 'style'])`;
}
/******************************************************
 *        ¯\(ヅ)/¯ helpers ᕦ(ツ)ᕤ
 *****************************************************/
export const delay = (gap = 2e2) => new Promise(resolve => setTimeout(resolve, gap));
export const log = (text, info) => logWithTime(text, info);
export const logError = (text, error) => logWithTime(`\x1B[0m\x1B[31m(ERROR:${text})\x1B[39m\x1B[0m`, error);
export const debug = (text, info) => DEBUG && logWithTime(`\x1B[0m\x1B[37m${text}\x1B[39m\x1B[0m`, info);
const logWithTime = (text, data) => console.log(
  `\x1B[0m\x1B[37m[${new Date().toISOString()}]\x1B[39m\x1B[0m`,
  // `\x1B[0m\x1B[37m[${new Date().toLocaleDateString()}:${new Date().toLocaleTimeString()}]\x1B[39m\x1B[0m`,
  text,
  data === undefined ? '' : DEBUG ? JSON.stringify(data, null, 4) : JSON.stringify(data),
);
const urlRegExp = /(?:https?):\/\/(\w+:?\w*)?(\S+)(:\d+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
export const isUrl = url => urlRegExp.test(url);
