const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');
const promisify = require('util').promisify;
const sleep = promisify(setTimeout);

const request = axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });

module.exports = class Api {
    constructor({host, username, password, downloadPath}) {
        this.host = host;
        this.username = username;
        this.password = password;
        this.downloadPath = downloadPath;
        this.token = null;
        this.retries = 0;
    }

    async processDownload({ cameraName, start, end, delay }) {
        const token = this.token || await this.authenticate();
        await sleep(delay); // Allow unifi time to save video before initiating download
        try {
            const {
                id,
                mac,
                name,
                recordingSettings: {
                    prePaddingSecs,
                    postPaddingSecs
                }
            } = await this.getCameraFromName({token, cameraName});
            while (start < end) {
                // break up videos longer than 10 minutes
                const calculatedEnd = Math.min(end + postPaddingSecs * 1000, start + (10 * 60 * 1000));
                const calculatedStart = start - prePaddingSecs * 1000;
                this.downloadVideo({token, camera: { id, name }, start: calculatedStart, end: calculatedEnd});

                start += 1 + (10 * 60 * 1000);
            }
        } catch (e) {
            console.log('[api] unable to process download', e);
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

    /**
     *
     */
    async getCameraFromName({token, cameraName}) {

        const headers = {
            'Content-Type': 'application/json',
            'Cookie': token
        };

        const requestConfig = { headers, withCredentials: true };
        try {
            const response = await request.get(`${this.host}/proxy/protect/api/cameras`, requestConfig);
            this.retries = 0;

            const camera = response.data.find(cam => cam.name.replace(/ /g, "_").toLowerCase() === cameraName);

            if (!camera) {
                throw new Error('Unable to find camera with name: ' + cameraName, response);
            }
            return camera
        } catch (e) {
            if (e.response.status === 401 && this.retries < 5) {
                console.info(`[api] not authorized - reauthenticate attempt # ${this.retries}`);
                this.retries = this.retries + 1;
                await this.authenticate();
                console.info('[api] now authenticated - reattempting get camera name');
                await this.getCameraFromName({ token, cameraName });
            } else {
                this.retries = 0;
                console.error('[api] unable to get camera name', e);
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
        console.info(`[api] writing to file path: ${filePath}`);

        try {
            await fs.promises.access(filePath);
        } catch (e) {
            // directory doesn't exist, create it
            await fs.promises.mkdir(filePath, { recursive: true });
        }

        const writer = fs.createWriteStream(`${filePath}/${year}-${month}-${day}_${hour}.${minute}_${start}.mp4`);

        const requestConfig = { headers, responseType: 'stream' };

        let response;
        try {
            const url = `${this.host}/proxy/protect/api/video/export?start=${start}&end=${end}&camera=${camera.id}`
            console.info(`[api] video download url: ${url}`);
            response = await request.get(url, requestConfig);
        } catch (e) {
            console.error('[api] unable to download video', e);
            return;
        }

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }
}
