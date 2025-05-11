const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
require('dotenv').config();

interface B2AuthResponse {
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
}

interface B2UploadUrlResponse {
  uploadUrl: string;
  authorizationToken: string;
}

async function getB2Auth(): Promise<B2AuthResponse> {
  const { B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY } = process.env;
  
  if (!B2_APPLICATION_KEY_ID || !B2_APPLICATION_KEY) {
    throw new Error('B2 credentials not found in environment variables');
  }

  const authString = Buffer.from(`${B2_APPLICATION_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
  
  const response = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: {
      'Authorization': `Basic ${authString}`
    }
  });

  return response.data;
}

async function getUploadUrl(authResponse: B2AuthResponse, bucketId: string): Promise<B2UploadUrlResponse> {
  const response = await axios.get(`${authResponse.apiUrl}/b2api/v2/b2_get_upload_url`, {
    headers: {
      'Authorization': authResponse.authorizationToken
    },
    params: {
      bucketId
    }
  });

  return response.data;
}

async function uploadFileToB2(
  filePath: string,
  fileName: string,
  authResponse: B2AuthResponse,
  uploadUrlResponse: B2UploadUrlResponse
): Promise<void> {
  const fileContent = fs.readFileSync(filePath);
  const sha1 = createHash('sha1').update(fileContent).digest('hex');
  
  await axios.post(uploadUrlResponse.uploadUrl, fileContent, {
    headers: {
      'Authorization': uploadUrlResponse.authorizationToken,
      'Content-Type': 'b2/x-auto',
      'Content-Length': fileContent.length.toString(),
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'X-Bz-Content-Sha1': sha1
    }
  });

  console.log(`Successfully uploaded ${fileName} to B2`);
  console.log('File URL:', `${authResponse.downloadUrl}/file/${process.env.B2_BUCKET_ID}/${fileName}`);
}

async function uploadToB2() {
  try {
    const bucketId = process.env.B2_BUCKET_ID;
    if (!bucketId) {
      throw new Error('B2_BUCKET_ID not found in environment variables');
    }

    // Get B2 authorization
    const authResponse = await getB2Auth();
    
    // Get upload URL
    const uploadUrlResponse = await getUploadUrl(authResponse, bucketId);
    
    // Find all dump files
    const dumpFiles = fs.readdirSync(process.cwd())
      .filter(file => file.startsWith('dump_') && file.endsWith('.rdb'));

    if (dumpFiles.length === 0) {
      throw new Error('No Redis dump files found');
    }

    // Upload each dump file
    for (const dumpFile of dumpFiles) {
      const instanceName = dumpFile.replace('dump_', '').replace('.rdb', '');
      const fileName = `redis-backup-${instanceName}-${new Date().toISOString()}.rdb`;
      await uploadFileToB2(
        path.join(process.cwd(), dumpFile),
        fileName,
        authResponse,
        uploadUrlResponse
      );
    }

  } catch (error: unknown) {
    if (axios.isAxiosError(error as any)) {
      console.error('Upload failed:', (error as any).response?.data || (error as any).message);
    } else {
      console.error('Upload failed:', error);
    }
    process.exit(1);
  }
}

uploadToB2(); 