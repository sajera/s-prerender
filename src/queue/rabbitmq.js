
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
export async function sendToQueue (messages) {
  const channel = await client.createChannel();
  await channel.assertQueue(client.queue, client.queueOptions);
  debug(`[rabbitmq:sendToQueue] ${client.queue}`, messages);
  for (const msg of messages) {
    // TODO message schema
    channel.sendToQueue(client.queue, Buffer.from(msg), client.sendOptions);
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

const connect = url => new Promise(resolve => {
  const retry = () => amqp.connect(url)
    .then(connection => {
      debug('[rabbitmq:connected]', CONNECTED = true);
      resolve(client = connection);
    })
    .catch(error => logError('RABBITMQ', { message: error.message, stack: error.stack }, setTimeout(retry, 4e3)));
  retry();
});

const message = channel => async message => {
  try {
    // TODO message schema from Estative
    // TODO limit attempts to handle message
    if (message.fields.deliveryTag < 5) {
      log('[rabbitmq:message]', message.content.toString());
      await refresh(message.content.toString());
    }
    channel.ack(message);
  } catch (error) {
    channel.reject(message, true);
    logError('[rabbitmq:message]', { message: error.message, stack: error.stack });
  }
}

const refresh = url => new Promise((resolve, reject) => {
  http.get(new URL(`http://${config.API.host}:${config.API.port}/refresh?ignoreResults=true&url=${url}`), response => {
    // NOTE consume response data to free up memory
    response.resume();
    // NOTE no addition data or explanations need due to debug from API logs.
    return response.statusCode === 200 ? resolve('OK')
      : reject(new Error(`Request Failed. [${response.statusCode}] Failed to refresh "${url}"`));
  });
});
