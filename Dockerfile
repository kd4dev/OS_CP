FROM node:20-bookworm-slim

# Install C++ compiler & make for compiling the native DSM kernel
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first
COPY package.json ./
COPY dsm-ui/package*.json ./dsm-ui/

# Install frontend dependencies
RUN cd dsm-ui && npm install

# Copy all project source code
COPY . .

# Compile native C++ DSM kernel and build React production bundle
RUN make clean && make -j$(nproc)
RUN cd dsm-ui && npm run build

# Default port
ENV PORT=3001
EXPOSE 3001

# Start the unified DSM backend & frontend web server
CMD ["node", "server.js"]
