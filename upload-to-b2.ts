import { B2 } from 'backblaze-b2';
import * as fs from 'fs';
import * as path from 'path';

const b2 = new B2({
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

async function uploadToB2() {
  try {
    // Authorize with B2
    await b2.authorize();

    // Get upload URL
    const { uploadUrl, authorizationToken } = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID,
    });

    // Read the RDB file
    const filePath = path.join(process.cwd(), 'dump.rdb');
    const fileData = fs.readFileSync(filePath);

    // Upload the file
    await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: `redis-backup-${new Date().toISOString()}.rdb`,
      contentLength: fileData.length,
      contentType: 'application/octet-stream',
      data: fileData,
    });

    console.log('Successfully uploaded to B2');
  } catch (error) {
    console.error('Error uploading to B2:', error);
    process.exit(1);
  }
}

uploadToB2(); 