FROM nginx:alpine
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/nginx/certs/key.pem \
        -out    /etc/nginx/certs/cert.pem \
        -subj   "/C=JO/ST=Amman/L=Amman/O=SkillLink/OU=Dev/CN=localhost"
COPY nginx.conf /etc/nginx/nginx.conf
