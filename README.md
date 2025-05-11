# Redis Backup to Backblaze B2

A TypeScript-based solution for backing up multiple Redis instances to Backblaze B2 cloud storage.

## Features

- Backup multiple Redis instances in a single run
- Automatic upload to Backblaze B2 cloud storage
- Instance-specific backup naming
- Docker container support
- TypeScript implementation

## Prerequisites

- Node.js (v14 or higher)
- Docker (for Redis containers)
- Backblaze B2 account with:
  - Application Key ID
  - Application Key
  - Bucket ID

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/sh-rdb-b2.git
cd sh-rdb-b2
```

2. Install dependencies:
```bash
npm install
```

## Configuration

Create a `.env` file in the project root with the following variables:

```env
# Backblaze B2 Configuration
B2_APPLICATION_KEY_ID=your_application_key_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET_ID=your_bucket_id

# Redis Instances Configuration
# Format: "instance_name:container_name:password"
REDIS_INSTANCES="cache:redis-cache-prod:cachepass,queue:redis-queue-prod:queuepass"
```

### Redis Instances Format

The `REDIS_INSTANCES` variable uses the following format:
```
"instance1:container1:password1,instance2:container2:password2"
```

Where:
- `instance_name`: User-defined name to identify the Redis instance (e.g., "cache", "queue")
- `container_name`: Docker container name where Redis is running
- `password`: Redis password for that instance

Example:
```env
REDIS_INSTANCES="cache:redis-cache-prod:myCachePass123,queue:redis-queue-prod:myQueuePass456"
```

## Usage

Run the backup script:

```bash
npm run backup
```

The script will:
1. Connect to each Redis instance
2. Create a backup of each instance
3. Upload the backups to B2 with instance-specific names
4. Clean up temporary files

### Backup File Naming

Backup files are named using the following format:
```
redis-backup-{instance_name}-{timestamp}.rdb
```

Example:
```
redis-backup-cache-2024-03-14T12:00:00.000Z.rdb
redis-backup-queue-2024-03-14T12:00:00.000Z.rdb
```

## Error Handling

The script includes error handling for:
- Missing environment variables
- Invalid Redis instance configuration
- Failed Redis connections
- Failed B2 uploads

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.