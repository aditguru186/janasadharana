FROM node:20-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache wget

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /usr/src/app/uploads \
  && chown -R app:app /usr/src/app

USER app
VOLUME ["/usr/src/app/uploads"]
EXPOSE 5430

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5430/api/v1/health || exit 1

CMD ["./docker-entrypoint.sh"]
