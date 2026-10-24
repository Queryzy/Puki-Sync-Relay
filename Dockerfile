# Multi-stage build for self-contained CI/CD
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/sync.db

COPY --from=builder /app/dist/bundle.mjs ./bundle.mjs

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "bundle.mjs"]
