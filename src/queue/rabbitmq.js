
// outsource dependencies
import amqp from 'amqplib';
import { Buffer } from 'node:buffer';

// local dependencies
import { logError, debug, log, delay } from '../config.js';

// NOTE required interface for "queue"
export default { start, isReady, sendToQueue };

// configure
let client;
let CONNECTED;
export function isReady () { return CONNECTED; }
export async function sendToQueue (messages) {
  const channel = await client.createChannel();
  await channel.assertQueue(client.rabbitmqQueue);
  debug(`[rabbitmq:sendToQueue] ${client.rabbitmqQueue}`, messages);
  for (const msg of messages) {
    channel.sendToQueue(client.rabbitmqQueue, Buffer.from(msg));
  }
}

export async function start (config) {
  log('[rabbitmq:connecting]', config);
  await connect(config.rabbitmqUrl);
  client.rabbitmqQueue = config.rabbitmqQueue;
  client.on('close', () => debug('[rabbitmq:stopped]', CONNECTED = false, start(config)));
  client.on('error', error => logError('RABBITMQ', { message: error.message, stack: error.stack }));
  const channel = await client.createConfirmChannel();
  await channel.assertQueue(client.rabbitmqQueue);
  channel.consume(client.rabbitmqQueue, message(channel), { durable: false });
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
    await delay(5e3);
    debug(`[rabbitmq:message] TODO handle`, message.content.toString());

    channel.ack(message);
  } catch (error) {
    channel.reject(message, true);
    logError('[rabbitmq:message]', { message: error.message, stack: error.stack });
  }
}
