
// outsource dependencies


// local dependencies
import { DEBUG, debug, delay } from '../config.js';
import { chrome as browser } from './chrome.js';

export default { start, render };

// configure
let END;
let CONNECTED;
process.on('SIGINT', () => {
  browser.kill();
  END = true;
  setTimeout(() => process.exit(), 5e2);
});

async function start (config) {
  CONNECTED = false;
  await browser.spawn(config);
  debug('[prerender:start]');
  browser.onClose(() => {
    debug('[prerender:stopped]', END);
    // start(config);
  });
  await browser.connect();
  CONNECTED = true;
}

async function render (url) {
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
    await delay(2e2);
  }
  throw { code: 503, message: `Timed out waiting for ${browser.name} connection` };
}
