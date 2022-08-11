
// outsource dependencies
import fs from 'node:fs';
import os from 'node:os';
import CDP from 'chrome-remote-interface';
import { spawn } from 'node:child_process';

// local dependencies
import { debug } from '../log.js';
import { varBoolean, varNumber } from '../config.js';

// configure
export const chrome = { name: 'Chrome' };

const sleep = (durationMs) => new Promise((resolve) => setTimeout(() => { resolve() }, durationMs));
const ChromeConnectionClosed = 'ChromeConnectionClosed';
const UnableToLoadURL = 'UnableToLoadURL';
const UnableToEvaluateJavascript = 'UnableToEvaluateJavascript';
const ParseHTMLTimedOut = 'ParseHTMLTimedOut';
const UnableToParseHTML = 'UnableToParseHTML';

chrome.spawn = options => new Promise((resolve, reject) => {
  chrome.options = options;
  const location = chrome.getChromeLocation();

  if (!fs.existsSync(location)) {
    const error = new Error('Unable to find Chrome install. Please specify with chromeLocation');
    debug('[prerender:spawn]', error);
    return reject(error);
  }
  if (!chrome.options.chromeFlags) {
    const error = new Error('Unable to find CHROME_FLAGS. Please specify with chromeFlags');
    debug('[prerender:spawn]', error);
    return reject(error);
  }
  chrome.chromeChild = spawn(location, chrome.options.chromeFlags);
  resolve(chrome);
});

chrome.onClose = callback => chrome.chromeChild.on('close', callback);

chrome.kill = () => chrome.chromeChild && chrome.chromeChild.kill('SIGINT');

chrome.connect = () => new Promise((resolve, reject) => {
  let connected = false;
  let timeout = setTimeout(() => !connected && reject(), 2e4);

  let connect = () => CDP.Version({ port: chrome.options.browserDebuggingPort }).then((info) => {
    chrome.originalUserAgent = info['User-Agent'];
    chrome.webSocketDebuggerURL = info.webSocketDebuggerUrl || 'ws://localhost:' + chrome.options.browserDebuggingPort + '/devtools/browser';

    clearTimeout(timeout);
    connected = true;
    debug('[prerender:ready]', info);
    resolve(info);
  }).catch(error => {
    debug('[prerender:connect] retrying connection to Chrome...', error);
    return setTimeout(connect, 1000);
  });

  setTimeout(connect, 500);

});

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

chrome.openTab = function (options) {
  return new Promise((resolve, reject) => {

    let browserContext = null;
    let browser = null;

    const connectToBrowser = async (target, port) => {
      let remainingRetries = 5;
      for(;;) {
        try {
          return await CDP({ target, port });
        } catch (error) {
          debug(`[prerender:openTab] Cannot connect to browser port=${port} remainingRetries=${remainingRetries}`, error);
          if (remainingRetries <= 0) {
            throw error;
          } else {
            remainingRetries -= 1;
            await sleep(500);
          }
        }
      }
    };

    connectToBrowser(this.webSocketDebuggerURL, this.options.browserDebuggingPort)
      .then((chromeBrowser) => {
        browser = chromeBrowser;

        return browser.Target.createBrowserContext();
      }).then(({ browserContextId }) => {

      browserContext = browserContextId;

      return browser.Target.createTarget({
        url: 'about:blank',
        browserContextId
      });
    }).then(({ targetId }) => {

      return connectToBrowser(targetId, this.options.browserDebuggingPort);
    }).then((tab) => {

      //we're going to put our state on the chrome tab for now
      //we should clean this up later
      tab.browserContextId = browserContext;
      tab.browser = browser;
      tab.prerender = options;
      tab.prerender.errors = [];
      tab.prerender.requests = {};
      tab.prerender.numRequestsInFlight = 0;

      return this.setUpEvents(tab);
    }).then((tab) => {

      resolve(tab);
    }).catch((err) => { reject(err) });
  });
};

chrome.closeTab = tab => new Promise((resolve, reject) => {
  tab.browser.Target.closeTarget({ targetId: tab.target })
    .then(() => tab.browser.Target.disposeBrowserContext({ browserContextId: tab.browserContextId }))
    .then(() => tab.browser.close())
    .then(() => resolve())
    .catch(error => {
      debug(`[prerender:closeTab]`, error);
      reject(error);
    });
});

