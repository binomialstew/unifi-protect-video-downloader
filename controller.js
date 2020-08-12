if (process.env.NODE_ENV === 'development') {
  const dotenv = require('dotenv');
  dotenv.config();
}

require("log-timestamp");

const mqtt = require('mqtt');
const Api = require('./api');

const cameraStartTimeByMac = {};
const cameraDownloadQueue = {};

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

  client.publish('unifi/protect-downloader/availability', 'online', {qos: 1, retain: true});

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
    const parsedMessage = message.toString()
    if (parsedMessage === 'connected') {
      return;
    } else if (topic === 'unifi/camera/motion/kitchen/state') {
      const { state: status, mac: cameraMac, lastMotion: timestamp, isMotionDetected } = JSON.parse(parsedMessage);
      return processMotionEvent({isMotionDetected, cameraMac, timestamp: Date.now()})
    }
  }

  console.warn('[controller] No handler for topic: %s', topic);
});
const processMotionEvent = async ({isMotionDetected, cameraMac, timestamp}) => {
  console.info(`[controller] Processing motion event with status: ${isMotionDetected}, cameraMac: ${cameraMac}, timestamp: ${timestamp}`);

  if (isMotionDetected) {
    console.info('[controller] Processing motion start event');

    if (cameraDownloadQueue[cameraMac]) {
      console.info('[controller] Found previous motion event; resetting timer');
      clearTimeout(cameraDownloadQueue[cameraMac]);
    } else if (!cameraStartTimeByMac[cameraMac]) {
      console.log('set time')
      cameraStartTimeByMac[cameraMac] = timestamp;
    }

  } else if (!isMotionDetected) {
    console.info('[controller] Processing motion end event');

    const startTimestamp = cameraStartTimeByMac[cameraMac];

    if (!startTimestamp) {
      return;
    }

    if (cameraDownloadQueue[cameraMac]) {
      console.info('[controller] Found previous motion event; reseting timer');
      clearTimeout(cameraDownloadQueue[cameraMac]);
    }

    // wait to see if new movement is started
    cameraDownloadQueue[cameraMac] = setTimeout(() => {
      console.info('[controller] Motion end event finished; processing video download');
      delete cameraStartTimeByMac[cameraMac];
      delete cameraDownloadQueue[cameraMac];

      api.processDownload({cameraMac, start: startTimestamp - 5000, end: timestamp + 5000});

    }, 5000);

  }
}