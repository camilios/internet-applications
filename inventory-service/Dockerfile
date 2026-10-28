FROM node:22-alpine AS builder

WORKDIR /app

# Copy proto file
COPY proto/ /app/proto/

# Copy inventory service files
COPY inventory-service/package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    cp -R node_modules prod_node_modules && \
    npm ci

COPY inventory-service/ ./

# Build TypeScript
RUN npx tsc

# ─── Production Stage ───────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prod_node_modules ./node_modules
COPY --from=builder /app/proto ../proto

# Copy entrypoint
COPY inventory-service/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 50051

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]

