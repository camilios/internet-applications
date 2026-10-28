# ─── Build stage ───
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build-time env (يمكن تمريرها من docker-compose)
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── Production stage ───
FROM nginx:alpine AS production

# نسخ ملفات البناء
COPY --from=builder /app/dist /usr/share/nginx/html

# إعداد nginx للـ SPA (كل المسارات ترجع index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
