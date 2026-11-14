# ─── Build stage ───
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build-time env (يمكن تمريرها من docker-compose)
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_REVERB_APP_KEY=ecommerce-local
ARG VITE_REVERB_HOST=localhost
ARG VITE_REVERB_PORT=8080
ARG VITE_REVERB_SCHEME=http
ENV VITE_REVERB_APP_KEY=$VITE_REVERB_APP_KEY \
    VITE_REVERB_HOST=$VITE_REVERB_HOST \
    VITE_REVERB_PORT=$VITE_REVERB_PORT \
    VITE_REVERB_SCHEME=$VITE_REVERB_SCHEME

ENV RAYON_NUM_THREADS=1 UV_THREADPOOL_SIZE=1 NODE_OPTIONS=--max-old-space-size=768
RUN npm run build

# ─── Production stage ───
FROM nginx:alpine AS production

# نسخ ملفات البناء
COPY --from=builder /app/dist /usr/share/nginx/html

# إعداد nginx للـ SPA (كل المسارات ترجع index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
