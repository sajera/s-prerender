
# s-prerender
This app is a solution for SPA problems with SEO.


## Getting start
Running on local environment the API - require instance of Redis [learn more..](https://redis.io/docs/getting-started/).
Before start development locally, please make sure you have installed [Chrome browser](https://www.google.com/chrome/) and instance of [Redis](https://redis.io/) was run. ([MAC](https://tableplus.com/blog/2018/10/how-to-start-stop-restart-redis.html) | [Windows](https://riptutorial.com/redis/example/29962/installing-and-running-redis-server-on-windows))

**install dependencies**

`npm install`

**Run prerender**

`npm run start`

**Run for local development with watching file changes by [nodemon](https://www.npmjs.com/package/nodemon)**

`npm run start:dev`


## Start using [Docker](https://www.docker.com/)
Please, take in mind, that the `Dockerfile` isn't for local usage. It exists to simplify inserting the app into complex infrastructures.
For local, please use `docker-compose.yml` only.

**Run locally with watching file changes by [nodemon](https://www.npmjs.com/package/nodemon)**

`docker compose up`


## Deploy
Deployment using Docker Image require only `REDIS_URL`.

> Defaults
- `PORT=*80`
- `HOST=0.0.0.0`
- `REDIS_URL=`
- `ALLOW_DOMAINS=.`

---
### API
- To know Service health
  - **GET /health**
  - `curl 'http://localhost:3000/health'`
  - `{ status: "UP" | "DOWN"  }`

- Will render URL in `Chrome` browser then return `HTML` only the first time. After providing `HTML` content from the cache.
  - **GET /render**
  - `curl 'http://localhost:3000/render?url=http://example.com/'`

- Force reset cache and render url in `Chrome` browser then return `html`.
  - **GET /refresh**
  - `curl 'http://localhost:3000/refresh?url=http://example.com/'`

- Will get URL `HTML` content from the cache.
  - **GET /cached**
  - `curl 'http://localhost:3000/cached?url=http://example.com/'`

- Will clear URL `HTML` content from the cache.
  - **DELETE /cached**
  - `curl -X 'DELETE' 'http://localhost:3000/cached?url=http://example.com/'`

