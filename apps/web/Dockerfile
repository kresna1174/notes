# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests (monorepo: root + workspace)
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Install dependencies (development dependencies are required for build stage)
RUN npm ci --legacy-peer-deps

# Copy application source code
COPY . .

# Build frontend production assets
RUN npm run build

# Expose port
EXPOSE 3000

# Environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Start production server
CMD ["npm", "start"]
