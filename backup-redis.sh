#!/bin/bash

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required environment variables are set
if [ -z "$REDIS_CONTAINER_NAME" ] || [ -z "$REDIS_PASSWORD" ] || [ -z "$B2_APPLICATION_KEY_ID" ] || [ -z "$B2_APPLICATION_KEY" ] || [ -z "$B2_BUCKET_ID" ]; then
    echo "Error: Missing required environment variables"
    exit 1
fi

# Execute SAVE command in Redis
echo "Saving Redis data..."
docker exec $REDIS_CONTAINER_NAME redis-cli --user default --pass $REDIS_PASSWORD SAVE

# Copy dump.rdb from container
echo "Copying dump.rdb from container..."
docker cp $REDIS_CONTAINER_NAME:/data/dump.rdb ./dump.rdb

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install axios dotenv typescript @types/node ts-node
fi

# Compile TypeScript to JavaScript
echo "Compiling TypeScript..."
npx tsc

# Run the compiled JavaScript
echo "Uploading to B2..."
node dist/upload-to-b2.js

# Clean up
echo "Cleaning up..."
rm -f dump.rdb

echo "Backup process completed successfully!" 