
// outsource dependencies
import sanitise from 'sanitize-html';

// local dependencies
import browser from './chrome.js';

export default { start, render };

// configure
const config = {
  chromeLocation: null,
  waitAfterLastRequest: 5e2,
  timeoutStatusCode: void(0),
  pageLoadTimeout: 2e4,
  pageDoneCheckInterval: 5e2,
  captureConsoleLog: false,
  followRedirects: false,
  logRequests: false,
  enableServiceWorker: false,
  userAgent: null,
  chromeFlags: null, // []
  browserDebuggingPort: 9222,
}
// NOTE care about child process
let END;
let CONNECTED;
process.on('SIGINT', () => {
  browser.kill();
  END = true;
  console.log('[prerender:stop]');
  setTimeout(() => process.exit(), 5e2);
});

async function start () {
  CONNECTED = false;
  await browser.spawn(config);
  browser.onClose(() => console.log('[prerender:stopped]', END) || !END && start());
  await browser.connect();
  console.log('[prerender:start]', browser.getChromeLocation());
  CONNECTED = true;
}

async function render (url) {
  await waitForBrowserToConnect();
  const tab = await browser.openTab({ url, renderType: 'html' });
  // console.log('[prerender:tab]');
  await browser.loadUrlThenWaitForPageLoadEvent(tab, url);
  // console.log('[prerender:loadUrlThenWaitForPageLoadEvent]');
  // await browser.executeJavascript(tab, '');
  // console.log('[prerender:executeJavascript]', tab);
  await browser.parseHtmlFromPage(tab);
  // console.log('[prerender:parseHtmlFromPage]', tab);
  await browser.closeTab(tab);
  // console.log('[prerender:prerender]', tab.prerender.content);
  // NOTE escape "scripts", "noscript" and "styles"
  return sanitise(tab.prerender.content, {
    allowedStyles: false,
    allowedAttributes: false,
    allowedTags: sanitise.defaults.allowedTags.concat(['head', 'meta', 'title', 'link']),
  });
}

// HELPERS
const delay = (gap = 2e2) => new Promise(resolve => setTimeout(resolve, gap))
async function waitForBrowserToConnect () {
  let checks = 0;
  while (checks < 100) {
    ++checks;
    if(++checks > 100) { throw { code: 503, message: `Timed out waiting for ${browser.name} connection` }; }
    await delay(2e2);
    if (CONNECTED) { break; }
  }
}

