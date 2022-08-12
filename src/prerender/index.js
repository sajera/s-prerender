
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
  const tab = await browser.openTab({ url });
  debug('[prerender:tab]');
  // console.time('loadUrlThenWaitForPageLoadEvent');
  await browser.loadUrlThenWaitForPageLoadEvent(tab);
  // console.timeEnd('loadUrlThenWaitForPageLoadEvent');
  debug('[prerender:loadUrlThenWaitForPageLoadEvent]');
  // TODO remove - just example
  await browser.executeJavascript(tab, `var c = document.getElementsByTagName('noscript'); while(c.length) c[0].remove();`);
  debug('[prerender:executeJavascript]');
  const html = await browser.parseHtmlFromPage(tab);
  debug('[prerender:parseHtmlFromPage]');
  await browser.closeTab(tab);
  debug('[prerender:closeTab] sanitize html');
  const result = sanitise(html, {
    allowedStyles: false,
    decodeEntities: false,
    allowedAttributes: false,
    allowedTags: sanitise.defaults.allowedTags.concat([
      'head', 'body', 'meta', 'title', 'link', 'img', 'svg', 'input', 'label', 'button', 'textarea',
      'img', 'br', 'hr'
    ]),
    // disallowedTagsMode: false,
    // NOTE disallow links with "href"
    // exclusiveFilter: frame => frame.tag === 'link' && frame.attribs.rel === 'stylesheet',
  });
  debug('[prerender:sanitizeHTML]');

  return result;
}

// HELPERS
const waitForBrowserToConnect = async (retries = 100) => {
  while (retries-- > 0) {
    if (CONNECTED) { return true; }
    await delay(2e2);
  }
  throw { code: 503, message: `Timed out waiting for ${browser.name} connection` };
}
