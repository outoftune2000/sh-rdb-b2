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
docker exec $REDIS_CONTAINER_NAME redis-cli -u redis://default:$REDIS_PASSWORD@localhost:6379 SAVE

# Copy dump.rdb from container
echo "Copying dump.rdb from container..."
docker cp $REDIS_CONTAINER_NAME:/data/dump.rdb ./dump.rdb

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install axios dotenv typescript @types/node ts-node
fi

# Compile and run TypeScript upload script
echo "Uploading to B2..."
npx ts-node --esm upload-to-b2.ts

# Clean up
echo "Cleaning up..."
rm -f dump.rdb

echo "Backup process completed successfully!" 