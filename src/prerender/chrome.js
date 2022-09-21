
// outsource dependencies
import fs from 'node:fs';
import os from 'node:os';
import CDP from 'chrome-remote-interface';
import { spawn } from 'node:child_process';

// local dependencies
import { debug, delay, varBoolean, varNumber } from '../config.js';

// configure
export const chrome = { name: 'Chrome' };

chrome.spawn = options => {
  chrome.options = options;
  const location = chrome.getChromeLocation();
  if (!fs.existsSync(location)) { throw new Error('Unable to find Chrome install. Please specify with chromeLocation'); }
  if (!chrome.options.chromeFlags) { return new Error('Unable to find CHROME_FLAGS. Please specify with chromeFlags'); }
  return chrome.chromeChild = spawn(location, chrome.options.chromeFlags);
};

chrome.getChromeLocation = () => {
  if (chrome.options.chromeLocation) { return chrome.options.chromeLocation; }
  let platform = os.platform();
  switch (platform) {
    default: return null;
    case 'linux': return '/usr/bin/google-chrome';
    case 'win32': return 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
    case 'darwin': return '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
  }
};

chrome.onClose = callback => chrome.chromeChild.on('close', callback);

chrome.kill = () => chrome.chromeChild && chrome.chromeChild.kill('SIGINT');

chrome.connect = () => new Promise((resolve, reject) => {
  let connected = false;
  const timeout = setTimeout(() => reject(new Error('Browser connection timed out')), 2e4);

  const retry = () => CDP.Version({ port: chrome.options.browserDebuggingPort }).then(info => {
    chrome.originalUserAgent = info['User-Agent'];
    chrome.webSocketDebuggerURL = info.webSocketDebuggerUrl || 'ws://localhost:' + chrome.options.browserDebuggingPort + '/devtools/browser';
    clearTimeout(timeout);
    connected = true;
    debug('[prerender:ready]', info);
    resolve(info);
  }).catch(error => debug('[prerender:connect] Retrying connection to browser...', error, setTimeout(retry, 4e3)));
  setTimeout(retry, 0);
});

const connectToBrowser = async (target, port, retries = 5) => {
  try { return await CDP({ target, port }); } catch (error) {
    debug(`[prerender:connectToBrowser] Cannot connect to Browser tab/debug port=${port} retries=${retries}`, error);
    if (retries > 0) {
      await delay(5e2);
      return connectToBrowser(target, port, --retries);
    }
    throw error;
  }
};

chrome.openTab = async options => {
  const browser = await connectToBrowser(chrome.webSocketDebuggerURL, chrome.options.browserDebuggingPort);
  const { browserContextId } = await browser.Target.createBrowserContext();
  const { targetId } = await browser.Target.createTarget({ url: 'about:blank', browserContextId });
  const tab = await connectToBrowser(targetId, chrome.options.browserDebuggingPort);
  tab.browser = browser;
  tab.prerender = options;
  tab.browserContextId = browserContextId;
  tab.prerender.errors = [];
  tab.prerender.requests = {};
  tab.prerender.remainingNum = 0;
  // NOTE
  await chrome.setUpEvents(tab);
  return tab;
};

chrome.closeTab = async tab => {
  await tab.browser.Target.closeTarget({ targetId: tab.target });
  await tab.browser.Target.disposeBrowserContext({ browserContextId: tab.browserContextId });
  await tab.browser.close();
};

