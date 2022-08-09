
// outsource dependencies
import sanitise from 'sanitize-html';

// local dependencies
import browser from './chrome.js';

// configure
const config = {
  waitAfterLastRequest: 5e2,
  timeoutStatusCode: void(0),
  pageLoadTimeout: 2e4,
  pageDoneCheckInterval: 5e2,
  captureConsoleLog: false,
  followRedirects: false,
  logRequests: false,
  enableServiceWorker: false,
  userAgent: null,
  chromeLocation: null,
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

export async function start () {
  CONNECTED = false;
  console.log('[prerender:start]');
  await browser.spawn(config);
  browser.onClose(() => console.log('[prerender:close]', END) || !END && start());
  await browser.connect();
  CONNECTED = true;
}

export async function render (url) {
  await waitForBrowserToConnect();
  const tab = await browser.openTab({ url, renderType: 'html' });
  // console.log('[prerender:tab]');
  await browser.loadUrlThenWaitForPageLoadEvent(tab, url);
  // console.log('[prerender:loadUrlThenWaitForPageLoadEvent]');
  // await browser.executeJavascript(tab, req.prerender.javascript);
  // console.log('[prerender:executeJavascript]', tab);
  await browser.parseHtmlFromPage(tab);
  // console.log('[prerender:parseHtmlFromPage]');
  await browser.closeTab(tab);
  // console.log('[prerender:prerender]', tab.prerender.content);
  return sanitise(tab.prerender.content);
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

