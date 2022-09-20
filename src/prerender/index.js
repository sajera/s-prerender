
// outsource dependencies


// local dependencies
import { chrome as browser } from './chrome.js';
import { DEBUG, debug, delay, log } from '../config.js';

// NOTE required interface for "prerender"
export default { start, render, isReady };

// configure
let CONNECTED;
process.on('SIGINT', () => {
  browser.kill();
  setTimeout(() => process.exit(), 5e2);
});

export function isReady () { return CONNECTED; }

export async function start (config) {
  log('[prerender:starting]', config);
  browser.kill();
  await browser.spawn(config);
  browser.onClose(() => log('[prerender:stopped]', CONNECTED = false));
  await browser.connect();
  CONNECTED = true;
  log('[prerender:started]');
}

export async function render (url) {
  await waitForBrowserToConnect();
  debug('[prerender:tab]');
  const tab = await browser.openTab({ url });
  debug('[prerender:loadUrlThenWaitForPageLoadEvent]');
  DEBUG && console.time('loadUrlThenWaitForPageLoadEvent');
  await browser.loadUrlThenWaitForPageLoadEvent(tab);
  DEBUG && console.timeEnd('loadUrlThenWaitForPageLoadEvent');
  // TODO ability to setup scripts via API
  if (typeof browser.options.cleanupHtmlScript === 'string') {
    debug('[prerender:executeJavascript] cleanupHtmlScript');
    await browser.executeJavascript(tab, browser.options.cleanupHtmlScript);
  }
  debug('[prerender:parseHtmlFromPage]');
  const html = await browser.parseHtmlFromPage(tab);
  debug('[prerender:closeTab]');
  await browser.closeTab(tab);
  // debug('[prerender:logs]', tab.prerender);
  return html;
}

// HELPERS
const waitForBrowserToConnect = async (retries = 100) => {
  while (retries-- > 0) {
    if (CONNECTED) { return true; }
    debug('[prerender:browser] Connecting...', retries);
    await delay(2e2);
  }
  throw { code: 503, message: `Timed out waiting for ${browser.name} connection` };
}
