# Use the official NGINX lightweight image
FROM nginx:alpine

# Copy the web application files to the default NGINX public HTML directory
COPY app/ /usr/share/nginx/html/

# Expose port 80 for NGINX
EXPOSE 80

# The default command of the NGINX image starts the server, so no CMD is needed.
