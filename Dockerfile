FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production --ignore-scripts

FROM node:18-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p data/blockchain data/agents data/contracts data/bridge data/wallets logs

VOLUME ["/app/data", "/app/logs"]

ENV NODE_ENV=production
ENV PORT=19891

EXPOSE 19891 9848

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:19891/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"