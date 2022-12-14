
// outsource dependencies


// local dependencies
import { chrome as browser } from './chrome.js';
import { DEBUG, debug, delay, log, suid } from '../config.js';

// NOTE required interface for "prerender"
export default { start, isReady, render };

// configure
let CONNECTED;
process.on('SIGINT', () => {
  browser.kill();
  setTimeout(() => process.exit(), 5e2);
});

export function isReady () { return CONNECTED; }

export async function start (config) {
  log('[prerender:connecting]', config);
  browser.kill();
  await browser.spawn(config);
  browser.onClose(() => log('[prerender:stopped]', CONNECTED = false, start(config)));
  const info = await browser.connect();
  CONNECTED = true;
  log('[prerender:started]', info);
}

// TODO ERROR:[service:unhandledRejection]
export function render (url) {
  return new Promise(async (resolve, reject) => {
    let tab;
    const timeout = setTimeout(() => {
      browser.closeTab(tab);
      const error = new Error(`Timed out waiting for ${browser.name} rendering process`);
      error.code = 504;
      reject(error);
    }, browser.options.renderTimeout);
    try {
      debug('[prerender:tab]');
      tab = await browser.openTab({ url });
      debug('[prerender:loadUrlThenWaitForPageLoadEvent]');
      const uid = DEBUG && suid('loadUrlThenWaitForPageLoadEvent-XXXX-NNN');
      uid && console.time(uid);
      await browser.loadUrlThenWaitForPageLoadEvent(tab);
      uid && console.timeEnd(uid);
      // NOTE ability to set up scripts via API
      if (typeof browser.options.cleanupHtmlScript === 'string') {
        debug('[prerender:executeJavascript] cleanupHtmlScript');
        await browser.executeJavascript(tab, browser.options.cleanupHtmlScript);
      }
      debug('[prerender:parseHtmlFromPage]');
      const html = await browser.parseHtmlFromPage(tab);
      resolve(html);
    } catch (error) {
      // tab && debug('[prerender:errors]', tab.prerender.errors);
      reject(error);
    } finally {
      clearTimeout(timeout);
      browser.closeTab(tab)
    }
  });
}
