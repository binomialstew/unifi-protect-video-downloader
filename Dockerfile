FROM node:14

VOLUME /downloads

WORKDIR /app

COPY . .

RUN apt update && apt install tzdata -y

ENV TZ=America/New_York

RUN npm install --production

CMD ["npm", "start"]