chrome.setUpEvents = async tab => {
  const { Page, Security, DOM, Network, Log, Console } = tab;
  await Promise.all([DOM.enable(), Page.enable(), Security.enable(), Network.enable(), Log.enable(), Console.enable()]);

  //hold onto info that could be used later if saving a HAR file
  tab.prerender.pageLoadInfo = {
    url: tab.prerender.url,
    firstRequestId: undefined,
    firstRequestMs: undefined,
    domContentEventFiredMs: undefined,
    loadEventFiredMs: undefined,
    entries: {},
    logEntries: [],
    user: undefined
  };

  // set overrides
  await Security.setOverrideCertificateErrors({ override: true });
  await Network.setUserAgentOverride({ userAgent: `${chrome.originalUserAgent} s-prerender (+https://github.com/sajera/s-prerender)` });

  const bypass = !(chrome.options.enableServiceWorker || varBoolean(tab.prerender.enableServiceWorker));
  await Network.setBypassServiceWorker({ bypass });

  // set up handlers
  Page.domContentEventFired(({ timestamp }) => {
    tab.prerender.domContentEventFired = true;
    tab.prerender.pageLoadInfo.domContentEventFiredMs = timestamp * 1e3;
  });

  Page.loadEventFired(({ timestamp }) => {
    tab.prerender.pageLoadInfo.loadEventFiredMs = timestamp * 1e3;
  });

  //if the page opens up a javascript dialog, lets try to close it after 1s
  Page.javascriptDialogOpening(() => setTimeout(() => Page.handleJavaScriptDialog({ accept: true }), 1e3));

  Security.certificateError(({ eventId }) => {
    Security.handleCertificateError({ eventId, action: 'continue' })
      .catch(error => debug('[prerender:setUpEvents] error handling certificate error:', error));
  });

  Network.requestWillBeSent(params => {
    tab.prerender.numRequestsInFlight++;
    tab.prerender.requests[params.requestId] = params.request.url;
    if (tab.prerender.logRequests || chrome.options.logRequests) debug('[prerender:setUpEvents] +', tab.prerender.numRequestsInFlight, params.request.url);

    if (!tab.prerender.initialRequestId) {
      debug(`[prerender:setUpEvents] Initial request to ${params.request.url}`);
      tab.prerender.initialRequestId = params.requestId;
      tab.prerender.pageLoadInfo.firstRequestId = params.requestId;
      tab.prerender.pageLoadInfo.firstRequestMs = params.timestamp * 1000;
    }

    tab.prerender.pageLoadInfo.entries[params.requestId] = {
      requestParams: params,
      responseParams: undefined,
      responseLength: 0,
      encodedResponseLength: undefined,
      responseFinishedS: undefined,
      responseFailedS: undefined,
      responseBody: undefined,
      responseBodyIsBase64: undefined,
      newPriority: undefined
    };

    if (params.redirectResponse) {
      //during a redirect, we don't get the responseReceived event for the original request,
      //so lets decrement the number of requests in flight here.
      //the original requestId is also reused for the redirected request
      tab.prerender.numRequestsInFlight--;

      let redirectEntry = tab.prerender.pageLoadInfo.entries[params.requestId];
      redirectEntry.responseParams = { response: params.redirectResponse };
      redirectEntry.responseFinishedS = params.timestamp;
      redirectEntry.encodedResponseLength = params.redirectResponse.encodedDataLength;

      if (tab.prerender.initialRequestId === params.requestId && !varBoolean(tab.prerender.followRedirects) && !chrome.options.followRedirects) {
        debug(`[prerender:setUpEvents] Initial request redirected from ${params.request.url} with status code ${params.redirectResponse.status}`);
        tab.prerender.receivedRedirect = true; //initial response of a 301 gets modified so we need to capture that we saw a redirect here
        tab.prerender.lastRequestReceivedAt = new Date().getTime();
        tab.prerender.statusCode = params.redirectResponse.status;
        tab.prerender.headers = params.redirectResponse.headers;
        tab.prerender.content = params.redirectResponse.statusText;

        Page.stopLoading();
      }
    }
  });

  Network.dataReceived(({ requestId, dataLength }) => {
    const entry = tab.prerender.pageLoadInfo.entries[requestId];
    if (!entry) { return; }
    entry.responseLength += dataLength;
  });

  Network.responseReceived(params => {
    let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
    if (entry) { entry.responseParams = params; }

    if (params.requestId == tab.prerender.initialRequestId && !tab.prerender.receivedRedirect) {
      debug(`[prerender:setUpEvents] Initial response from ${params.response.url} with status code ${params.response.status}`);
      tab.prerender.statusCode = params.response.status;
      tab.prerender.headers = params.response.headers;

      //if we get a 304 from the server, turn it into a 200 on our end
      if (tab.prerender.statusCode == 304) tab.prerender.statusCode = 200;
    }

    if (params.type === "EventSource") {
      tab.prerender.numRequestsInFlight--;
      tab.prerender.lastRequestReceivedAt = new Date().getTime();
      if (tab.prerender.logRequests || chrome.options.logRequests) debug('[prerender:setUpEvents] -', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
      delete tab.prerender.requests[params.requestId];
    }

    if (params.response && params.response.status >= 500 && params.response.status < 600) { // 5XX
      tab.prerender.dirtyRender = true;
    }
  });

  Network.resourceChangedPriority(({ requestId, newPriority }) => {
    let entry = tab.prerender.pageLoadInfo.entries[requestId];
    if (!entry) { return; }
    entry.newPriority = newPriority;
  });

  Network.loadingFinished(({ requestId, timestamp, encodedDataLength }) => {
    const request = tab.prerender.requests[requestId];
    if (request) {
      if (tab.prerender.initialRequestId === requestId) {
        debug(`[prerender:setUpEvents] Initial request finished ${request}`);
      }

      tab.prerender.numRequestsInFlight--;
      tab.prerender.lastRequestReceivedAt = new Date().getTime();

      if (tab.prerender.logRequests || chrome.options.logRequests) debug('[prerender:setUpEvents] -', tab.prerender.numRequestsInFlight, tab.prerender.requests[requestId]);
      delete tab.prerender.requests[requestId];

      let entry = tab.prerender.pageLoadInfo.entries[requestId];
      if (!entry) { return; }
      entry.encodedResponseLength = encodedDataLength;
      entry.responseFinishedS = timestamp;
    }
  });

  //when a redirect happens and we call Page.stopLoading,
  //all outstanding requests will fire this event
  Network.loadingFailed((params) => {
    if (tab.prerender.requests[params.requestId]) {
      tab.prerender.numRequestsInFlight--;
      if (tab.prerender.logRequests || chrome.options.logRequests) debug('[prerender:setUpEvents] -', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
      delete tab.prerender.requests[params.requestId];

      let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
      if (entry) {
        entry.responseFailedS = params.timestamp;
      }
    }
  });

  // <del>Console is deprecated, kept for backwards compatibility</del>
  // It's still in use and can't get console-log from Log.entryAdded event
  Console.messageAdded(params => {
    if (tab.prerender.captureConsoleLog || chrome.options.captureConsoleLog) {
      tab.prerender.pageLoadInfo.logEntries.push({
        ...params.message,
        // to keep consistent with Log.LogEntry
        lineNumber: params.message.line,
        timestamp: new Date().getTime()
      });
    }

    if (tab.prerender.logRequests || chrome.options.logRequests) {
      debug('[prerender:setUpEvents] level:', params.message);
    }
  });

  Log.entryAdded((params) => {
    tab.prerender.pageLoadInfo.logEntries.push(params.entry);
    if (tab.prerender.logRequests || chrome.options.logRequests) debug('[prerender:setUpEvents]', params.entry);
  });

  return tab;
};

chrome.loadUrlThenWaitForPageLoadEvent = (tab, url, onNavigated) => new Promise((resolve, reject) => {
  tab.prerender.url = url;
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
        tab.prerender.errors.push(ChromeConnectionClosed);
        tab.prerender.statusCode = 504;
        reject(error);
      });
    };

    setTimeout(() => {
      if (!finished) {
        finished = true;
        debug('[prerender:loadUrlThenWaitForPageLoadEvent] page timed out', tab.prerender.url);
        const timeoutStatusCode = tab.prerender.timeoutStatusCode || chrome.options.timeoutStatusCode;
        if (timeoutStatusCode) { tab.prerender.statusCode = timeoutStatusCode; }
        tab.prerender.timedout = true;
        resolve();
      }
    }, varNumber(tab.prerender.pageLoadTimeout) || chrome.options.pageLoadTimeout);

    Page.addScriptToEvaluateOnNewDocument({ source: 'prerender = {}' });
    const width = parseInt(tab.prerender.width, 10) || 1440;
    const height = parseInt(tab.prerender.height, 10) || 718;

    Emulation.setDeviceMetricsOverride({
      height, screenHeight: height,
      width, screenWidth: width,
      deviceScaleFactor: 0,
      mobile: false
    });

    Page.navigate({ url }).then(result => {
      tab.prerender.navigateError = result.errorText;
      if (tab.prerender.navigateError && tab.prerender.navigateError !== 'net::ERR_ABORTED') {
        debug(`[prerender:loadUrlThenWaitForPageLoadEvent] Navigation error: ${tab.prerender.navigateError}, url=${url}`);
        Page.stopLoading();
      }

      if (typeof onNavigated === 'function') { return Promise.resolve(onNavigated()); }
    }).then(() => setTimeout(checkIfDone, pageDoneCheckInterval)).catch(error => {
      debug('[prerender:loadUrlThenWaitForPageLoadEvent] invalid URL sent to Chrome:', tab.prerender.url, error);
      tab.prerender.statusCode = 504;
      finished = true;
      reject(error);
    });
  }).catch(error => {
    debug('[prerender:loadUrlThenWaitForPageLoadEvent] unable to load URL', error);
    tab.prerender.statusCode = 504;
    tab.prerender.errors.push(UnableToLoadURL);
    finished = true;
    reject(error);
  });
});

