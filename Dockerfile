# Use the latest Bun official image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["bun", "run", "index.ts"]

