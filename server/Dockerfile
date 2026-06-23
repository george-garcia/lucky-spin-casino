# Casino backend (Express + SQLite). Build context = mock-gambling-site (npm workspaces root).
FROM node:22-alpine
WORKDIR /app
# better-sqlite3 compiles a native addon.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --workspace server
COPY server ./server
WORKDIR /app/server
ENV NODE_ENV=production PORT=4100
EXPOSE 4100
# `start` runs the TypeScript entry via tsx (kept as a dependency in the image).
CMD ["npm", "run", "start"]
