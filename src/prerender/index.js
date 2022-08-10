
// outsource dependencies
import sanitise from 'sanitize-html';

// local dependencies
import { debug } from '../log.js';
import { chrome as browser } from './chrome.js';

export default { start, render };

// configure
let END;
let CONNECTED;
process.on('SIGINT', () => {
  browser.kill();
  END = true;
  debug('[prerender:stop]');
  setTimeout(() => process.exit(), 5e2);
});

async function start (config) {
  CONNECTED = false;
  await browser.spawn(config);
  debug('[prerender:start]', config);
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
  const tab = await browser.openTab({ url, renderType: 'html' });
  debug('[prerender:tab]');
  await browser.loadUrlThenWaitForPageLoadEvent(tab, url);
  debug('[prerender:loadUrlThenWaitForPageLoadEvent]');
  // await browser.executeJavascript(tab, '');
  // debug('[prerender:executeJavascript]', tab);
  await browser.parseHtmlFromPage(tab);
  debug('[prerender:parseHtmlFromPage]');
  await browser.closeTab(tab);
  debug('[prerender:closeTab] sanitize html');
  // NOTE escape "scripts", "noscript" and "styles"
  return sanitise(tab.prerender.content, {
    allowedStyles: false,
    allowedAttributes: false,
    allowedTags: sanitise.defaults.allowedTags.concat(['head', 'meta', 'title', 'link']),
    exclusiveFilter: frame => frame.tag === 'link' && frame.attribs.rel === 'stylesheet',
  });
}

// HELPERS
const delay = (gap = 2e2) => new Promise(resolve => setTimeout(resolve, gap));
async function waitForBrowserToConnect () {
  let checks = 0;
  while (checks < 100) {
    ++checks;
    if(++checks > 100) { throw { code: 503, message: `Timed out waiting for ${browser.name} connection` }; }
    await delay(2e2);
    if (CONNECTED) { break; }
  }
}

