# Static host for the fishing-conditions SPA. There is no build step and no
# runtime dependencies: the app is plain ES modules plus vendored Leaflet and
# SunCalc, so the image is just nginx plus the files.
FROM docker.io/library/nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html
COPY index.html app.css manifest.json sw.js icon-192.png icon-512.png ./
COPY js/     ./js/
COPY vendor/ ./vendor/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/index.html || exit 1
