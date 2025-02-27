import { Feature, Point } from '../types/tracking';

export interface FeatureMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}

export interface FrameData {
  points: Point[];
  descriptors: Float32Array[];
}

interface CornerPoint extends Point {
  response: number;
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

  public async getFrameData(video: HTMLVideoElement): Promise<FrameData> {
    if (!video.videoWidth || !video.videoHeight) {
      return { points: [], descriptors: [] };
    }

    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    this.ctx.drawImage(video, 0, 0);
    
    try {
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      // Apply image preprocessing to enhance features
      const processedImageData = this.preprocessImage(imageData);
      
      // Detect features with emphasis on color boundaries
      const points = this.detectFeaturesEnhanced(processedImageData, 1000);
      
      // Generate richer descriptors
      const features = points.map(point => {
        const descriptor = this.computeEnhancedDescriptor(processedImageData, point);
        return {
          pt: point,
          descriptor: new Float32Array(descriptor)
        };
      });
      
      return {
        points: features.map(f => f.pt),
        descriptors: features.map(f => f.descriptor)
      };
    } catch (error) {
      console.error('Error getting frame data:', error);
      return { points: [], descriptors: [] };
    }
  }

  private preprocessImage(imageData: ImageData): ImageData {
    const data = new Uint8ClampedArray(imageData.data);
    const width = imageData.width;
    const height = imageData.height;
    
    // Apply contrast enhancement
    for (let i = 0; i < data.length; i += 4) {
      // Enhance contrast
      data[i] = this.adjustContrast(data[i], 1.2);      // R
      data[i + 1] = this.adjustContrast(data[i + 1], 1.2); // G
      data[i + 2] = this.adjustContrast(data[i + 2], 1.2); // B
      
      // Slightly sharpen edges by emphasizing color differences
      if (i > width * 4 && i % 4 === 0) {
        const prevPixelR = data[i - 4];
        const prevPixelG = data[i - 3];
        const prevPixelB = data[i - 2];
        
        const colorDiff = Math.abs(data[i] - prevPixelR) + 
                         Math.abs(data[i + 1] - prevPixelG) + 
                         Math.abs(data[i + 2] - prevPixelB);
        
        if (colorDiff > 30) { // If significant color change
          data[i] = Math.min(255, data[i] * 1.1);
          data[i + 1] = Math.min(255, data[i + 1] * 1.1);
          data[i + 2] = Math.min(255, data[i + 2] * 1.1);
        }
      }
    }
    
    // Create new ImageData from the processed data
    return new ImageData(data, width, height);
  }
  
  private adjustContrast(value: number, factor: number): number {
    return Math.min(255, Math.max(0, 128 + (value - 128) * factor));
  }

