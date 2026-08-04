# ── Build stage ──────────────────────────────────────────────────────────────
# Coolify/Compose often inject NODE_ENV=production into the whole build.
# That makes `npm install` skip devDependencies (vite, svelte, kit) →
# `npm run build` then fails with exit 127 (vite: not found).
FROM node:20-alpine AS build
WORKDIR /usr/src/app

ARG PUBLIC_API_URL=http://localhost:5430/api/v1
ENV PUBLIC_API_URL=$PUBLIC_API_URL

# Force install of build tools regardless of Coolify NODE_ENV
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=5431
ENV BODY_SIZE_LIMIT=5242880
ENV HOST=0.0.0.0

RUN apk add --no-cache wget \
  && addgroup -g 1001 -S app && adduser -S app -u 1001

# SvelteKit adapter-node output
COPY --from=build /usr/src/app/build ./build
COPY --from=build /usr/src/app/package.json ./
# Production deps only at runtime (smaller image)
COPY --from=build /usr/src/app/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && chown -R app:app /usr/src/app

USER app
EXPOSE 5431

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5431/ || exit 1

CMD ["node", "build"]
