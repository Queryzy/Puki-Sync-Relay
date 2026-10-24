FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/sync.db

COPY dist/bundle.mjs ./bundle.mjs

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "bundle.mjs"]
