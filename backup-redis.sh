#!/bin/bash

# Enable error reporting
set -e
set -x

echo "Starting backup process at $(date)"
echo "Current directory: $(pwd)"
echo "User: $(whoami)"
echo "PATH: $PATH"

# Load environment variables
if [ -f .env ]; then
    echo "Loading .env file"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Check if required environment variables are set
if [ -z "$B2_APPLICATION_KEY_ID" ] || [ -z "$B2_APPLICATION_KEY" ] || [ -z "$B2_BUCKET_ID" ]; then
    echo "Error: Missing required B2 environment variables"
    exit 1
fi

# Function to backup a single Redis instance
backup_redis_instance() {
    local container_name=$1
    local password=$2
    local instance_name=$3

    echo "Backing up Redis instance: $instance_name"
    
    # Execute SAVE command in Redis
    echo "Saving Redis data for $instance_name..."
    docker exec $container_name redis-cli -a "$password" --no-auth-warning SAVE

    # Copy dump.rdb from container with instance-specific name
    echo "Copying dump.rdb from container $instance_name..."
    docker cp $container_name:/data/dump.rdb "./dump_${instance_name}.rdb"
}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install axios dotenv typescript @types/node ts-node
fi

# Compile TypeScript to JavaScript
echo "Compiling TypeScript..."
npx tsc

# Process each Redis instance
# Format: REDIS_INSTANCES="instance1:container1:password1,instance2:container2:password2"
if [ -z "$REDIS_INSTANCES" ]; then
    echo "Error: REDIS_INSTANCES environment variable not set"
    exit 1
fi

# Split the instances string and process each one
IFS=',' read -ra INSTANCES <<< "$REDIS_INSTANCES"
for instance in "${INSTANCES[@]}"; do
    IFS=':' read -ra PARTS <<< "$instance"
    if [ ${#PARTS[@]} -ne 3 ]; then
        echo "Error: Invalid instance format. Expected 'name:container:password'"
        exit 1
    fi
    backup_redis_instance "${PARTS[1]}" "${PARTS[2]}" "${PARTS[0]}"
done

# Run the compiled JavaScript to upload all backups
echo "Uploading to B2..."
node dist/upload-to-b2.js

# Clean up
echo "Cleaning up..."
rm -f dump_*.rdb

echo "Backup process completed successfully at $(date)" 