chrome.setUpEvents = async tab => {
  const { Page, Security, DOM, Network } = tab;
  // NOTE enable things
  await Promise.all([DOM.enable(), Page.enable(), Security.enable(), Network.enable()]);
  // NOTE ignore certificate errors of HTTPS
  await Security.setOverrideCertificateErrors({ override: true });
  // TODO seems useless
  // Security.certificateError(({ eventId }) => {
  //   debug('[prerender:setUpEvents] Security.certificateError', eventId);
  //   Security.handleCertificateError({ eventId, action: 'continue' })
  //     .catch(error => debug('[prerender:setUpEvents] error handling certificate error:', error));
  // });
  // Network.dataReceived(responseData => debug('[prerender:setUpEvents] Network.dataReceived', responseData));
  // Network.resourceChangedPriority(priorityData => debug('[prerender:setUpEvents] Network.resourceChangedPriority', priorityData));
  // NOTE provide ability to know the page rendered in s-prerender environment
  await Network.setUserAgentOverride({ userAgent: `${chrome.originalUserAgent} s-prerender (+https://github.com/sajera/s-prerender)` });
  // NOTE disable service workers
  await Network.setBypassServiceWorker({ bypass: true });
  // NOTE close blocking dialogs lets try to close it after 0.6s
  Page.javascriptDialogOpening(() => setTimeout(() => Page.handleJavaScriptDialog({ accept: true }), 6e2));
  // NOTE listen event to know the resources was loaded
  Page.domContentEventFired(({ timestamp }) => tab.prerender.domContentEventFired = timestamp);
  // NOTE listen network requests
  Network.requestWillBeSent(({ type, requestId, request, redirectResponse }) => {
    tab.prerender.remainingNum++;
    tab.prerender.requests[requestId] = `${type} => ${request.url}`;
    !tab.prerender.initialRequestId && (tab.prerender.initialRequestId = requestId);
    debug(`[prerender:setUpEvents] + Network.requestWillBeSent (${tab.prerender.remainingNum}) => ${requestId}`, String(tab.prerender.requests[requestId]).substring(0,150));
    /*******************************************************************************************
     * during a redirect, we don't get the responseReceived event for the original request,
     * so lets decrement the number of requests in flight here.
     * the original requestId is also reused for the redirected request
     *******************************************************************************************/
    if (redirectResponse) {
      tab.prerender.remainingNum--;
      debug(`[prerender:setUpEvents] - Network.requestWillBeSent (${tab.prerender.remainingNum}) => ${requestId}`, String(tab.prerender.requests[requestId]).substring(0,150));
      // NOTE weather to follow redirect default false
      const followRedirects = varBoolean(tab.prerender.followRedirects) || chrome.options.followRedirects;
      if (tab.prerender.initialRequestId === requestId && !followRedirects) {
        debug(`[prerender:setUpEvents] Initial request redirected ${redirectResponse.status} from ${request.url}`);
        // NOTE initial response of a 301 gets modified so we need to capture that
        tab.prerender.receivedRedirect = true;
        tab.prerender.lastRequestReceivedAt = new Date().getTime();
        tab.prerender.statusCode = redirectResponse.status;
        tab.prerender.headers = redirectResponse.headers;
        tab.prerender.content = redirectResponse.statusText;
        // NOTE drop remaining requests
        Page.stopLoading();
      }
    }
  });
  // NOTE listen network request results
  Network.responseReceived(({ type, requestId, response }) => {
    // NOTE mark results as dirty in case receiving errors
    response.status >= 500 && response.status < 600 && (tab.prerender.dirtyRender = true);
    if (requestId == tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {
      debug(`[prerender:setUpEvents] Page loaded ${response.status} => ${response.url}`);
      tab.prerender.statusCode = response.status;
      tab.prerender.headers = response.headers;
      // NOTE 304 from the server turn into 200
      tab.prerender.statusCode == 304 && (tab.prerender.statusCode = 200);
    }
    // TODO investigate
    if (type === 'EventSource') {
      tab.prerender.remainingNum--; // 0 ???
      tab.prerender.lastRequestReceivedAt = new Date().getTime();
      debug(`[prerender:setUpEvents] - Network.responseReceived (${tab.prerender.remainingNum}) => ${requestId}`, String(tab.prerender.requests[requestId]).substring(0,150));
    }
  });
  // NOTE listen network request loading done
  Network.loadingFinished(({ requestId }) => {
    tab.prerender.initialRequestId === requestId && debug('[prerender:setUpEvents] Initial request finished');
    if (!tab.prerender.requests[requestId]) { return; }
    tab.prerender.remainingNum--;
    tab.prerender.lastRequestReceivedAt = new Date().getTime();
    debug(`[prerender:setUpEvents] - Network.loadingFinished (${tab.prerender.remainingNum}) => ${requestId}`, String(tab.prerender.requests[requestId]).substring(0,150));
  });
  // NOTE Page.stopLoading will fire this event for all remaining requests
  Network.loadingFailed(({ requestId }) => {
    tab.prerender.initialRequestId === requestId && debug('[prerender:setUpEvents] Initial request failed to load');
    if (!tab.prerender.requests[requestId]) { return; }
    tab.prerender.remainingNum--;
    tab.prerender.requests[requestId] = 'FAILED: ' + tab.prerender.requests[requestId];
    debug(`[prerender:setUpEvents] - Network.loadingFailed (${tab.prerender.remainingNum}) => ${requestId}`, String(tab.prerender.requests[requestId]).substring(0,150));
  });
};

chrome.loadUrlThenWaitForPageLoadEvent = tab => new Promise((resolve, reject) => {
  let finished = false;
  const { Page, Emulation } = tab;

  Page.enable().then(() => {
    const pageDoneCheckInterval = varNumber(tab.prerender.pageDoneCheckInterval) || chrome.options.pageDoneCheckInterval;
    const checkIfDone = () => {
      if (finished) { return; }
      chrome.checkIfPageIsDoneLoading(tab).then(doneLoading => {
        if (doneLoading && !finished) {
          finished = true;
          resolve();
        }

        if (!doneLoading && !finished) { setTimeout(checkIfDone, pageDoneCheckInterval); }
      }).catch(error => {
        finished = true;
        debug('[prerender:loadUrlThenWaitForPageLoadEvent] Chrome connection closed during request', error);
        tab.prerender.errors.push({ prerender: 'Chrome connection closed during request', error });
        tab.prerender.statusCode = 504;
        reject(error);
      });
    };
    // NOTE handle timeout for page rendering
    setTimeout(() => {
      if (finished) { return; }
      debug('[prerender:loadUrlThenWaitForPageLoadEvent] Page timed out', tab.prerender.url);
      tab.prerender.errors.push({ prerender: 'Page timed out' });
      tab.prerender.statusCode = 504;
      tab.prerender.timedout = true;
      finished = true;
      resolve();
    }, varNumber(tab.prerender.pageLoadTimeout) || chrome.options.pageLoadTimeout);
    // NOTE a bit prepare tab view
    const width = parseInt(tab.prerender.width, 10) || 1440;
    const height = parseInt(tab.prerender.height, 10) || 718;
    Emulation.setDeviceMetricsOverride({ height, screenHeight: height, width, screenWidth: width, deviceScaleFactor: 0, mobile: false });
    // NOTE weather to force awaiting from page updating the "prerenderReady" - in most cases will lead to render timeout
    // Page.addScriptToEvaluateOnNewDocument({ source: 'window.prerenderReady = false;' });
    //
    Page.navigate({ url: tab.prerender.url }).then(({ errorText }) => {
      if (errorText && errorText !== 'net::ERR_ABORTED') {
        debug(`[prerender:loadUrlThenWaitForPageLoadEvent] Navigation error: ${errorText}`, tab.prerender.url);
        tab.prerender.errors.push({ prerender: 'Navigation error', error: errorText });
        tab.prerender.navigateError = errorText;
        Page.stopLoading();
      }
      // TODO WTF ?
      if (typeof onNavigated === 'function') { return Promise.resolve(onNavigated()); }
    }).then(() => setTimeout(checkIfDone, pageDoneCheckInterval)).catch(error => {
      debug('[prerender:loadUrlThenWaitForPageLoadEvent] Invalid URL sent to Browser:', tab.prerender.url);
      tab.prerender.errors.push({ prerender: 'Invalid URL sent to Browser', error });
      tab.prerender.statusCode = error.code = 504;
      finished = true;
      reject(error);
    });
  }).catch(error => {
    debug('[prerender:loadUrlThenWaitForPageLoadEvent] Unable to load URL', tab.prerender.url);
    tab.prerender.errors.push({ prerender: 'Unable to load URL', error });
    tab.prerender.statusCode = error.code = 504;
    finished = true;
    reject(error);
  });
});

chrome.checkIfPageIsDoneLoading = tab => new Promise((resolve, reject) => {
  debug('[prerender:checkIfPageIsDoneLoading] remainingNum', tab.prerender.remainingNum);
  if (tab.prerender.navigateError) { return resolve(true); }
  if (tab.prerender.receivedRedirect) { return resolve(true); }
  if (!tab.prerender.domContentEventFired) { return resolve(false); }
  tab.Runtime.evaluate({ expression: 'window.prerenderReady' }).then(({ result }) => {
    // NOTE ability to allow page to decide is it ready or no
    if (typeof result.value === 'boolean') {
      if (!result.value) { return resolve(false) || debug('[prerender:checkIfPageIsDoneLoading] Page says NOT ready yet...'); }
      tab.prerender.firstReadyTime = tab.prerender.firstReadyTime || new Date().getTime();
      debug('[prerender:checkIfPageIsDoneLoading] Page says ready at', new Date(tab.prerender.firstReadyTime).toISOString());
    // NOTE check finishing all requests
    } if (tab.prerender.remainingNum < 1) {
      tab.prerender.firstReadyTime = tab.prerender.firstReadyTime || new Date().getTime();
      debug('[prerender:checkIfPageIsDoneLoading] All page request was finished at', new Date(tab.prerender.firstReadyTime).toISOString());
    }
    // NOTE we should give a bit time after page ready to render data in html
    const readyDelay = tab.prerender.pageReadyDelay || chrome.options.pageReadyDelay;
    if (tab.prerender.firstReadyTime + readyDelay < new Date().getTime()) { resolve(true); }
    resolve(false);
  }).catch(error => {
    debug('[prerender:checkIfPageIsDoneLoading] Unable to evaluate javascript on the page', error);
    tab.prerender.errors.push({ prerender: 'Unable to evaluate javascript on the page', error });
    error.code = 504;
    reject(error);
  });
});

chrome.parseHtmlFromPage = tab => new Promise(async (resolve, reject) => {
  const timeout = setTimeout(() => {
    const error = new Error('Parse html timed out');
    error.code = 504;
    reject(error);
  }, 5e3);

  const { result: { value: html }} = await tab.Runtime.evaluate({ expression: 'window.document.firstElementChild.outerHTML;' });
  if (!html) {
    const error = new Error('Unable to parse HTML');
    error.code = 500;
    reject(error);
  }

  let DOCTYPE = '';
  try {
    let { result: { value: doctype }} = await tab.Runtime.evaluate({ expression: 'JSON.stringify({ name: document.doctype.name, sid: document.doctype.systemId, pid: document.doctype.publicId })' });
    doctype = JSON.parse(doctype);
    const PUBLIC = doctype.pid ? ` PUBLIC "${doctype.pid}"` : doctype.sid ? ` SYSTEM "${doctype.sid}"`: '';
    DOCTYPE = `<!DOCTYPE ${doctype.name}${PUBLIC}>`;
  } catch (error) {
    debug('[prerender:parseHtmlFromPage] Unable to get DOCTYPE of the Page', error.message);
    tab.prerender.errors.push({ prerender: 'Unable to get DOCTYPE of the Page', error });
  }
  clearTimeout(timeout);
  resolve(DOCTYPE + html);
});

chrome.executeJavascript = (tab, expression) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    const error = new Error('Javascript executes timed out');
    error.code = 504;
    reject(error);
  }, 6e2);

  tab.Runtime.evaluate({ expression }).then(({ result: { value } }) => {
    clearTimeout(timeout);
    resolve(value && JSON.parse(value));
  });
});
