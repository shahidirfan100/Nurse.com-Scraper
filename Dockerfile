FROM apify/actor-node-playwright-firefox:22-1.58.2

COPY package*.json ./
RUN npm install --omit=dev

COPY . ./

CMD ["npm", "start", "--silent"]
