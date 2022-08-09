
# s-prerender
This app is primitive solution to resolve SPA problems with SEO.


## Getting start
Before start local development please make sure you have [Chrome browser](https://www.google.com/chrome/) and instance of [Redis](https://redis.io/) [help](https://tableplus.com/blog/2018/10/how-to-start-stop-restart-redis.html)

- **install dependencies**
    - `> npm install`
- **run project locally**
    - `> npm run start:dev`
---
### API
Will render URL in `Chrome` browser then return `HTML` only the first time. After providing `HTML` content from the `Redis` cache.
- **GET /render?url=http://example.com/**
    - `> curl 'http://localhost:3000/render?url=http://example.com/'`

Force reset `Redis` and render url in `Chrome` browser then return `html`.
- **GET /refresh**
    - `> curl 'http://localhost:3000/refresh?url=http://example.com/'`

### Docker
TODO pack into docker

### Redis
The package require Redis instance.

### Chrome
The package require Chrome instance.
