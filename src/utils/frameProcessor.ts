import { Feature, Point } from '../types/tracking';

export interface FeatureMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}

export class FrameProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastProcessTime: number = 0;
  private PROCESS_INTERVAL: number = 50;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  public async processImage(img: HTMLImageElement): Promise<Feature[]> {
    // Set canvas size to match image
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    
    // Draw image to canvas
    this.ctx.drawImage(img, 0, 0);
    
    try {
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      const points = this.detectFeatures(imageData, true); // true for detailed analysis
      
      // Generate descriptors for each point
      return points.map(point => ({
        pt: point,
        descriptor: new Float32Array(this.computeDescriptor(imageData, point))
      }));
    } catch (error) {
      console.error('Error processing image:', error);
      return [];
    }
  }

  private detectFeatures(imageData: ImageData, isTargetImage: boolean = false): Point[] {
    const { data, width, height } = imageData;
    const points: Point[] = [];
    const threshold = isTargetImage ? 3 : 10; // Even lower threshold for target image
    const gridSize = isTargetImage ? 3 : 6;   // Smaller grid for finer detection
    const maxPoints = isTargetImage ? 2000 : 500; // Increased max points
    
    // Divide image into smaller cells
    const cellsX = 10;  // More cells
    const cellsY = 10;
    const cellWidth = Math.floor(width / cellsX);
    const cellHeight = Math.floor(height / cellsY);
    const pointsPerCell = Math.floor(maxPoints / (cellsX * cellsY));
    
    // Convert to grayscale with higher precision
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // More sensitive grayscale conversion
        gray[y * width + x] = Math.round(
          0.299 * data[idx] + 
          0.587 * data[idx + 1] + 
          0.114 * data[idx + 2]
        );
      }
    }
    
    // Process each cell
    for (let cellY = 0; cellY < cellsY; cellY++) {
      for (let cellX = 0; cellX < cellsX; cellX++) {
        const cellPoints: Point[] = [];
        const startX = cellX * cellWidth;
        const startY = cellY * cellHeight;
        const endX = Math.min(startX + cellWidth, width - gridSize);
        const endY = Math.min(startY + cellHeight, height - gridSize);
        
        // Detect corners in this cell with smaller step size
        for (let y = startY + gridSize; y < endY - gridSize; y += 1) { // Step size of 1
          for (let x = startX + gridSize; x < endX - gridSize; x += 1) {
            // Compute gradients in a 3x3 window for faster processing
            let sumGradX = 0, sumGradY = 0;
            
            for (let wy = -1; wy <= 1; wy++) {
              for (let wx = -1; wx <= 1; wx++) {
                const idx = (y + wy) * width + (x + wx);
                const weight = 1 / (Math.abs(wx) + Math.abs(wy) + 1);
                if (wx < 0) sumGradX -= gray[idx] * weight;
                if (wx > 0) sumGradX += gray[idx] * weight;
                if (wy < 0) sumGradY -= gray[idx] * weight;
                if (wy > 0) sumGradY += gray[idx] * weight;
              }
            }
            
            // Corner score with gradient magnitude
            const cornerScore = Math.sqrt(sumGradX * sumGradX + sumGradY * sumGradY);
            
            if (cornerScore > threshold) {
              // Simplified non-maximum suppression with smaller window
              let isMax = true;
              for (let ny = -1; ny <= 1 && isMax; ny++) {
                for (let nx = -1; nx <= 1; nx++) {
                  if (nx === 0 && ny === 0) continue;
                  
                  const neighborX = x + nx;
                  const neighborY = y + ny;
                  
                  if (neighborX >= startX && neighborX < endX && 
                      neighborY >= startY && neighborY < endY) {
                    const neighborScore = this.getCornerScore(gray, width, neighborX, neighborY);
                    if (neighborScore > cornerScore) {
                      isMax = false;
                      break;
                    }
                  }
                }
              }
              
              if (isMax) {
                cellPoints.push({ x, y });
              }
            }
          }
        }
        
        // Sort cell points by corner score
        cellPoints.sort((a, b) => {
          const scoreA = this.getCornerScore(gray, width, a.x, a.y);
          const scoreB = this.getCornerScore(gray, width, b.x, b.y);
          return scoreB - scoreA;
        });
        
        // Add more points per cell
        points.push(...cellPoints.slice(0, Math.max(pointsPerCell, 20))); // Increased minimum points per cell
      }
    }
    
    // Final sort of all points by score
    return points.sort((a, b) => {
      const scoreA = this.getCornerScore(gray, width, a.x, a.y);
      const scoreB = this.getCornerScore(gray, width, b.x, b.y);
      return scoreB - scoreA;
    }).slice(0, maxPoints);
  }

  private getCornerScore(gray: Uint8Array, width: number, x: number, y: number): number {
    let gradX = 0, gradY = 0;
    
    // Smaller window for faster processing
    for (let wy = -1; wy <= 1; wy++) {
      for (let wx = -1; wx <= 1; wx++) {
        const idx = (y + wy) * width + (x + wx);
        const weight = 1 / (Math.abs(wx) + Math.abs(wy) + 1);
        if (wx < 0) gradX -= gray[idx] * weight;
        if (wx > 0) gradX += gray[idx] * weight;
        if (wy < 0) gradY -= gray[idx] * weight;
        if (wy > 0) gradY += gray[idx] * weight;
      }
    }
    
    return Math.sqrt(gradX * gradX + gradY * gradY);
  }

  private computeDescriptor(imageData: ImageData, point: Point): number[] {
    const { data, width, height } = imageData;
    const descriptor: number[] = [];
    const patchSize = 16; // Larger patch for better description
    const halfPatch = patchSize / 2;
    
    // Sample in a grid pattern around the point
    for (let dy = -halfPatch; dy < halfPatch; dy += 4) {
      for (let dx = -halfPatch; dx < halfPatch; dx += 4) {
        const x = Math.round(point.x + dx);
        const y = Math.round(point.y + dy);
        
        if (x < 0 || x >= width || y < 0 || y >= height) {
          descriptor.push(0);
          continue;
        }
        
        const idx = (y * width + x) * 4;
        const intensity = (
          0.299 * data[idx] + 
          0.587 * data[idx + 1] + 
          0.114 * data[idx + 2]
        ) / 255;
        
        descriptor.push(intensity);
      }
    }
    
    // Normalize descriptor
    const sum = descriptor.reduce((a, b) => a + b, 0);
    const mean = sum / descriptor.length;
    const normalized = descriptor.map(x => x - mean);
    
    return normalized;
  }

  public async processFrame(video: HTMLVideoElement): Promise<Point[]> {
    const now = Date.now();
    if (now - this.lastProcessTime < this.PROCESS_INTERVAL) {
      return [];
    }
    this.lastProcessTime = now;

    if (!video.videoWidth || !video.videoHeight) return [];

    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    this.ctx.drawImage(video, 0, 0);
    
    try {
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      return this.detectFeatures(imageData, false);
    } catch (error) {
      console.error('Error processing frame:', error);
      return [];
    }
  }
}
