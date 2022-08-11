
// outsource dependencies
import fs from 'node:fs';
import os from 'node:os';
import CDP from 'chrome-remote-interface';
import { spawn } from 'node:child_process';

// local dependencies
import { debug } from '../log.js';

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

  let connect = () => {
    CDP.Version({ port: chrome.options.browserDebuggingPort }).then((info) => {

      chrome.originalUserAgent = info['User-Agent'];
      chrome.webSocketDebuggerURL = info.webSocketDebuggerUrl || 'ws://localhost:' + chrome.options.browserDebuggingPort + '/devtools/browser';
      chrome.version = info.Browser;

      clearTimeout(timeout);
      connected = true;
      debug('[prerender:ready]', info.Browser);
      resolve();

    }).catch(error => {
      debug('[prerender:connect] retrying connection to Chrome...', error);
      return setTimeout(connect, 1000);
    });
  };

  setTimeout(connect, 500);

});

chrome.getChromeLocation = function () {
  if (this.options.chromeLocation) {
    return this.options.chromeLocation;
  }

  let platform = os.platform();

  if (platform === 'darwin') {
    return '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
  }

  if (platform === 'linux') {
    return '/usr/bin/google-chrome';
  }

  if (platform === 'win32') {
    return 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
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

chrome.setUpEvents = async function (tab) {
  const {
    Page,
    Security,
    DOM,
    Network,
    Emulation,
    Log,
    Console
  } = tab;

  await Promise.all([
    DOM.enable(),
    Page.enable(),
    Security.enable(),
    Network.enable(),
    Log.enable(),
    Console.enable()
  ]);

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

  const userAgent = (
    tab.prerender.userAgent ||
    this.options.userAgent ||
    `${this.originalUserAgent} Prerender (+https://github.com/prerender/prerender)`
  );
  await Network.setUserAgentOverride({ userAgent });

  let bypassServiceWorker = !(this.options.enableServiceWorker == true || this.options.enableServiceWorker == 'true');
  if (typeof tab.prerender.enableServiceWorker !== 'undefined') {
    bypassServiceWorker = !tab.prerender.enableServiceWorker;
  }
  await Network.setBypassServiceWorker({ bypass: bypassServiceWorker });

  // set up handlers
  Page.domContentEventFired(({ timestamp }) => {
    tab.prerender.domContentEventFired = true;
    tab.prerender.pageLoadInfo.domContentEventFiredMs = timestamp * 1000;
  });

  Page.loadEventFired(({ timestamp }) => {
    tab.prerender.pageLoadInfo.loadEventFiredMs = timestamp * 1000;
  });

  //if the page opens up a javascript dialog, lets try to close it after 1s
  Page.javascriptDialogOpening(() => {
    setTimeout(() => Page.handleJavaScriptDialog({ accept: true }), 1000);
  });

  Security.certificateError(({ eventId }) => {
    Security.handleCertificateError({
      eventId,
      action: 'continue'
    }).catch(error => debug('[prerender:setUpEvents] error handling certificate error:', error));
  });

  Network.requestWillBeSent((params) => {
    tab.prerender.numRequestsInFlight++;
    tab.prerender.requests[params.requestId] = params.request.url;
    if (tab.prerender.logRequests || this.options.logRequests) debug('[prerender:setUpEvents] +', tab.prerender.numRequestsInFlight, params.request.url);

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
      redirectEntry.responseParams = {
        response: params.redirectResponse
      };
      redirectEntry.responseFinishedS = params.timestamp;
      redirectEntry.encodedResponseLength = params.redirectResponse.encodedDataLength;

      if (tab.prerender.initialRequestId === params.requestId && !tab.prerender.followRedirects && !this.options.followRedirects) {
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
    let entry = tab.prerender.pageLoadInfo.entries[requestId];
    if (!entry) {
      return;
    }
    entry.responseLength += dataLength;
  });

  Network.responseReceived((params) => {
    let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
    if (entry) {
      entry.responseParams = params;
    }

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
      if (tab.prerender.logRequests || this.options.logRequests) debug('[prerender:setUpEvents] -', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
      delete tab.prerender.requests[params.requestId];
    }

    if (params.response && params.response.status >= 500 && params.response.status < 600) { // 5XX
      tab.prerender.dirtyRender = true;
    }
  });

  Network.resourceChangedPriority(({ requestId, newPriority }) => {
    let entry = tab.prerender.pageLoadInfo.entries[requestId];
    if (!entry) {
      return;
    }
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

      if (tab.prerender.logRequests || this.options.logRequests) debug('[prerender:setUpEvents] -', tab.prerender.numRequestsInFlight, tab.prerender.requests[requestId]);
      delete tab.prerender.requests[requestId];

      let entry = tab.prerender.pageLoadInfo.entries[requestId];
      if (!entry) {
        return;
      }
      entry.encodedResponseLength = encodedDataLength;
      entry.responseFinishedS = timestamp;
    }
  });

  //when a redirect happens and we call Page.stopLoading,
  //all outstanding requests will fire this event
  Network.loadingFailed((params) => {
    if (tab.prerender.requests[params.requestId]) {
      tab.prerender.numRequestsInFlight--;
      if (tab.prerender.logRequests || this.options.logRequests) debug('[prerender:setUpEvents] -', tab.prerender.numRequestsInFlight, tab.prerender.requests[params.requestId]);
      delete tab.prerender.requests[params.requestId];

      let entry = tab.prerender.pageLoadInfo.entries[params.requestId];
      if (entry) {
        entry.responseFailedS = params.timestamp;
      }
    }
  });

  // <del>Console is deprecated, kept for backwards compatibility</del>
  // It's still in use and can't get console-log from Log.entryAdded event
  Console.messageAdded((params) => {
    if (tab.prerender.captureConsoleLog || this.options.captureConsoleLog) {
      const message = params.message;

      tab.prerender.pageLoadInfo.logEntries.push({
        ...message,
        // to keep consistent with Log.LogEntry
        lineNumber: message.line,
        timestamp: new Date().getTime()
      });
    }

    if (tab.prerender.logRequests || this.options.logRequests) {
      const message = params.message;
      debug('[prerender:setUpEvents] level:', message.level, 'text:', message.text, 'url:', message.url, 'line:', message.line);
    }
  });

  Log.entryAdded((params) => {
    tab.prerender.pageLoadInfo.logEntries.push(params.entry);
    if (tab.prerender.logRequests || this.options.logRequests) debug('[prerender:setUpEvents]', params.entry);
  });

  return tab;
};

chrome.loadUrlThenWaitForPageLoadEvent = function (tab, url, onNavigated) {
  return new Promise((resolve, reject) => {
    tab.prerender.url = url;

    var finished = false;
    const {
      Page,
      Emulation
    } = tab;


    Page.enable()
      .then(() => {

        let pageDoneCheckInterval = tab.prerender.pageDoneCheckInterval || this.options.pageDoneCheckInterval;
        let pageLoadTimeout = tab.prerender.pageLoadTimeout || this.options.pageLoadTimeout;

        var checkIfDone = () => {
          if (finished) { return; }

          if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
            tab.Runtime.evaluate({
              expression: 'window.scrollBy(0, window.innerHeight);'
            });
          }


          this.checkIfPageIsDoneLoading(tab).then((doneLoading) => {
            if (doneLoading && !finished) {
              finished = true;

              if ((tab.prerender.renderType === 'jpeg' || tab.prerender.renderType === 'png') && tab.prerender.fullpage) {
                tab.Runtime.evaluate({
                  expression: 'window.scrollTo(0, 0);'
                });
              }

              resolve();
            }

            if (!doneLoading && !finished) {
              setTimeout(checkIfDone, pageDoneCheckInterval);
            }
          }).catch((e) => {
            finished = true;
            debug('[prerender:loadUrlThenWaitForPageLoadEvent] Chrome connection closed during request');
            tab.prerender.errors.push(ChromeConnectionClosed);
            tab.prerender.statusCode = 504;
            reject();
          });
        };

        setTimeout(() => {
          if (!finished) {
            finished = true;
            debug('[prerender:loadUrlThenWaitForPageLoadEvent] page timed out', tab.prerender.url);

            const timeoutStatusCode = tab.prerender.timeoutStatusCode || this.options.timeoutStatusCode;
            if (timeoutStatusCode) {
              tab.prerender.statusCode = timeoutStatusCode;
            }
            tab.prerender.timedout = true;

            resolve();
          }
        }, pageLoadTimeout);

        if (!tab.prerender.skipCustomElementsForcePolyfill) {
          Page.addScriptToEvaluateOnNewDocument({ source: 'if (window.customElements) customElements.forcePolyfill = true' })
        }
        Page.addScriptToEvaluateOnNewDocument({ source: 'ShadyDOM = {force: true}' })
        Page.addScriptToEvaluateOnNewDocument({ source: 'ShadyCSS = {shimcssproperties: true}' })

        let width = parseInt(tab.prerender.width, 10) || 1440;
        let height = parseInt(tab.prerender.height, 10) || 718;

        Emulation.setDeviceMetricsOverride({
          width: width,
          screenWidth: width,
          height: height,
          screenHeight: height,
          deviceScaleFactor: 0,
          mobile: false
        });

        Page.navigate({
          url: tab.prerender.url
        }).then((result) => {
          tab.prerender.navigateError = result.errorText;
          if (tab.prerender.navigateError && tab.prerender.navigateError !== 'net::ERR_ABORTED') {
            debug(`[prerender:loadUrlThenWaitForPageLoadEvent] Navigation error: ${tab.prerender.navigateError}, url=${tab.prerender.url}`);
            Page.stopLoading();
          }

          if (typeof onNavigated === 'function') {
            return Promise.resolve(onNavigated());
          }
        }).then(() => {
          setTimeout(checkIfDone, pageDoneCheckInterval);
        }).catch(() => {
          debug('[prerender:loadUrlThenWaitForPageLoadEvent] invalid URL sent to Chrome:', tab.prerender.url);
          tab.prerender.statusCode = 504;
          finished = true;
          reject();
        });
      }).catch(error => {
      debug('[prerender:loadUrlThenWaitForPageLoadEvent] unable to load URL', error);
      tab.prerender.statusCode = 504;
      tab.prerender.errors.push(UnableToLoadURL);
      finished = true;
      reject(error);
    });
  });
};

chrome.checkIfPageIsDoneLoading = function (tab) {
  return new Promise((resolve, reject) => {

    if (tab.prerender.receivedRedirect) {
      return resolve(true);
    }

    if (tab.prerender.navigateError) {
      return resolve(true);
    }

    if (!tab.prerender.domContentEventFired) {
      return resolve(false);
    }

    tab.Runtime.evaluate({
      expression: 'window.prerenderReady'
    }).then((result) => {
      let prerenderReady = result && result.result && result.result.value;
      let shouldWaitForPrerenderReady = typeof prerenderReady == 'boolean';
      let waitAfterLastRequest = tab.prerender.waitAfterLastRequest || this.options.waitAfterLastRequest;

      const prerenderReadyDelay = tab.prerender.prerenderReadyDelay || 1000;

      if (prerenderReady && shouldWaitForPrerenderReady && !tab.prerender.firstPrerenderReadyTime) {
        tab.prerender.firstPrerenderReadyTime = new Date().getTime();
      }

      let doneLoading = tab.prerender.numRequestsInFlight <= 0 &&
        tab.prerender.lastRequestReceivedAt < ((new Date()).getTime() - waitAfterLastRequest)

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

};

chrome.executeJavascript = function (tab, javascript) {
  return new Promise((resolve, reject) => {
    tab.Runtime.evaluate({
      expression: javascript
    }).then((result) => {

      //give previous javascript a little time to execute
      setTimeout(() => {

        tab.Runtime.evaluate({
          expression: "(window.prerenderData && typeof window.prerenderData == 'object' && JSON.stringify(window.prerenderData)) || window.prerenderData"
        }).then((result) => {
          try {
            tab.prerender.prerenderData = JSON.parse(result && result.result && result.result.value);
          } catch (e) {
            tab.prerender.prerenderData = result.result.value;
          }
          resolve();
        }).catch(error => {
          debug('[prerender:executeJavascript] unable to evaluate javascript on the page', error);
          tab.prerender.statusCode = 504;
          tab.prerender.errors.push(UnableToEvaluateJavascript);
          reject(error);
        });

      }, 1000);
    }).catch(error => {
      debug('[prerender:executeJavascript] unable to evaluate javascript on the page', error);
      tab.prerender.statusCode = 504;
      tab.prerender.errors.push(UnableToEvaluateJavascript);
      reject(error);
    });
  });
};

const getHtmlFunction = () => document.firstElementChild.outerHTML;

const getHtmlWithShadowDomFunction = () => {
  const innerText =  document.firstElementChild.getInnerHTML({includeShadowRoots: true});
  const htmlNode = document.firstElementChild;
  const attributeNames = htmlNode.getAttributeNames();
  const attrStringList = attributeNames.map((attributeName) => (`${attributeName}="${htmlNode.getAttribute(attributeName)}"`))

  return `<!DOCTYPE html>
  <html ${attrStringList.join(' ')}>
    ${innerText}
  </html>`;
}

chrome.parseHtmlFromPage = function (tab) {
  return new Promise((resolve, reject) => {

    var parseTimeout = setTimeout(() => {
      debug('[prerender:parseHtmlFromPage] parse html timed out', tab.prerender.url);
      tab.prerender.statusCode = 504;
      tab.prerender.errors.push(ParseHTMLTimedOut);
      reject();
    }, 5000);


    const getHtmlFunctionText = tab.prerender.parseShadowDom
      ? getHtmlWithShadowDomFunction.toString()
      : getHtmlFunction.toString();


    tab.Runtime.evaluate({
      expression: `(${getHtmlFunctionText})()` // Call the function
    }).then((resp) => {

      tab.prerender.content = resp.result.value;
      if (tab.prerender.content === undefined) {
        tab.prerender.statusCode = 504;
      }
      return tab.Runtime.evaluate({
        expression: 'document.doctype && JSON.stringify({name: document.doctype.name, systemId: document.doctype.systemId, publicId: document.doctype.publicId})'
      });
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
};
