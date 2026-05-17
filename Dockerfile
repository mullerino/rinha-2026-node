FROM node:22-alpine

ENV NODE_ENV=production
ENV SEARCH_INDEX=bucketed

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY data/vectors.bin data/labels.bin data/normalization.json data/mcc_risk.json ./data/

EXPOSE 9999

CMD ["node", "src/server.js"]
