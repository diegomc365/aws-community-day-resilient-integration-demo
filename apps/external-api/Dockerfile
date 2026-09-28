FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/integration-service/package.json apps/integration-service/package.json
COPY apps/external-api/package.json apps/external-api/package.json
RUN npm ci
COPY apps/external-api apps/external-api
RUN npm run build --workspace @demo/external-api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/external-api ./dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
