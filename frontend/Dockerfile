FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time, so the API URL is a build arg.
ARG VITE_API_URL=http://localhost:8080
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
