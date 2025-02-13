import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';

// Configure the S3 client for Digital Ocean Spaces
const s3Client = new S3Client({
  endpoint: `https://${import.meta.env.VITE_SPACE_REGION}.digitaloceanspaces.com`, // e.g., nyc3
  region: import.meta.env.VITE_SPACE_REGION, // e.g., nyc3
  credentials: {
    accessKeyId: import.meta.env.VITE_SPACES_KEY,
    secretAccessKey: import.meta.env.VITE_SPACES_SECRET
  }
});

export const uploadToSpaces = async (file: File): Promise<string> => {
  try {
    const fileName = `${Date.now()}-${file.name}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: import.meta.env.VITE_SPACE_NAME,
      Key: fileName,
      Body: file,
      ACL: 'public-read',
      ContentType: file.type
    }));

    // Return the public URL
    return `https://${import.meta.env.VITE_SPACE_NAME}.${import.meta.env.VITE_SPACE_REGION}.digitaloceanspaces.com/${fileName}`;
  } catch (error) {
    console.error('Error uploading to Spaces:', error);
    throw error;
  }
};

export const getFromSpaces = async (key: string): Promise<Blob> => {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: import.meta.env.VITE_SPACE_NAME,
      Key: key
    }));

    if (!response.Body) {
      throw new Error('No body in response');
    }

    // Convert the readable stream to a blob
    const blob = await new Response(response.Body as ReadableStream).blob();
    return blob;
  } catch (error) {
    console.error('Error getting from Spaces:', error);
    throw error;
  }
};

export const testSpacesConnection = async (): Promise<boolean> => {
  try {
    // Try to list objects in the bucket
    const response = await s3Client.send(new ListObjectsCommand({
      Bucket: import.meta.env.VITE_SPACE_NAME,
      MaxKeys: 1 // Just request one item to keep it light
    }));
    
    console.log('Spaces connection successful:', {
      bucket: import.meta.env.VITE_SPACE_NAME,
      region: import.meta.env.VITE_SPACE_REGION,
      objects: response.Contents?.length || 0
    });
    
    return true;
  } catch (error) {
    console.error('Spaces connection failed:', error);
    return false;
  }
};
