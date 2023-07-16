const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');
const promisify = require('util').promisify;
const sleep = promisify(setTimeout);
const winston = require('./logger');

const logger = winston.child({ namespace: 'download api' });

const request = axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });

module.exports = class Api {
    constructor({host, username, password, downloadPath}) {
        logger.debug('Loaded download API');
        this.host = host;
        this.username = username;
        this.password = password;
        this.downloadPath = downloadPath;
        this.token = null;
        this.retries = 0;
    }

    async processDownload({ mac, start, end, delay }) {
        const token = this.token || await this.authenticate();

        await sleep(delay); // Allow unifi time to save video before initiating download

        try {
            const camera = await this.getCameraFromMac({ token, mac });
            logger.debug(`process download for camera: ${JSON.stringify(camera, null, 4)}`);
            const {
                id,
                name,
                recordingSettings: {
                    prePaddingSecs,
                    postPaddingSecs
                }
            } = camera;

            while (start < end) {
                // break up videos longer than 10 minutes
                const calculatedEnd = Math.min(end + postPaddingSecs * 1000, start + (10 * 60 * 1000));
                const calculatedStart = start - prePaddingSecs * 1000;
                this.downloadVideo({token, camera: { id, name }, start: calculatedStart, end: calculatedEnd});

                start += 1 + (10 * 60 * 1000);
            }
        } catch (e) {
            logger.error('unable to process download', e);
        }
    }

    async authenticate() {
        const response = await request.post(`${this.host}/api/auth/login`, {
            'username': this.username,
            'password': this.password
        });

        if (!response || !response.headers || !response.headers['set-cookie']) {
            throw new Error('Invalid token api response; received message', response);
        }
        this.token = response.headers['set-cookie'];
        return response.headers['set-cookie'];
    }

    async getCameraFromMac({ token, mac }) {
        const headers = {
            'Content-Type': 'application/json',
            'Cookie': token
        };

        const requestConfig = { headers, withCredentials: true };
        try {
            const response = await request.get(`${this.host}/proxy/protect/api/cameras`, requestConfig);
            this.retries = 0;

            const camera = response.data.find(cam => cam.mac === mac);

            if (!camera) {
                throw new Error('Unable to find camera with mac: ' + mac, response);
            }
            return camera
        } catch (e) {
            if (e.response && e.response.status === 401 && this.retries < 5) {
                logger.warn(`not authorized - reauthenticate attempt # ${this.retries}`);
                this.retries = this.retries + 1;
                const newToken = await this.authenticate();
                logger.warn('now authenticated - reattempting get camera name');
                logger.debug(`Using token: ${newToken}`);
                logger.debug(`Using mac: ${mac}`);
                return await this.getCameraFromMac({ token: newToken, mac });
            } else {
                this.retries = 0;
                logger.error('unable to get camera from mac', e);
            }
        }
    }

    async downloadVideo({token, camera, start, end}) {
        const headers = {
            'Content-Type': 'application/json',
            'Cookie': token
        };
        const date = new Date(start);
        const year = '' + date.getFullYear();
        const month = ('' + (date.getMonth() + 1)).padStart(2, '0');
        const day = ('' + date.getDate()).padStart(2, '0');
        const hour = ('' + date.getHours()).padStart(2, '0');
        const minute = ('' + date.getMinutes()).padStart(2, '0');

        const filePath = path.resolve(this.downloadPath, camera.name, year, month, day);
        const fileName = `${year}-${month}-${day}_${hour}.${minute}_${start}.mp4`;
        logger.info(`writing to file path: ${filePath} ${fileName}`);

        try {
            await fs.promises.access(filePath);
        } catch (e) {
            logger.debug('Directory doesn\'t exist - create it');
            const didCreateDirectory = await fs.promises.mkdir(filePath, { recursive: true });
            logger.verbose(`Successfully created directory: ${didCreateDirectory}`);
        }

        const writer = fs.createWriteStream(`${filePath}/${fileName}`);

        const requestConfig = { headers, responseType: 'stream' };

        let response;
        try {
            const url = `${this.host}/proxy/protect/api/video/export?start=${start}&end=${end}&camera=${camera.id}`
            logger.info(`Video download url: ${url}`);
            response = await request.get(url, requestConfig);
        } catch (error) {
            logger.error(`Unable to download video: ${error}`);
            return;
        }

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', function() {
                logger.info('Write success');
                resolve();
            });
            writer.on('error', function(error) {
                logger.error(error);
                reject();
            });
        });
    }
}
