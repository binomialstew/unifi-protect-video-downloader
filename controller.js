if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}

require("log-timestamp");

const mqtt = require('mqtt');
const Api = require('./api');
const moment = process.env.NODE_ENV === 'development' && require('moment');

const readableTime = timestamp => {
  return moment(timestamp).format('D MMM YYYY h:mm:ss A');
}

const cameraStartTimeByMac = {};
const cameraDownloadQueue = {};
const motionRecordingGracePeriod = process.env.MOTION_GRACE_PERIOD || 10000;

const client = mqtt.connect(process.env.MQTT_HOST, {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  will: {
    topic: 'unifi/protect-downloader/availability',
    payload: 'offline',
    qos: 1,
    retain: true
  }
});

const cameraNames = (process.env.CAMERAS &&
  process.env.CAMERAS.split(',').map(camera => camera.trim().toLowerCase().replace(/\s/g, '_'))) || [];

const api = new Api({
  host: process.env.UNIFI_HOST,
  username: process.env.UNIFI_USER,
  password: process.env.UNIFI_PASS,
  downloadPath: process.env.DOWNLOAD_PATH
});

client.on('error', (error) => {
  console.error('[controller] ' + error);
});

client.on('connect', () => {
  console.info('[controller] Connected to home automation mqtt broker');

  client.publish('unifi/protect-downloader/availability', 'online', { qos: 1, retain: true });

  if (cameraNames.length > 0) {
    console.info(`Subcribing to motion events for cameras: ${cameraNames.join(', ')}`);
    cameraNames.map(cameraName => client.subscribe(`unifi/camera/motion/${cameraName}`));
  } else {
    console.info('Subcribing to motion events for all cameras');
    client.subscribe('unifi/camera/motion/#');
  }
});

client.on('message', (topic, message) => {

  if (topic.startsWith('unifi/camera/motion/')) {
    const splitMessage = topic.split('unifi/camera/motion/')[1].split('/');
    const cameraName = splitMessage[0];
    const isMotionDetected = message.toString();
    if (isMotionDetected === '0' || isMotionDetected === '1' ) {
      const timestamp = Date.now();
      return processMotionEvent({ isMotionDetected, cameraName, timestamp });
    }
  }
  console.warn('[controller] No handler for topic: %s', topic);
});

const processMotionEvent = async ({ isMotionDetected, cameraName, timestamp }) => {
  if (process.env.VERBOSE == true && process.env.NODE_ENV === 'development') {
    console.info(`[controller] Processing motion event with status: ${isMotionDetected}`);
  }
  if (isMotionDetected === '1') {
    console.info('[controller] Processing motion start event');
    if (cameraDownloadQueue[cameraName]) {
      console.info('[controller] Found previous motion event; resetting timer');
      clearTimeout(cameraDownloadQueue[cameraName]);
      delete cameraDownloadQueue[cameraName];
    } else if (!cameraStartTimeByMac[cameraName]) {
      cameraStartTimeByMac[cameraName] = timestamp;
      if (process.env.NODE_ENV === 'development') {
        console.info(`[controller] Set start time: ${readableTime(timestamp)}`);
      }
    }

  } else if (cameraStartTimeByMac[cameraName] && isMotionDetected === '0') {
    console.info('[controller] Processing motion end event');
    const startTimestamp = cameraStartTimeByMac[cameraName];
    if (!startTimestamp) {
      return;
    }
    if (!cameraDownloadQueue[cameraName]) {
      // timeout to see if new movement is started
      cameraDownloadQueue[cameraName] = setTimeout(() => {
        console.info('[controller] Motion end event finished; processing video download');
        if (process.env.NODE_ENV === 'development') {
          console.info(`[controller] Do download for start time: ${readableTime(startTimestamp)}`);
        }
        delete cameraStartTimeByMac[cameraName];
        delete cameraDownloadQueue[cameraName];
        api.processDownload({ cameraName, start: startTimestamp, end: timestamp });
      }, motionRecordingGracePeriod);
    }

  }
}