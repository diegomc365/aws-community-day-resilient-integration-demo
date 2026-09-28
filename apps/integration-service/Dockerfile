FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/integration-service/package.json apps/integration-service/package.json
COPY apps/external-api/package.json apps/external-api/package.json
RUN npm ci
COPY tsconfig.json ./
COPY apps/integration-service apps/integration-service
RUN npm run build --workspace @demo/integration-service

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/integration-service ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
