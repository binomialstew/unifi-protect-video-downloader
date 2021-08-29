FROM node:14-alpine

VOLUME /downloads

WORKDIR /app

COPY . .

RUN npm install --production

CMD ["npm", "start"]