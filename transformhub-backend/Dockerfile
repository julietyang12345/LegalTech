FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3
COPY package.json package-lock.json ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 wget
ENV NODE_ENV=production
ENV PORT=4010
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:4010/api/v1/transformhub/health || exit 1
CMD ["node", "dist/main.js"]
