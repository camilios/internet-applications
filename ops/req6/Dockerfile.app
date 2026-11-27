ARG BASE=ecommerce-req5-app:local
FROM ${BASE}
WORKDIR /var/www/html
COPY app ./app
COPY bootstrap/app.php bootstrap/app.php
COPY config/logging.php config/logging.php
