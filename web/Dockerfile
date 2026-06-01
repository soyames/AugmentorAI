# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci --workspace=web --include-workspace-root=false

COPY web ./web
RUN npm run build --workspace=web

FROM docker.io/library/nginx:1.27-alpine AS runtime

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/health >/dev/null || exit 1
