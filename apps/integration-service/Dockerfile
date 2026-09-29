FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/integration-service/package.json apps/integration-service/package.json
COPY apps/external-api/package.json apps/external-api/package.json
RUN npm ci
COPY tsconfig.json ./
COPY apps/integration-service/tsconfig.json apps/integration-service/tsconfig.json
COPY apps/integration-service/src apps/integration-service/src
RUN npm run build --workspace @demo/integration-service

FROM node:22-alpine AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/integration-service/package.json apps/integration-service/package.json
COPY apps/external-api/package.json apps/external-api/package.json
RUN npm ci --omit=dev --omit=optional --workspace @demo/integration-service --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production
ENV NO_COLOR=1
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/integration-service ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health', { signal: AbortSignal.timeout(4000) }).then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"
CMD ["node", "dist/main.js"]
