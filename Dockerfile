FROM node:16-alpine as installer

WORKDIR /opt/app

COPY . ./
RUN npm install --no-package-lock

FROM node:16-alpine

ARG WORKDIR=/opt/app

RUN apk add --no-cache chromium && \
    rm -rf /var/cache/apk/* /tmp/*

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_DEBUGGING_PORT=9222 \
    CHROME_FORWARD_HEADERS=true \
    CHROME_FLAGS=--no-sandbox,--headless,--disable-gpu,--remote-debugging-port=9222,--hide-scrollbars,--disable-dev-shm-usage

EXPOSE 3000

USER node
WORKDIR $WORKDIR

COPY --from=installer $WORKDIR/index.js $WORKDIR/package*.json ./
COPY --from=installer $WORKDIR/node_modules node_modules/
COPY --from=installer $WORKDIR/src src/

CMD ["npm", "run", "start"]
