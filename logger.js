if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}
const { createLogger, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOGLEVEL
  transports: [new transports.Console()],
});

export default logger;
