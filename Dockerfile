FROM node:19

VOLUME /downloads

WORKDIR /app

COPY . .

ENV TZ=America/New_York

RUN apt-get update && \
apt-get install -y tzdata && \
ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && \
echo $TZ > /etc/timezone

# Update npm to the latest version
RUN npm install -g npm@latest

RUN npm install --omit=dev

CMD ["npm", "start"]
