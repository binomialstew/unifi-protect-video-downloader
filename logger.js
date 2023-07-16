if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}

const { createLogger, format, transports } = require('winston');
const formatDateTime = require('./datetime');

const logFormat = format.printf((info) => `${info.timestamp} ${info.level} [${info.namespace}]: ${info.message}`);

const logger = createLogger({
  format: format.combine(
    format.timestamp({
      format: formatDateTime,
    }),
    format.prettyPrint(),
  ),
  level: process.env.LOG_LEVEL,
  transports: [new transports.Console({
    format: format.combine(
      format.colorize(),
      logFormat,
    ),
  })],
});

module.exports = logger;
