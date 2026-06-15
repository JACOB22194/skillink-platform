# Use the official Node.js lightweight image
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy package.json only first
COPY package*.json ./

# Remove package-lock.json and reinstall to rebuild native modules for Alpine
RUN rm -f package-lock.json && npm install --legacy-peer-deps

# Copy the rest of your React/Vite code
COPY . .

# Expose port 3000
EXPOSE 3000

# Run the Vite development server, binding to all network interfaces on port 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]