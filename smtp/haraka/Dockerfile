FROM node:22-alpine
WORKDIR /smtp
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 25
CMD ["npm", "start"]
