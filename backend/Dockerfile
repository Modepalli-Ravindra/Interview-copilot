# ==========================================
# Stage 1: Build
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# Writable data dir for the GitHub cache / JSON-store fallback.
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
