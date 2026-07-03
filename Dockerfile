FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173

CMD ["node", "server.js"]
