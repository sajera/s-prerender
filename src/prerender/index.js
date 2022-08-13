
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
    // debug('[prerender:stopped]', END) || !END && start(config)
  });
  await browser.connect();
  // debug('[prerender:start]', { bin: browser.getChromeLocation() });
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
  debug('[prerender:executeJavascript] scriptCleanHTML');
  await browser.executeJavascript(tab, scriptCleanHTML);
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

const scriptCleanHTML = `(tags => {
  for(const tag of tags) {
    const collection = document.getElementsByTagName(tag);
    while(collection.length) collection[0].remove();
  }
})(['noscript', 'script', 'style'])`;
