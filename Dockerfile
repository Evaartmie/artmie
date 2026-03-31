FROM node:18-slim

RUN apt-get update -y && apt-get install -y openssl libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production=false

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "echo '=== Starting ===' && echo 'PORT='$PORT && echo 'NODE_ENV='$NODE_ENV && echo 'SHOPIFY_APP_URL='$SHOPIFY_APP_URL && npx prisma db push --accept-data-loss && echo '=== Prisma done, starting remix-serve ===' && ls -la ./build/server/ && npx remix-serve ./build/server/index.js"]
