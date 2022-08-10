
import './src/index.js';
import { logError } from './src/log.js';

// TODO handle better
process.on('unhandledRejection', error => {
  logError('[process:unhandledRejection]', {
    message: error.message,
    stack: error.stack,
    code: error.code,
  });
});
process.on('uncaughtException', error => logError('[process:uncaughtException]', {
  message: error.message,
  stack: error.stack,
  code: error.code,
}) || process.exit(1));
