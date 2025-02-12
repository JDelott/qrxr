export interface Point {
  x: number;
  y: number;
}

export interface FeatureMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}

export class FrameProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  public async processFrame(video: HTMLVideoElement): Promise<Point[]> {
    // Set canvas size to match video
    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;
    
    // Draw current frame to canvas
    this.ctx.drawImage(video, 0, 0);
    
    // Get image data for processing
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    // Convert to grayscale and detect edges
    return this.detectFeatures(imageData);
  }

  private detectFeatures(imageData: ImageData): Point[] {
    const { data, width, height } = imageData;
    const points: Point[] = [];
    const threshold = 30;
    
    // Simple edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Convert to grayscale
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Check surrounding pixels
        const top = (data[idx - width * 4] + data[idx - width * 4 + 1] + data[idx - width * 4 + 2]) / 3;
        const bottom = (data[idx + width * 4] + data[idx + width * 4 + 1] + data[idx + width * 4 + 2]) / 3;
        const left = (data[idx - 4] + data[idx - 3] + data[idx - 2]) / 3;
        const right = (data[idx + 4] + data[idx + 3] + data[idx + 2]) / 3;
        
        // If significant difference, mark as feature point
        if (Math.abs(gray - top) > threshold ||
            Math.abs(gray - bottom) > threshold ||
            Math.abs(gray - left) > threshold ||
            Math.abs(gray - right) > threshold) {
          points.push({ x, y });
        }
      }
    }
    
    return points;
  }
}
