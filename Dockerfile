# Use official Node LTS
FROM node:18

# Create working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose port 5000 (your backend port)
EXPOSE 5000

# Start the server
CMD ["node", "server.cjs"]
