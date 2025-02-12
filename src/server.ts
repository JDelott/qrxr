import pkg from 'pg';
const { Pool } = pkg;
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import sharp from 'sharp';

const app = express();
const port = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Basic status route
app.get('/api/status', (_req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Server is running'
  });
});

// Configure PostgreSQL connection
const pool = new Pool({
  user: 'jacobdelott',
  host: 'localhost',
  database: 'ar_tracking',
  password: '',  // Leave empty if no password was set
  port: 5432,
});

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

async function processImageForTracking(imagePath: string) {
  try {
    console.log('Processing image:', imagePath);
    
    // Load and process image with Sharp
    const image = sharp(imagePath);
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

app.post('/api/upload', upload.single('image'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    if (!req.file) {
      console.error('No file in request');
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    console.log('File received:', req.file);

    try {
      const trackingData = await processImageForTracking(req.file.path);
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
        req.file.filename,
        req.file.path,
        new Date(),
        true,
        JSON.stringify(trackingData)
      ];

      const result = await pool.query(query, values);
      console.log('Saved to database with ID:', result.rows[0].id);
      
      res.json({
        success: true,
        imageId: result.rows[0].id,
        filename: req.file.filename,
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

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
