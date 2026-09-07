FROM node:22-slim AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build Next.js
RUN npm run build

# Default DB path — override with a volume mount in production
ENV RVS_DB=/data/rvs.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "scripts/start.js"]
