FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time. Empty means same-origin
# requests (/api/...), which nginx proxies to the backend.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Stable branch; apk upgrade pulls OS security fixes published after the tag.
FROM nginx:1.30-alpine
RUN apk upgrade --no-cache && apk add --no-cache openssl
# PUBLIC_HTTPS_PORT: port the browser uses for HTTPS (HTTP -> HTTPS redirect).
# BACKEND_URL: backend address on the internal Docker network.
# CSP_CONNECT_SRC: origins the page may call (add the API origin if external).
# HSTS_MAX_AGE: keep 0 with self-signed certificates; 31536000 in production.
ENV PUBLIC_HTTPS_PORT=443 \
    BACKEND_URL=http://backend:8080 \
    CSP_CONNECT_SRC="'self'" \
    HSTS_MAX_AGE=0
COPY nginx/default.conf.template nginx/security-headers.inc.template /etc/nginx/templates/
COPY --chmod=755 nginx/15-self-signed-cert.sh /docker-entrypoint.d/15-self-signed-cert.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
