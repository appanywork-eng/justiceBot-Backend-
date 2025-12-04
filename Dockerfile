# Use official Node.js LTS
FROM node:18

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the entire project
COPY . .

# Expose Cloud Run port
ENV PORT=8080

# Start server
CMD ["node", "server.cjs"]
