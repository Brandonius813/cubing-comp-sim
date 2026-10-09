# Build from the application root: docker build -f server/Dockerfile -t ccs-api .
# Use Docker's official public mirror so shared CI runners need no Hub credentials.
FROM public.ecr.aws/docker/library/node:24-alpine AS build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server ./
COPY src/storage/validation.ts /app/src/storage/validation.ts
COPY src/core /app/src/core
RUN npm run build && npm prune --omit=dev

FROM public.ecr.aws/docker/library/node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/server/package.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/migrations ./migrations
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
