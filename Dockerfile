# ── Stage 1: build the Vite frontend ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build


# ── Stage 2: lean production image ────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Only copy what the server needs at runtime
COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY --from=builder /app/dist ./dist

# Cloud Run requires the app to listen on $PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
