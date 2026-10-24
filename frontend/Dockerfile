FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time. Empty means same-origin
# requests (/api/...), which nginx proxies to the backend.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.29-alpine
RUN apk add --no-cache openssl
# Port the browser uses for HTTPS (used in the HTTP -> HTTPS redirect) and the
# backend address on the internal Docker network.
ENV PUBLIC_HTTPS_PORT=443 \
    BACKEND_URL=http://backend:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 nginx/15-self-signed-cert.sh /docker-entrypoint.d/15-self-signed-cert.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
