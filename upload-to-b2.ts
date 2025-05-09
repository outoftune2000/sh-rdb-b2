import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

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

async function uploadToB2() {
  try {
    const filePath = path.join(process.cwd(), 'dump.rdb');
    const bucketId = process.env.B2_BUCKET_ID;

    if (!bucketId) {
      throw new Error('B2_BUCKET_ID not found in environment variables');
    }

    // Get B2 authorization
    const authResponse = await getB2Auth();
    
    // Get upload URL
    const uploadUrlResponse = await getUploadUrl(authResponse, bucketId);
    
    // Read file
    const fileContent = fs.readFileSync(filePath);
    const fileName = `redis-backup-${new Date().toISOString()}.rdb`;
    
    // Calculate SHA1
    const sha1 = crypto.createHash('sha1').update(fileContent).digest('hex');
    
    // Upload file
    const response = await axios.post(uploadUrlResponse.uploadUrl, fileContent, {
      headers: {
        'Authorization': uploadUrlResponse.authorizationToken,
        'Content-Type': 'b2/x-auto',
        'Content-Length': fileContent.length.toString(),
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'X-Bz-Content-Sha1': sha1
      }
    });

    console.log('Successfully uploaded to B2');
    console.log('File URL:', `${authResponse.downloadUrl}/file/${bucketId}/${fileName}`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Upload failed:', error.response?.data || error.message);
    } else {
      console.error('Upload failed:', error);
    }
    process.exit(1);
  }
}

uploadToB2(); 