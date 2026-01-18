# Node.js 20 base image
FROM node:20-slim

WORKDIR /app

# Install OS deps used by GCS client if needed
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files and install production deps
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .


# Env and port (use 5050 for consistency with backend code)
ENV PORT=5050
EXPOSE 5050

# Start server
CMD ["node", "server.js"]


