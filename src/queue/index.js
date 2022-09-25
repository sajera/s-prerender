
// local dependencies
import rabbitmq from './rabbitmq.js';

// configure
const noop = () => null;
// NOTE module interface
const queue = { start, isReady: noop, sendToQueue: noop };

// NOTE switching based on environment variables
function start (config) {
  if (config.rabbitmq) {
    Object.assign(queue, rabbitmq);
    return rabbitmq.start(config);
  }
  // NOTE for now implemented only RabbitMQ ¯\_(ツ)_/¯
  // throw new Error('No useful QUEUE configuration found');
}

export default queue;
