FROM php:8.2-cli

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    default-mysql-client \
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install grpc and protobuf PHP extensions
RUN pecl install grpc protobuf \
    && docker-php-ext-enable grpc protobuf

# Set working directory
WORKDIR /var/www/html

# Copy composer files first for better caching
COPY composer.json composer.lock ./

# Install dependencies
ARG INSTALL_DEV_DEPENDENCIES=false
RUN if [ "$INSTALL_DEV_DEPENDENCIES" = "true" ]; then \
        composer install --optimize-autoloader --no-scripts; \
    else \
        composer install --no-dev --optimize-autoloader --no-scripts; \
    fi

# Copy application code
COPY . .

# Run post-install scripts
RUN composer run-script post-autoload-dump

# Create storage directories
RUN mkdir -p storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    storage/app/public/products \
    bootstrap/cache

# Set permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 775 storage bootstrap/cache

# Create entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
