# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY vite.config.ts ./

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4173/ || exit 1

CMD ["npm", "run", "start"]
