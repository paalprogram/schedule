# ── Stage 1: Install all dependencies ──
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Build the app ──
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DB_PATH=/data/schedule.db

# Build Next.js standalone output
RUN npm run build

# Bundle migration script to plain JS (no tsx needed at runtime)
RUN npx esbuild src/db/migrate.ts --bundle --platform=node --target=node22 \
    --outfile=dist/migrate.js --external:better-sqlite3

# ── Stage 3: Production image ──
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DB_PATH=/data/schedule.db
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# sqlite3 CLI for daily backup script
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Copy standalone server + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy compiled migration script
COPY --from=builder /app/dist/migrate.js ./migrate.js

# Startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Data directory (overridden by Fly volume mount)
RUN mkdir -p /data

EXPOSE 3000
CMD ["./start.sh"]
