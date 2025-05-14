const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { Readable } = require('stream');
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

interface B2UploadPartUrlResponse {
  uploadUrl: string;
  authorizationToken: string;
}

interface B2StartLargeFileResponse {
  fileId: string;
  fileName: string;
  accountId: string;
  bucketId: string;
  contentType: string;
}

interface B2File {
  fileName: string;
  uploadTimestamp: number;
  fileId: string;
}

const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
const MAX_BACKUPS_PER_INSTANCE = 2; // Keep 2 previous versions

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

async function listFiles(authResponse: B2AuthResponse, bucketId: string): Promise<B2File[]> {
  const response = await axios.get(
    `${authResponse.apiUrl}/b2api/v2/b2_list_file_names`,
    {
      headers: {
        'Authorization': authResponse.authorizationToken
      },
      params: {
        bucketId,
        maxFileCount: 1000
      }
    }
  );
  return response.data.files;
}

async function deleteFile(authResponse: B2AuthResponse, fileId: string, fileName: string): Promise<void> {
  await axios.post(
    `${authResponse.apiUrl}/b2api/v2/b2_delete_file_version`,
    {
      fileId,
      fileName
    },
    {
      headers: {
        'Authorization': authResponse.authorizationToken
      }
    }
  );
}

async function cleanupOldBackups(authResponse: B2AuthResponse, bucketId: string, instanceName: string): Promise<void> {
  const files = await listFiles(authResponse, bucketId);
  
  // Filter files for this instance and sort by upload time (newest first)
  const instanceFiles = files
    .filter(file => file.fileName.startsWith(`redis-backup-${instanceName}-`))
    .sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
  
  // Delete files beyond the MAX_BACKUPS_PER_INSTANCE limit
  const filesToDelete = instanceFiles.slice(MAX_BACKUPS_PER_INSTANCE);
  
  for (const file of filesToDelete) {
    console.log(`Deleting old backup: ${file.fileName}`);
    await deleteFile(authResponse, file.fileId, file.fileName);
  }
}

async function startLargeFileUpload(
  authResponse: B2AuthResponse,
  fileName: string,
  contentType: string,
  bucketId: string
): Promise<B2StartLargeFileResponse> {
  const response = await axios.post(
    `${authResponse.apiUrl}/b2api/v2/b2_start_large_file`,
    {
      bucketId,
      fileName,
      contentType
    },
    {
      headers: {
        'Authorization': authResponse.authorizationToken
      }
    }
  );
  return response.data;
}

async function getUploadPartUrl(
  authResponse: B2AuthResponse,
  fileId: string
): Promise<B2UploadPartUrlResponse> {
  const response = await axios.get(
    `${authResponse.apiUrl}/b2api/v2/b2_get_upload_part_url`,
    {
      headers: {
        'Authorization': authResponse.authorizationToken
      },
      params: {
        fileId
      }
    }
  );
  return response.data;
}

async function uploadPart(
  uploadUrl: string,
  authorizationToken: string,
  partNumber: number,
  fileId: string,
  chunk: Buffer
): Promise<{ partNumber: number; contentLength: number; contentSha1: string }> {
  const sha1 = createHash('sha1').update(chunk).digest('hex');
  
  const response = await axios.post(
    uploadUrl,
    chunk,
    {
      headers: {
        'Authorization': authorizationToken,
        'Content-Type': 'b2/x-auto',
        'Content-Length': chunk.length.toString(),
        'X-Bz-Part-Number': partNumber.toString(),
        'X-Bz-Content-Sha1': sha1
      }
    }
  );
  
  return {
    partNumber,
    contentLength: chunk.length,
    contentSha1: sha1
  };
}

async function finishLargeFile(
  authResponse: B2AuthResponse,
  fileId: string,
  partSha1Array: string[]
): Promise<void> {
  await axios.post(
    `${authResponse.apiUrl}/b2api/v2/b2_finish_large_file`,
    {
      fileId,
      partSha1Array
    },
    {
      headers: {
        'Authorization': authResponse.authorizationToken
      }
    }
  );
}

async function uploadLargeFileToB2(
  filePath: string,
  fileName: string,
  authResponse: B2AuthResponse,
  bucketId: string
): Promise<void> {
  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;
  
  // Start large file upload
  const startResponse = await startLargeFileUpload(
    authResponse,
    fileName,
    'b2/x-auto',
    bucketId
  );
  
  const fileId = startResponse.fileId;
  const totalParts = Math.ceil(fileSize / CHUNK_SIZE);
  const partSha1Array: string[] = [];
  
  // Upload each part
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const start = (partNumber - 1) * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileSize);
    const chunk = Buffer.alloc(end - start);
    
    const fileHandle = fs.openSync(filePath, 'r');
    fs.readSync(fileHandle, chunk, 0, end - start, start);
    fs.closeSync(fileHandle);
    
    const uploadPartUrlResponse = await getUploadPartUrl(authResponse, fileId);
    const partResponse = await uploadPart(
      uploadPartUrlResponse.uploadUrl,
      uploadPartUrlResponse.authorizationToken,
      partNumber,
      fileId,
      chunk
    );
    
    partSha1Array[partNumber - 1] = partResponse.contentSha1;
    console.log(`Uploaded part ${partNumber} of ${totalParts}`);
  }
  
  // Finish large file upload
  await finishLargeFile(authResponse, fileId, partSha1Array);
  
  console.log(`Successfully uploaded ${fileName} to B2`);
  console.log('File URL:', `${authResponse.downloadUrl}/file/${bucketId}/${fileName}`);
}

async function uploadToB2() {
  try {
    const bucketId = process.env.B2_BUCKET_ID;
    if (!bucketId) {
      throw new Error('B2_BUCKET_ID not found in environment variables');
    }

    // Get B2 authorization
    const authResponse = await getB2Auth();
    
    // Find all dump files
    const dumpFiles: string[] = fs.readdirSync(process.cwd())
      .filter((file: string) => file.startsWith('dump_') && file.endsWith('.rdb'));

    if (dumpFiles.length === 0) {
      throw new Error('No Redis dump files found');
    }

    // Upload each dump file
    for (const dumpFile of dumpFiles) {
      const instanceName = dumpFile.replace('dump_', '').replace('.rdb', '');
      const fileName = `redis-backup-${instanceName}-${new Date().toISOString()}.rdb`;
      
      // Clean up old backups before uploading new one
      await cleanupOldBackups(authResponse, bucketId, instanceName);
      
      // Upload the new backup
      await uploadLargeFileToB2(
        path.join(process.cwd(), dumpFile),
        fileName,
        authResponse,
        bucketId
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