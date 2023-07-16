if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}
const mqtt = require('mqtt');
const winston = require('./logger');
const Api = require('./api');
const formatDateTime = require('./datetime');

const logger = winston.child({ namespace: 'controller' });

logger.info(`Log level is: ${process.env.LOG_LEVEL}`);

const cameraStartTimeByMac = {};
const cameraDownloadQueue = {};
const motionRecordingGracePeriod = process.env.MOTION_GRACE_PERIOD || 10000;

let downloadApi;
try {
  downloadApi = new Api({
    host: process.env.UNIFI_HOST,
    username: process.env.UNIFI_USER,
    password: process.env.UNIFI_PASS,
    downloadPath: process.env.DOWNLOAD_PATH,
  });
} catch (error) {
  logger.error(error);
}

const processMotionEvent = async ({ isMotionDetected, cameraMac, timestamp }) => {
  logger.verbose(`Processing motion event with status: ${isMotionDetected}`);
  if (isMotionDetected === 'true') {
    logger.info('Processing motion start event');
    if (cameraDownloadQueue[cameraMac]) {
      logger.info('Found previous motion event; resetting timer');
      clearTimeout(cameraDownloadQueue[cameraMac]);
      delete cameraDownloadQueue[cameraMac];
    } else if (!cameraStartTimeByMac[cameraMac]) {
      cameraStartTimeByMac[cameraMac] = timestamp;
      logger.verbose(`Set start time: ${formatDateTime(timestamp)}`);
    }
  } else if (cameraStartTimeByMac[cameraMac] && isMotionDetected === 'false') {
    logger.info('Processing motion end event');
    const startTimestamp = cameraStartTimeByMac[cameraMac];
    if (!startTimestamp) {
      return;
    }
    if (!cameraDownloadQueue[cameraMac]) {
      // timeout to see if new movement is started
      cameraDownloadQueue[cameraMac] = setTimeout(() => {
        const delay = process.env.DOWNLOAD_DELAY || 5000;
        logger.info(`Motion end event finished; processing video download after ${delay / 1000} seconds`);
        logger.verbose(`Do download for start time: ${formatDateTime(startTimestamp)}`);
        delete cameraStartTimeByMac[cameraMac];
        delete cameraDownloadQueue[cameraMac];
        downloadApi.processDownload({
          mac: cameraMac,
          start: startTimestamp,
          end: timestamp,
          delay,
        });
      }, motionRecordingGracePeriod);
    }
  }
};

const cameraMacs = (
  process.env.CAMERAS && process.env.CAMERAS.split(',').map((camera) => camera.trim().toLowerCase().replace(/\s/g, '_'))
) || [];

try {
  const client = mqtt.connect(process.env.MQTT_HOST, {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    will: {
      topic: 'unifi/protect-downloader/availability',
      payload: 'offline',
      qos: 1,
      retain: true,
    },
  });

  client.on('error', (error) => {
    logger.error(`Error loading mqtt client: ${error}`);
  });

  client.on('connect', () => {
    logger.info('Connected to mqtt broker');
    client.publish('unifi/protect-downloader/availability', 'online', {
      qos: 1,
      retain: true,
    });

    if (cameraMacs.length > 0) {
      logger.info(`Subscribing to motion events for cameras: ${cameraMacs.join(', ')}`);
      cameraMacs.map((cameraMac) => client.subscribe(`unifi/camera/${cameraMac}/motion`));
    } else {
      logger.info('Subscribing to motion events for all cameras');
      client.subscribe('unifi/camera/+/motion');
    }
  });

  client.on('message', (topic, message) => {
    logger.verbose(`Received message for topic: ${topic}: ${message}`);
    if (topic.startsWith('unifi/camera/')) {
      const splitMessage = topic.split('unifi/camera/')[1].split('/');
      const cameraMac = splitMessage[0];
      const isMotionDetected = message.toString();
      const timestamp = Date.now();
      processMotionEvent({ isMotionDetected, cameraMac, timestamp });
    } else {
      logger.warn(`No handler for topic: ${topic}: ${message}`);
    }
  });
} catch (error) {
  logger.error(error);
}
