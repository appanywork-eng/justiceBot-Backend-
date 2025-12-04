# Use official Node LTS
FROM node:18-alpine

# Create working directory
WORKDIR /app

# Copy package files first (for faster caching)
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy all project files
COPY . .

# Expose Render’s dynamic port
EXPOSE 5000

# Start the server
CMD [ "node", "server.cjs" ]
