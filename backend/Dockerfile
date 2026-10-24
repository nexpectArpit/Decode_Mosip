FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/index.js"]
