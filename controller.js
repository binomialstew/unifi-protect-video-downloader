if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}

require("log-timestamp");

const mqtt = require('mqtt');
const Api = require('./api');

console.log('[controller] Verbose mode: %s', process.env.VERBOSE);

const readableTime = timestamp => {
  const newDate = new Date();
  newDate.setTime(timestamp);
  const dateString = newDate.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'long',
    timeZone: process.env.TZ || 'America/New_York'
  });
  return dateString;
}

const cameraStartTimeByMac = {};
const cameraDownloadQueue = {};
const motionRecordingGracePeriod = process.env.MOTION_GRACE_PERIOD || 10000;

const cameraMacs = (process.env.CAMERAS &&
  process.env.CAMERAS.split(',').map(camera => camera.trim().toLowerCase().replace(/\s/g, '_'))) || [];

try {
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
  client.on('error', (error) => {
    console.error('[controller] %s', error);
  });

  client.on('connect', () => {
    console.info('[controller] Connected to home automation mqtt broker');
    client.publish('unifi/protect-downloader/availability', 'online', { qos: 1, retain: true });

    if (cameraMacs.length > 0) {
      console.info('[controller] Subscribing to motion events for cameras: %s', cameraMacs.join(', '));
      cameraMacs.map(cameraMac => client.subscribe(`unifi/camera/${cameraMac}`));
    } else {
      console.info('[controller] Subscribing to motion events for all cameras');
      client.subscribe('unifi/camera/#');
    }
  });

  client.on('message', (topic, message) => {
    if (process.env.VERBOSE) {
      console.info('[controller] Received message for topic: %s: %s', topic, message);
    }
    if (topic.startsWith('unifi/camera/')) {
      const splitMessage = topic.split('unifi/camera/')[1].split('/');
      const cameraMac = splitMessage[0];
      const isMotionDetected = message.toString();
      const timestamp = Date.now();
      return processMotionEvent({ isMotionDetected, cameraMac, timestamp });
    }
    console.warn('[controller] No handler for topic: %s: %s', topic, message);
  });
} catch(error) {
  console.error('[controller] %s', error);
}

let downloadApi;

try {
  downloadApi = new Api({
    host: process.env.UNIFI_HOST,
    username: process.env.UNIFI_USER,
    password: process.env.UNIFI_PASS,
    downloadPath: process.env.DOWNLOAD_PATH
  });
} catch (error) {
  console.error('[api] %s', error);
}

const processMotionEvent = async ({ isMotionDetected, cameraMac, timestamp }) => {
  if (process.env.VERBOSE) {
    console.info('[controller] Processing motion event with status: %s', isMotionDetected);
  }
  if (isMotionDetected === 'true') {
    console.info('[controller] Processing motion start event');
    if (cameraDownloadQueue[cameraMac]) {
      console.info('[controller] Found previous motion event; resetting timer');
      clearTimeout(cameraDownloadQueue[cameraMac]);
      delete cameraDownloadQueue[cameraMac];
    } else if (!cameraStartTimeByMac[cameraMac]) {
      cameraStartTimeByMac[cameraMac] = timestamp;
      if (process.env.VERBOSE) {
        console.info('[controller] Set start time: %s', readableTime(timestamp));
      }
    }

  } else if (cameraStartTimeByMac[cameraMac] && isMotionDetected === 'false') {
    console.info('[controller] Processing motion end event');
    const startTimestamp = cameraStartTimeByMac[cameraMac];
    if (!startTimestamp) {
      return;
    }
    if (!cameraDownloadQueue[cameraMac]) {
      // timeout to see if new movement is started
      cameraDownloadQueue[cameraMac] = setTimeout(() => {
        const delay = process.env.DOWNLOAD_DELAY || 5000;
        console.info('[controller] Motion end event finished; processing video download after %s seconds', delay/1000);
        if (process.env.VERBOSE) {
          console.info('[controller] Do download for start time: %s', readableTime(startTimestamp));
        }
        delete cameraStartTimeByMac[cameraMac];
        delete cameraDownloadQueue[cameraMac];
        downloadApi.processDownload({ mac: cameraMac, start: startTimestamp, end: timestamp, delay });
      }, motionRecordingGracePeriod);
    }
  }
}
