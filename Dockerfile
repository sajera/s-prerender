FROM node:16-alpine

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium 

RUN apk add --update-cache chromium && \
    rm -rf /var/cache/apk/* /tmp/*

USER node
WORKDIR /home/node

COPY package.json package-lock.json index.js src/ ./

RUN npm install --no-package-lock

EXPOSE 3000

#ENTRYPOINT ["tini", "--"]
CMD ["npm", "run", "start"]
