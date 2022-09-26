FROM node:16-alpine

RUN apk add --update-cache chromium && \
    rm -rf /var/cache/apk/* /tmp/*

ENV DEBUG=false \
    HOST=0.0.0.0 \
    REDIS_URL="" \
    RABBITMQ_URL="" \
    CHROME_DEBUGGING_PORT=9222 \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_FLAGS="--no-sandbox,--headless,--disable-gpu,--remote-debugging-port=9222,--hide-scrollbars,--disable-dev-shm-usage"

USER node
WORKDIR /home/node

COPY package.json package-lock.json .env ./
COPY src/ ./src

RUN npm install --no-package-lock

EXPOSE 3636

CMD ["npm", "run", "start"]
