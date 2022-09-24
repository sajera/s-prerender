
// local dependencies
import rabbitmq from './rabbitmq.js';

// NOTE module interface
const noop = () => null;
const queue = { start, isReady: noop };

// TODO switching based on environment variables
// NOTE for now implemented only Redis ¯\_(ツ)_/¯
function start (config) {
  if (config.rabbitmq) {
    Object.assign(queue, rabbitmq);
    return rabbitmq.start(config);
  }
  throw new Error('No useful QUEUE configuration found');
}

export default queue;