chrome.checkIfPageIsDoneLoading = tab => new Promise((resolve, reject) => {
  if (tab.prerender.receivedRedirect) { return resolve(true); }
  if (tab.prerender.navigateError) { return resolve(true); }
  if (!tab.prerender.domContentEventFired) { return resolve(false); }

  tab.Runtime.evaluate({ expression: 'window.prerenderRead' }).then(result => {
    const prerenderReadyDelay = tab.prerender.prerenderReadyDelay || 1000;
    const prerenderReady = result && result.result && result.result.value;
    const shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
    const waitAfterLastRequest = tab.prerender.waitAfterLastRequest || chrome.options.waitAfterLastRequest;
    const doneLoading = tab.prerender.numRequestsInFlight <= 0 && tab.prerender.lastRequestReceivedAt < ((new Date()).getTime() - waitAfterLastRequest);

    if (prerenderReady && shouldWaitForPrerenderReady && !tab.prerender.firstPrerenderReadyTime) {
      tab.prerender.firstPrerenderReadyTime = new Date().getTime();
    }
    const timeSpentAfterFirstPrerenderReady = (tab.prerender.firstPrerenderReadyTime && (new Date().getTime() - tab.prerender.firstPrerenderReadyTime)) || 0;

    resolve(
      (!shouldWaitForPrerenderReady && doneLoading) ||
      (shouldWaitForPrerenderReady && prerenderReady && (doneLoading || timeSpentAfterFirstPrerenderReady > prerenderReadyDelay))
    );
  }).catch(error => {
    debug('[prerender:checkIfPageIsDoneLoading] unable to evaluate javascript on the page', error);
    tab.prerender.statusCode = 504;
    tab.prerender.errors.push(UnableToEvaluateJavascript);
    reject(error);
  });
});

