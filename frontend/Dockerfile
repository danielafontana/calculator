FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time. Empty means same-origin
# requests (/api/...), which nginx proxies to the backend.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build
# Set by the release workflow from the frontend/vX.Y.Z tag; served as
# /version.json so the deployed version can be checked.
ARG VERSION=dev
RUN printf '{"version":"%s"}\n' "$VERSION" > dist/version.json

# nginx stable branch, running as an unprivileged user (uid 101) on 8080/8443.
FROM nginxinc/nginx-unprivileged:1.30-alpine
USER root
# apk upgrade pulls OS security fixes published after the tag; the certificate
# directory must be writable by nginx for the self-signed fallback.
RUN apk upgrade --no-cache && apk add --no-cache openssl \
    && mkdir -p /etc/nginx/certs && chown nginx:nginx /etc/nginx/certs
USER nginx
# HTTP_MODE: "redirect" sends HTTP to HTTPS (default, production); "app" also
#   serves the app over HTTP (local use, set by docker compose).
# PUBLIC_HTTPS_PORT: port the browser uses for HTTPS (HTTP -> HTTPS redirect).
# BACKEND_ADDR: backend host:port on the internal Docker network.
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS: exposes the container's DNS resolver as
#   NGINX_LOCAL_RESOLVERS, used to re-resolve the backend as it scales.
# NGINX_ENTRYPOINT_WORKER_PROCESSES_AUTOTUNE: one worker per CPU of the
#   container limit instead of per host CPU (avoids workers fighting for a
#   small CPU quota).
# CSP_CONNECT_SRC: origins the page may call (add the API origin if external).
# HSTS_MAX_AGE: keep 0 with self-signed certificates; 31536000 in production.
ENV HTTP_MODE=redirect \
    PUBLIC_HTTPS_PORT=443 \
    BACKEND_ADDR=backend:8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENTRYPOINT_WORKER_PROCESSES_AUTOTUNE=1 \
    CSP_CONNECT_SRC="'self'" \
    HSTS_MAX_AGE=0
COPY nginx/*.template /etc/nginx/templates/
COPY --chmod=755 nginx/15-self-signed-cert.sh /docker-entrypoint.d/15-self-signed-cert.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080 8443
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
