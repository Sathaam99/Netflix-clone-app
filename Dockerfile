FROM node:22-slim

# Install ffmpeg for on-the-fly video transcoding
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /app

# Copy package metadata files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy local application code to container workspace
COPY . .

# Expose web application port
EXPOSE 8080

# Configure default runtime environment variables
ENV PORT=8080
ENV VIDEOS_DIR=/videos
ENV NODE_ENV=production

# Define start execution script
CMD ["npm", "start"]