const getHtml = prepareScript => `${prepareScript};window.document.firstElementChild.outerHTML;`

chrome.parseHtmlFromPage = tab => new Promise((resolve, reject) => {

  const parseTimeout = setTimeout(() => {
    debug('[prerender:parseHtmlFromPage] parse html timed out', tab.prerender.url);
    tab.prerender.statusCode = 504;
    tab.prerender.errors.push(ParseHTMLTimedOut);
    reject();
  }, 5000);

  tab.Runtime.evaluate({ expression: getHtml(chrome.options.cleanupHtmlScript) }).then(({ result }) => {
    debug('[prerender:parseHtmlFromPage] TEST');

    tab.prerender.content = result.value;
    if (tab.prerender.content === undefined) {
      tab.prerender.statusCode = 504;
    }
    return tab.Runtime.evaluate({ expression: 'document.doctype && JSON.stringify({name: document.doctype.name, systemId: document.doctype.systemId, publicId: document.doctype.publicId})' });
  }).then((response) => {

    let doctype = '';
    if (response && response.result && response.result.value) {
      let obj = { name: 'html' };
      try {
        obj = JSON.parse(response.result.value);
      } catch (e) { }

      doctype = "<!DOCTYPE "
        + obj.name
        + (obj.publicId ? ' PUBLIC "' + obj.publicId + '"' : '')
        + (!obj.publicId && obj.systemId ? ' SYSTEM' : '')
        + (obj.systemId ? ' "' + obj.systemId + '"' : '')
        + '>'
    }

    tab.prerender.content = doctype + tab.prerender.content;
    clearTimeout(parseTimeout);
    resolve();
  }).catch(error => {
    debug('[prerender:parseHtmlFromPage] unable to parse HTML', error);
    tab.prerender.statusCode = 504;
    tab.prerender.errors.push(UnableToParseHTML);
    clearTimeout(parseTimeout);
    reject(error);
  });
});
