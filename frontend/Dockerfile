FROM node:20-alpine AS build
WORKDIR /usr/src/app

ARG PUBLIC_API_URL=http://localhost:5430/api/v1
ENV PUBLIC_API_URL=$PUBLIC_API_URL

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=5431
ENV BODY_SIZE_LIMIT=5242880

RUN apk add --no-cache wget \
  && addgroup -g 1001 -S app && adduser -S app -u 1001

COPY --from=build /usr/src/app/build ./build
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules

USER app
EXPOSE 5431

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5431/ || exit 1

CMD ["node", "build"]
