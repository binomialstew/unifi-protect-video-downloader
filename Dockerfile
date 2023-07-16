FROM node:18

VOLUME /downloads

WORKDIR /app

COPY . .

ENV TZ=America/New_York

RUN apt-get update && \
apt-get install -y tzdata && \
ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
echo $TZ > /etc/timezone

RUN npm install --omit=dev

CMD ["npm", "start"]
