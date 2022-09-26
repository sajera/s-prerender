
// outsource dependencies
import amqp from 'amqplib';
import http from 'node:http';
import { Buffer } from 'node:buffer';

// local dependencies
import { logError, debug, log, config } from '../config.js';

// NOTE required interface for "queue"
export default { start, isReady, sendToQueue };

// configure
let client;
let CONNECTED;
export function isReady () { return CONNECTED; }
export async function sendToQueue (urls) {
  const channel = await client.createChannel();
  await channel.assertQueue(client.queue, client.queueOptions);
  debug(`[rabbitmq:sendToQueue] ${client.queue}`, urls);
  for (const url of urls) {
    channel.sendToQueue(client.queue, formatMessage({ url }), client.sendOptions);
  }
}

export async function start (config) {
  log('[rabbitmq:connecting]', config);
  await connect(config.rabbitmqUrl);
  // NOTE configuration
  client.queue = config.rabbitmqQueue;
  client.queueOptions = { durable: true };
  client.sendOptions = { persistent: true };
  client.consumeOptions = { noAck: false };
  client.on('close', () => debug('[rabbitmq:stopped]', CONNECTED = false, start(config)));
  client.on('error', error => logError('RABBITMQ', { message: error.message, stack: error.stack }));
  const channel = await client.createConfirmChannel();
  channel.prefetch(config.rabbitmqChannels);
  await channel.assertQueue(client.queue, client.queueOptions);
  channel.consume(client.queue, message(channel),  client.consumeOptions);
  log('[rabbitmq:started]', config.rabbitmqUrl);
}

const message = channel => async message => {
  const { url, attempt = 0 } = parseMessage(message.content.toString());
  try {
    log(`[rabbitmq:message] ${attempt}`, message.content.toString());
    await refresh(url);
  } catch (error) {
    logError('[rabbitmq:message]', error.message);
    // NOTE try again later
    if (url && attempt > 0) {
      try {
        // NOTE create new message in a queue
        channel.sendToQueue(client.queue, formatMessage({ url, attempt: attempt - 1 }), client.sendOptions);
      } catch (error) { /* NOTE unbelievable, but just in case */ }
    }
  }
  // NOTE at any case message was handled
  channel.ack(message);
}
/******************************************************
 *               HELPERS
 *****************************************************/
const refresh = url => new Promise((resolve, reject) => {
  http.get(new URL(`http://${config.API.host}:${config.API.port}/refresh?ignoreResults=true&url=${url}`), response => {
    // NOTE consume response data to free up memory
    response.resume();
    // NOTE no addition data or explanations need due to debug from API logs.
    return response.statusCode === 200 ? resolve('OK')
      : reject(new Error(`Request Failed. [${response.statusCode}] Failed to refresh "${url}"`));
  });
});

const formatMessage = ({ url, attempt = 3 }) => Buffer.from(JSON.stringify({ attempt, url }));
const parseMessage = message => {
  try {
    return JSON.parse(message.toString()) || {};
  } catch (error) {
    return {};
  }
}

const connect = url => new Promise(resolve => {
  const retry = () => amqp.connect(url)
    .then(connection => {
      debug('[rabbitmq:connected]', CONNECTED = true);
      resolve(client = connection);
    })
    .catch(error => logError('RABBITMQ', { message: error.message, stack: error.stack }, setTimeout(retry, 4e3)));
  retry();
});
