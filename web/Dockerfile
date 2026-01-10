
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY . .
ARG API_HOST
ARG APP_VERSION
ARG NEXT_PUBLIC_API_BASE
ENV API_HOST=$API_HOST
ENV APP_VERSION=$APP_VERSION
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
