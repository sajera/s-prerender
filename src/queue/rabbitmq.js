
// outsource dependencies
import amqp from 'amqplib';

// local dependencies
import { logError, debug, log } from '../config.js';

// NOTE required interface for "queue"
export default { start, set, isReady };

// configure
let client;
let CONNECTED;
export function set (key, value) { return ; }
export function isReady () { return CONNECTED; }

export async function start (config) {
  log('[rabbitmq:connecting]', config);
  await connect(config.rabbitmqUrl);
  client.on('close', () => debug('[rabbitmq:stopped]', CONNECTED = false, start(config)));
  client.on('error', error => logError('RABBITMQ', { message: error.message, stack: error.stack }));
  // TODO channel ?
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
