<?php

// PHP's development server handles existing public assets. Laravel handles application routes.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if ($path !== '/' && !str_contains($path, "\0") && is_file(getcwd().$path)) {
    return false;
}
require getcwd().'/index.php';
