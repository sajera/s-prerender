FROM node:16-alpine

RUN apk add --update-cache chromium && \
    rm -rf /var/cache/apk/* /tmp/*

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_DEBUGGING_PORT=9222 \
    CHROME_FORWARD_HEADERS=true \
    CHROME_FLAGS=--no-sandbox,--headless,--disable-gpu,--remote-debugging-port=9222--hide-scrollbars,--disable-dev-shm-usage

USER node
WORKDIR /home/node

COPY package.json package-lock.json index.js src/ ./

RUN npm install

EXPOSE 3000

CMD ["npm", "run", "start"]
