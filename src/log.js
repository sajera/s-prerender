
export const log = (text, info) => logDate(text, info);
export const logError = (text, error) => logDate(`\x1B[0m\x1B[31m(ERROR:${text})\x1B[39m\x1B[0m`, error);
export const debug = (text, info) => process.env.DEBUG && logDate(`\x1B[0m\x1B[37m${text}\x1B[39m\x1B[0m`, info);
const logDate = (text, obj) => console.log(
  `\x1B[0m\x1B[37m[${new Date().toLocaleDateString()}:${new Date().toLocaleTimeString()}]\x1B[39m\x1B[0m`,
  text,
  obj ? JSON.stringify(obj) : '',
);
export default { log, debug, logError };
