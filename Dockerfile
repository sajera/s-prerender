FROM node:16-alpine

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_FLAGS=--no-sandbox,--headless,--disable-gpu,--remote-debugging-port=9222,--hide-scrollbars,--disable-dev-shm-usage \
    CHROME_FORWARD_HEADERS=true \
    CHROME_PATH=/usr/lib/chromium 

RUN apk add --update-cache chromium && \
    rm -rf /var/cache/apk/* /tmp/*

USER node
WORKDIR /home/node

COPY package.json package-lock.json index.js src/ ./

RUN npm install --no-package-lock

EXPOSE 3000

CMD ["npm", "run", "start"]
