# Frontend SmartStore: build React bằng Node, phục vụ file tĩnh bằng Caddy.
# Caddy đồng thời là reverse proxy (/api, /uploads → backend) và tự lấy chứng chỉ HTTPS khi có tên miền.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
