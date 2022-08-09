
# s-prerender
This app is primitive solution to resolve SPA problems with SEO.


## Getting start
Via development process allowed all react-create-app scripts, except `eject`. To start development process locally follow instructions below.

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


### Redis
The package require Redis instance.

### Chrome
The package require Chrome instance.
