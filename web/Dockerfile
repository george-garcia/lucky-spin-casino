# Casino frontend (Vite). Build context = mock-gambling-site (npm workspaces root).
FROM node:22-alpine AS build
WORKDIR /app
# The web workspace pulls @mockbank/connect from GitHub (its prepare script builds it).
RUN apk add --no-cache git
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --workspace web
COPY web ./web
ARG VITE_API_URL=http://localhost:4100
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_DEMO_PASSWORD=
ENV VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
WORKDIR /app/web
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
