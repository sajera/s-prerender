
// outsource dependencies
import sanitise from 'sanitize-html';

// local dependencies
import { debug, delay } from '../config.js';
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
  // console.time('loadUrlThenWaitForPageLoadEvent');
  debug('[prerender:loadUrlThenWaitForPageLoadEvent]');
  await browser.loadUrlThenWaitForPageLoadEvent(tab);
  // console.timeEnd('loadUrlThenWaitForPageLoadEvent');
  // TODO remove - just example
  debug('[prerender:executeJavascript]');
  await browser.executeJavascript(tab, `var c = document.getElementsByTagName('noscript'); while(c.length) c[0].remove();`);
  debug('[prerender:parseHtmlFromPage]');
  const html = await browser.parseHtmlFromPage(tab);
  debug('[prerender:closeTab]');
  await browser.closeTab(tab);
  debug('[prerender:sanitizeHTML]');
  return sanitise(html, {
    allowedStyles: false,
    decodeEntities: false,
    allowedAttributes: false,
    allowedTags: sanitise.defaults.allowedTags.concat([
      'head', 'body', 'meta', 'title', 'link', 'img', 'svg', 'path',
      'input', 'label', 'button', 'textarea', 'br', 'hr', 'code'
    ]),
    // disallowedTagsMode: false,
    // NOTE disallow links with "href"
    // exclusiveFilter: frame => frame.tag === 'link' && frame.attribs.rel === 'stylesheet',
  });
}

// HELPERS
const waitForBrowserToConnect = async (retries = 100) => {
  while (retries-- > 0) {
    if (CONNECTED) { return true; }
    await delay(2e2);
  }
  throw { code: 503, message: `Timed out waiting for ${browser.name} connection` };
}
