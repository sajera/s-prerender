
// outsource dependencies
import dotenv from 'dotenv';

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
// NOTE strict dotenv rules to avoid unexpected process environment - .env is defaults with minimal priority
dotenv.config({ override: false, debug: varBoolean(process.env.DEBUG) });
// NOTE reading any variables only after reading defaults to make sure the minimal required data was set
export const DEBUG = varBoolean(process.env.DEBUG);
// NOTE
export const API = {
  port: varNumber(process.env.PORT),
  host: varString(process.env.HOST),
  allowDomains: varArray(process.env.ALLOW_DOMAINS) || ['.'],
};
// NOTE for now RabbitMQ only
export const QUEUE = {
  rabbitmq: Boolean(process.env.RABBITMQ_URL),
  rabbitmqUrl: varString(process.env.RABBITMQ_URL),
  rabbitmqQueue: varString(process.env.RABBITMQ_QUEUE),
  rabbitmqChannels: varNumber(process.env.RABBITMQ_CHANNELS),
};
// NOTE for now Redis only
export const CACHE = {
  redis: Boolean(process.env.REDIS_URL),
  redisUrl: varString(process.env.REDIS_URL),
};
// NOTE Chrome/Chromium only
export const PRERENDER = {
  browserDebuggingPort: varNumber(process.env.CHROME_DEBUGGING_PORT),
  chromeLocation: varString(process.env.CHROME_BIN),
  chromeFlags: varArray(process.env.CHROME_FLAGS),
  // chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
  renderTimeout: varNumber(process.env.CHROME_RENDER_TIMEOUT) || 5e4, // Maximum time for all pre-rendering process including connection and dilay
  pageLoadTimeout: varNumber(process.env.CHROME_PAGE_LOAD_TIMEOUT) || 2e4, // Maximum time to page rendering
  pageReadyDelay: varNumber(process.env.CHROME_PAGE_READY_DELAY) || 3e2, // Give a bit time after last request to render data in html or trigger more requests
  pageDoneCheckInterval: varNumber(process.env.CHROME_PAGE_DONE_CHECK_INTERVAL) || 3e2, // How often page should be checked about ready state
  followRedirects: varBoolean(process.env.CHROME_FOLLOW_REDIREC), // Weather to follow redirect
  cleanupHtmlScript: varString(process.env.CHROME_CLEANUP_HTML_SCRIPT) || defaultCleanupHtmlScript(), // ability to pass string with JS to execute on all pages
};
export const config = { API, CACHE, PRERENDER, QUEUE };
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
// TODO way to setup js for rendered page
export function defaultCleanupHtmlScript () {
  return `(tags => {
  for(const tag of tags) {
    const collection = document.getElementsByTagName(tag);
    while(collection.length) collection[0].remove();
  }
})(['noscript', 'script', 'style'])`;
}
/******************************************************
 *               HELPERS
 *****************************************************/
export const delay = (gap = 2e2) => new Promise(resolve => setTimeout(resolve, gap));
export const log = (text, info) => logWithTime(text, info);
export const logError = (text, error) => logWithTime(`\x1B[0m\x1B[31m(ERROR:${text})\x1B[39m\x1B[0m`, error);
export const debug = (text, info) => DEBUG && logWithTime(`\x1B[0m\x1B[37m${text}\x1B[39m\x1B[0m`, info);
const logWithTime = (text, data) => console.log(
  DEBUG ? `\x1B[0m\x1B[37m[${new Date().toISOString()}]\x1B[39m\x1B[0m` : `[${new Date().toISOString()}]`,
  // `\x1B[0m\x1B[37m[${new Date().toLocaleDateString()}:${new Date().toLocaleTimeString()}]\x1B[39m\x1B[0m`,
  text,
  data === undefined ? '' : DEBUG ? JSON.stringify(data, null, 4) : JSON.stringify(data),
);
/**********************
 *     ??\(???)/??      *
 *********************/
export const suid = (base = 'XXXX') => base.replace(/[X|S|N|H]/g, sib => (
  sib === 'X' ? Math.random()*32|0
    : sib === 'N' ? Math.random()*10|0
      : sib === 'H' ? Math.random()*16|0
        : /*sib == 'S'*/Math.random()*32|10
).toString(32));
/**********************
 *      ???(???)???       *
 *********************/
const urlRegExp = /(?:https?):\/\/(\w+:?\w*)?(\S+)(:\d+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
export const isUrl = url => {
  // NOTE is url at all
  if (!urlRegExp.test(url)) { return false; }
  // NOTE url should match at least one domain from allowed
  for (let domain of API.allowDomains) {
    const regExp = new RegExp(domain);
    if (regExp.test(url)) { return true; }
  }
};
