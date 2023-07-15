if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}
const path = require('path');
const { createLogger, format, transports } = require('winston');
const formatDateTime = require('./datetime');

function getModuleName(callingModule) {
    const parts = callingModule.filename.split('/');
    // Full file path available in parts, but for now, we just want the module name
    return parts[parts.length - 1].split('.')[0];
};

const logFormat = format.printf(info => `${info.timestamp} ${info.level} [${info.label}]: ${info.message}`)

const logger = (callingModule) => createLogger({
  format: format.combine(
    format.timestamp({
      format: formatDateTime
    }),
    format.label({ label: getModuleName(callingModule)}),
    format.prettyPrint()
  ),
  level: process.env.LOG_LEVEL,
  transports: [new transports.Console({
    format: format.combine(
      format.colorize(),
      logFormat
    )
  })],
});

module.exports = logger;
