
import { logError } from './src/index.js';

// TODO handle better
process.on('unhandledRejection', error => logError('[process:unhandledRejection]', error && {
  message: error.message,
  stack: error.stack,
  code: error.code,
}));
process.on('uncaughtException', error => logError('[process:uncaughtException]', error && {
  message: error.message,
  stack: error.stack,
  code: error.code,
}) || process.exit(1));
