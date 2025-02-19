import express, { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import sharp from 'sharp';
import pg from 'pg';
const { Pool } = pg;
import { S3Client, PutObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

// After config() call, add this logging
console.log('Spaces Configuration:', {
  region: process.env.VITE_SPACE_REGION,
  spaceName: process.env.VITE_SPACE_NAME,
  hasKey: !!process.env.VITE_SPACES_KEY,
  hasSecret: !!process.env.VITE_SPACES_SECRET
});

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Configure S3 client for Digital Ocean Spaces
const s3Client = new S3Client({
  endpoint: `https://${process.env.SPACE_REGION}.digitaloceanspaces.com`,
  region: process.env.SPACE_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY!,
    secretAccessKey: process.env.SPACES_SECRET!
  }
});

// Configure multer for memory storage instead of disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Configure PostgreSQL connection
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'ar_tracking',
  password: process.env.POSTGRES_PASSWORD || '',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadToSpaces(buffer: Buffer, originalname: string, mimetype: string): Promise<string> {
  try {
    const fileName = `${Date.now()}-${originalname}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.SPACE_NAME,
      Key: fileName,
      Body: buffer,
      ACL: 'public-read',
      ContentType: mimetype
    }));

    return `https://${process.env.SPACE_NAME}.${process.env.SPACE_REGION}.digitaloceanspaces.com/${fileName}`;
  } catch (error) {
    console.error('Error uploading to Spaces:', error);
    throw error;
  }
}

async function processImageForTracking(imageBuffer: Buffer) {
  try {
    console.log('Processing image from buffer');
    
    // Load and process image with Sharp
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    // Get image dimensions
    const { width = 0, height = 0 } = metadata;
    
    // Convert to grayscale and get raw pixel data
    const { data } = await image
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Simple edge detection (this is a basic example)
    const points = [];
    const threshold = 50;
    const stride = 10; // Check every 10th pixel for performance
    
    for (let y = stride; y < height - stride; y += stride) {
      for (let x = stride; x < width - stride; x += stride) {
        const idx = y * width + x;
        const current = data[idx];
        const up = data[idx - width];
        const down = data[idx + width];
        const left = data[idx - 1];
        const right = data[idx + 1];
        
        // Check for significant intensity changes
        if (Math.abs(current - up) > threshold ||
            Math.abs(current - down) > threshold ||
            Math.abs(current - left) > threshold ||
            Math.abs(current - right) > threshold) {
          points.push({
            pt: { x, y },
            size: 1,
            angle: 0,
            response: Math.abs(current - up) + Math.abs(current - down) +
                     Math.abs(current - left) + Math.abs(current - right),
            octave: 0
          });
        }
      }
    }
    
    console.log('Processing complete');
    
    return {
      width,
      height,
      features: points.length,
      points
    };
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

async function testSpacesConnection() {
  try {
    const response = await s3Client.send(new ListObjectsCommand({
      Bucket: process.env.VITE_SPACE_NAME,
      MaxKeys: 10
    }));
    
    console.log('Current files in Space:', response.Contents?.map(item => ({
      key: item.Key,
      size: item.Size,
      modified: item.LastModified
    })));
    
    return true;
  } catch (error) {
    console.error('Spaces connection test failed:', error);
    return false;
  }
}

app.post('/api/upload', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      console.error('No file in request');
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    console.log('File received:', {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    try {
      // Upload to Spaces first
      const imageUrl = await uploadToSpaces(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      console.log('Successfully uploaded to Spaces:', imageUrl);

      // Process image after upload
      const trackingData = await processImageForTracking(req.file.buffer);
      console.log('Tracking data generated:', {
        width: trackingData.width,
        height: trackingData.height,
        features: trackingData.features
      });

      const query = `
        INSERT INTO tracking_images (
          filename,
          filepath,
          upload_date,
          processed,
          tracking_data
        ) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
      
      const values = [
        req.file.originalname,
        imageUrl, // Store the Spaces URL instead of local path
        new Date(),
        true,
        JSON.stringify(trackingData)
      ];

      const result = await pool.query(query, values);
      console.log('Saved to database with ID:', result.rows[0].id);
      
      res.json({
        success: true,
        imageId: result.rows[0].id,
        filename: req.file.originalname,
        imageUrl,
        trackingData
      });
    } catch (processError: unknown) {
      console.error('Processing error:', processError);
      const errorMessage = processError instanceof Error ? processError.message : 'Unknown processing error';
      res.status(500).json({ error: 'Image processing failed', details: errorMessage });
    }
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
    res.status(500).json({ error: 'Upload failed', details: errorMessage });
  }
});

app.get('/api/test-spaces', async (_req: Request, res: Response) => {
  const isConnected = await testSpacesConnection();
  res.json({ success: isConnected });
});

// Add this new endpoint
app.get('/api/check-env', (_req: Request, res: Response) => {
  const envCheck = {
    // Server-side vars (no VITE prefix)
    SPACE_REGION: process.env.SPACE_REGION,
    SPACE_NAME: process.env.SPACE_NAME,
    HAS_SPACES_KEY: !!process.env.SPACES_KEY,
    HAS_SPACES_SECRET: !!process.env.SPACES_SECRET,
    
    // Client-side vars (VITE prefix)
    VITE_SPACE_REGION: process.env.VITE_SPACE_REGION,
    VITE_SPACE_NAME: process.env.VITE_SPACE_NAME,
    HAS_VITE_SPACES_KEY: !!process.env.VITE_SPACES_KEY,
    HAS_VITE_SPACES_SECRET: !!process.env.VITE_SPACES_SECRET,
    
    // Show which endpoint is being used
    CURRENT_ENDPOINT: `https://${process.env.SPACE_REGION}.digitaloceanspaces.com`
  };

  console.log('Current Environment Configuration:', envCheck);
  res.json(envCheck);
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../dist')));

// Handle React routing, return all requests to React app
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
