FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
RUN apk add --no-cache git
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4243 \
    TODO_DATA_DIR=/data \
    TODO_STATE_DIR=/state \
    TODO_HISTORY_DIR=/state/history
COPY --from=build /app ./
EXPOSE 4243
VOLUME ["/data", "/state"]
CMD ["node", "scripts/start.mts"]
