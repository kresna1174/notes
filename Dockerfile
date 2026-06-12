# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (development dependencies are required for build stage)
RUN npm ci

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
