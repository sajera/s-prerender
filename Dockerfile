FROM node:16-alpine

ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/lib/chromium/

# install chromium, tini and clear cache
RUN apk add --update-cache chromium tini \
 && rm -rf /var/cache/apk/* /tmp/*

USER node
WORKDIR "/home/node"

COPY ./package.json .
COPY ./index.js .
COPY ./src .

# install npm packages
RUN npm install --no-package-lock

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["npm", "run", "start"]
