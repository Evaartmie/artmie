FROM node:18-slim

RUN apt-get update -y && apt-get install -y openssl libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production=false

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["node", "server.mjs"]
