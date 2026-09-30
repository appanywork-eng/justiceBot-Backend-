FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY server.mjs ./
COPY lib ./lib
COPY data ./data

USER node

EXPOSE 8080

CMD ["npm", "start"]
