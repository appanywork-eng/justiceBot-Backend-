# Use official Node.js LTS image
FROM node:18

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all backend files
COPY . .

# Expose the port used by server.cjs
EXPOSE 5000

# Start the server
CMD ["node", "server.cjs"]