  private detectFeatures(imageData: ImageData, detailed: boolean = false, maxPoints: number = 500): Point[] {
    const { data, width, height } = imageData;
    const points: CornerPoint[] = [];
    const threshold = detailed ? 3 : 10; // Even lower threshold for target image
    const gridSize = detailed ? 3 : 6;   // Smaller grid for finer detection
    
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
        const cellPoints: CornerPoint[] = [];
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
                cellPoints.push({ x, y, response: cornerScore });
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
    
    // Sort by response and take the top N strongest points
    const sortedCorners = points.sort((a, b) => b.response - a.response);
    return sortedCorners.slice(0, maxPoints).map(corner => ({ 
      x: corner.x, 
      y: corner.y
    }));
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
      const points = this.detectFeatures(imageData, false);
      
      // Generate descriptors for each point
      const features = points.map(point => ({
        pt: point,
        descriptor: new Float32Array(this.computeDescriptor(imageData, point))
      }));
      
      return features.map(f => f.pt);
    } catch (error) {
      console.error('Error processing frame:', error);
      return [];
    }
  }

  private detectFeaturesEnhanced(imageData: ImageData, maxPoints: number = 500): Point[] {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    // Harris corner detection with color info for cartoon images
    const corners: CornerPoint[] = [];
    const blockSize = 5;
    const threshold = 20000;
    
    for (let y = blockSize; y < height - blockSize; y++) {
      for (let x = blockSize; x < width - blockSize; x++) {
        // Calculate gradients with color channels weighted for cartoon images
        let Ixx = 0, Iyy = 0, Ixy = 0;
        
        for (let j = -blockSize; j <= blockSize; j++) {
          for (let i = -blockSize; i <= blockSize; i++) {
            const idx = ((y + j) * width + (x + i)) * 4;
            
            // Weight red and blue channels higher for cartoon images
            const r = data[idx] * 0.5;
            const g = data[idx + 1] * 0.3;
            const b = data[idx + 2] * 0.5;
            
            // Simple weighted gradient
            const dx = r + g + b - (data[idx + 4] * 0.5 + data[idx + 5] * 0.3 + data[idx + 6] * 0.5);
            const dy = r + g + b - (data[idx + width * 4] * 0.5 + data[idx + width * 4 + 1] * 0.3 + data[idx + width * 4 + 2] * 0.5);
            
            Ixx += dx * dx;
            Iyy += dy * dy;
            Ixy += dx * dy;
          }
        }
        
        // Harris corner response: det(M) - k * trace(M)^2
        const k = 0.04;
        const det = Ixx * Iyy - Ixy * Ixy;
        const trace = Ixx + Iyy;
        const response = det - k * trace * trace;
        
        if (response > threshold) {
          // Check if this is a local maximum
          let isMax = true;
          
          for (let j = -1; j <= 1 && isMax; j++) {
            for (let i = -1; i <= 1 && isMax; i++) {
              if (i === 0 && j === 0) continue;
              
              const nidx = ((y + j) * width + (x + i)) * 4;
              const nr = data[nidx] * 0.5;
              const ng = data[nidx + 1] * 0.3;
              const nb = data[nidx + 2] * 0.5;
              const nval = nr + ng + nb;
              
              const cidx = (y * width + x) * 4;
              const cr = data[cidx] * 0.5;
              const cg = data[cidx + 1] * 0.3;
              const cb = data[cidx + 2] * 0.5;
              const cval = cr + cg + cb;
              
              if (nval > cval) isMax = false;
            }
          }
          
          if (isMax) {
            corners.push({ x, y, response });
          }
        }
      }
    }
    
    // Sort by response and take the top N strongest points
    const sortedCorners = corners.sort((a, b) => b.response - a.response);
    return sortedCorners.slice(0, maxPoints).map(corner => ({
      x: corner.x,
      y: corner.y
    }));
  }
  
  private computeEnhancedDescriptor(imageData: ImageData, point: Point): number[] {
    const { width, height, data } = imageData;
    const patchSize = 16;
    const halfSize = patchSize / 2;
    const descriptor: number[] = [];
    
    // Check if the point is too close to the edge
    const x = Math.min(Math.max(point.x, halfSize), width - halfSize - 1);
    const y = Math.min(Math.max(point.y, halfSize), height - halfSize - 1);
    
    // Extract larger patch around the point
    for (let j = -halfSize; j < halfSize; j += 4) {
      for (let i = -halfSize; i < halfSize; i += 4) {
        const px = Math.round(x + i);
        const py = Math.round(y + j);
        
        // Get color channels at this point
        const idx = (py * width + px) * 4;
        const r = data[idx] / 255;
        const g = data[idx + 1] / 255;
        const b = data[idx + 2] / 255;
        
        // Add color information to descriptor
        descriptor.push(r, g, b);
        
        // Add simple gradient information
        if (px < width - 1 && py < height - 1) {
          const hDiff = (data[idx + 4] - data[idx]) / 255;
          const vDiff = (data[idx + width * 4] - data[idx]) / 255;
          descriptor.push(hDiff, vDiff);
        } else {
          descriptor.push(0, 0);
        }
      }
    }
    
    // Add histogram of oriented gradients features
    const gradBins = 8;
    const gradHist = new Array(gradBins).fill(0);
    
    for (let j = -halfSize; j < halfSize; j++) {
      for (let i = -halfSize; i < halfSize; i++) {
        const px = Math.round(x + i);
        const py = Math.round(y + j);
        
        if (px < 1 || px >= width - 1 || py < 1 || py >= height - 1) continue;
        
        const idx = (py * width + px) * 4;
        
        // Calculate gradient
        const dx = data[idx + 4] - data[idx - 4] + 
                   data[idx + 5] - data[idx - 3] + 
                   data[idx + 6] - data[idx - 2];
        
        const dy = data[idx + width * 4] - data[idx - width * 4] + 
                   data[idx + width * 4 + 1] - data[idx - width * 4 + 1] + 
                   data[idx + width * 4 + 2] - data[idx - width * 4 + 2];
        
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        const bin = Math.floor(angle * gradBins) % gradBins;
        
        gradHist[bin] += magnitude;
      }
    }
    
    // Normalize the histogram
    const histSum = gradHist.reduce((sum, val) => sum + val, 0);
    if (histSum > 0) {
      for (let i = 0; i < gradBins; i++) {
        gradHist[i] /= histSum;
        descriptor.push(gradHist[i]);
      }
    } else {
      descriptor.push(...new Array(gradBins).fill(0));
    }
    
    return descriptor;
  }
}
