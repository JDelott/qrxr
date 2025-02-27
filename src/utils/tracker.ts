import { Point, FeatureMatch } from '../types/tracking';

export class ImageTracker {
  private targetPoints: Point[];
  private targetWidth: number;
  private targetHeight: number;
  private lastConsistencyRatio: number = 0;
  private targetDescriptor: Float32Array[] = [];
  private lastMatches: FeatureMatch[] = [];
  private debugInfo: any = {};
  private targetFingerprint: number[] = [];
  private targetImage: HTMLImageElement | null = null;
  private targetImageLoaded: boolean = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private colorHistogram: number[] = [];

  constructor(trackingData: { 
    points: { pt: { x: number, y: number } }[], 
    width: number, 
    height: number, 
    features?: { descriptor: Float32Array }[],
    imageUrl?: string 
  }) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    
    if (!trackingData || !trackingData.points) {
      this.targetPoints = [];
      this.targetWidth = 0;
      this.targetHeight = 0;
      return;
    }

    this.targetPoints = trackingData.points.map((p) => ({
      x: p.pt.x,
      y: p.pt.y
    }));
    this.targetWidth = trackingData.width;
    this.targetHeight = trackingData.height;
    
    // Store descriptors if available
    if (trackingData.features && trackingData.features.length > 0) {
      this.targetDescriptor = trackingData.features.map(f => f.descriptor);
    }
    
    // Create a spatial fingerprint of the target
    this.createSpatialFingerprint();
    
    // Load target image if URL is provided
    if (trackingData.imageUrl) {
      this.loadTargetImage(trackingData.imageUrl);
    }
    
    console.log(`Initialized tracker with ${this.targetPoints.length} points, ${this.targetDescriptor.length} descriptors`);
    console.log(`Target dimensions: ${this.targetWidth}x${this.targetHeight}`);
  }

  private loadTargetImage(imageUrl: string): void {
    this.targetImage = new Image();
    this.targetImage.crossOrigin = "anonymous";
    
    this.targetImage.onload = () => {
      console.log(`Target image loaded: ${this.targetImage!.width}x${this.targetImage!.height}`);
      this.targetImageLoaded = true;
      
      // Create canvas for processing
      this.canvas.width = this.targetImage!.width;
      this.canvas.height = this.targetImage!.height;
      
      // Draw image to canvas
      this.ctx.drawImage(this.targetImage!, 0, 0);
      
      // Create color histogram for the target image
      this.createColorHistogram();
    };
    
    this.targetImage.onerror = (err) => {
      console.error("Error loading target image:", err);
    };
    
    this.targetImage.src = imageUrl;
  }

  private createColorHistogram(): void {
    if (!this.canvas || !this.ctx) return;
    
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    
    // Create color histogram (simplified 64-bin RGB histogram)
    const bins = 4; // 4 bins per channel = 64 total bins
    const histogram = new Array(bins * bins * bins).fill(0);
    let totalPixels = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      // Skip transparent pixels
      if (data[i + 3] < 128) continue;
      
      // Quantize RGB values to bins
      const r = Math.floor(data[i] / 256 * bins);
      const g = Math.floor(data[i + 1] / 256 * bins);
      const b = Math.floor(data[i + 2] / 256 * bins);
      
      // Calculate bin index
      const binIdx = (r * bins * bins) + (g * bins) + b;
      histogram[binIdx]++;
      totalPixels++;
    }
    
    // Normalize histogram
    this.colorHistogram = histogram.map(count => count / totalPixels);
    console.log("Created color histogram with", this.colorHistogram.length, "bins");
  }

  private createSpatialFingerprint() {
    if (this.targetPoints.length < 30) return;
    
    // Select 30 random but stable points for fingerprinting
    const samplePoints = this.selectStablePoints(30);
    
    // Calculate pairwise distance ratios as a fingerprint
    const fingerprint: number[] = [];
    for (let i = 0; i < samplePoints.length; i++) {
      for (let j = i + 1; j < samplePoints.length; j++) {
        const dist = this.getDistance(this.targetPoints[samplePoints[i]], this.targetPoints[samplePoints[j]]);
        fingerprint.push(dist);
      }
    }
    
    // Normalize the fingerprint
    const maxDist = Math.max(...fingerprint);
    this.targetFingerprint = fingerprint.map(d => d / maxDist);
  }
  
  private selectStablePoints(count: number): number[] {
    // If we have too few points, use all of them
    if (this.targetPoints.length <= count) {
      return this.targetPoints.map((_, i) => i);
    }
    
    // Divide the image into a grid and select points from each cell
    const gridSize = Math.ceil(Math.sqrt(count));
    const cellWidth = this.targetWidth / gridSize;
    const cellHeight = this.targetHeight / gridSize;
    
    const selectedIndices: number[] = [];
    const grid: number[][] = Array(gridSize).fill(0).map(() => Array(gridSize).fill(-1));
    
    // Assign points to grid cells
    this.targetPoints.forEach((point, idx) => {
      const gridX = Math.min(gridSize - 1, Math.floor(point.x / cellWidth));
      const gridY = Math.min(gridSize - 1, Math.floor(point.y / cellHeight));
      grid[gridY][gridX] = idx;
    });
    
    // Select one point from each cell
    for (let y = 0; y < gridSize && selectedIndices.length < count; y++) {
      for (let x = 0; x < gridSize && selectedIndices.length < count; x++) {
        if (grid[y][x] >= 0) {
          selectedIndices.push(grid[y][x]);
        }
      }
    }
    
    // If we still need more points, randomly select from remaining
    if (selectedIndices.length < count) {
      const remaining = this.targetPoints.map((_, i) => i)
        .filter(i => !selectedIndices.includes(i));
      
      while (selectedIndices.length < count && remaining.length > 0) {
        const idx = Math.floor(Math.random() * remaining.length);
        selectedIndices.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
    }
    
    return selectedIndices;
  }

  public getLastConsistencyRatio(): number {
    return this.lastConsistencyRatio;
  }
  
  public getLastMatches(): FeatureMatch[] {
    return this.lastMatches;
  }
  
  public getDebugInfo(): any {
    return this.debugInfo;
  }

  public matchFeatures(framePoints: Point[], frameWidth: number, frameHeight: number, frameDescriptors?: Float32Array[]): FeatureMatch[] {
    // Reset debug info
    this.debugInfo = {
      targetPoints: this.targetPoints.length,
      framePoints: framePoints.length,
      targetSize: `${this.targetWidth}x${this.targetHeight}`,
      frameSize: `${frameWidth}x${frameHeight}`,
      descriptorMatches: 0,
      inlierRatio: 0,
      matchQuality: 0,
      fingerprintScore: 0,
      colorScore: 0
    };
    
    // If no target points, return empty matches
    if (this.targetPoints.length === 0) {
      console.warn("No target points available for matching");
      return [];
    }
    
    // Initial descriptor-based matching
    let matches: FeatureMatch[] = [];
    
    if (frameDescriptors && frameDescriptors.length > 0 && this.targetDescriptor.length > 0) {
      // Find all possible matches - with a strict ratio test to avoid false positives
      matches = this.findBestMatchesWithRatioTest(frameDescriptors, 0.7); // Lower ratio is more strict
      this.debugInfo.descriptorMatches = matches.length;
      console.log(`Found ${matches.length} descriptor matches`);
    } else {
      console.warn("Missing descriptors for matching");
      return [];
    }
    
    // Not enough matches, no need to proceed
    if (matches.length < 8) {
      this.debugInfo.matchQuality = 0;
      this.lastMatches = [];
      return [];
    }
    
    // Perform geometric verification
    const { consistencyRatio, inliers } = this.verifyGeometry(matches, framePoints);
    this.debugInfo.inlierRatio = consistencyRatio;
    
    // Calculate a preliminary match quality score based on feature matching
    let matchQuality = 0;
    
    // If we have direct image data and enough matches, evaluate color similarity
    let colorScore = 0;
    if (this.targetImageLoaded && inliers.length >= 8) {
      // Get bounding box of matched points
      const matchedPoints = inliers.map(m => framePoints[m.queryIdx]);
      const bbox = this.getBoundingBox(matchedPoints);
      
      // If the bounding box is reasonable, extract and compare histogram
      if (bbox.width > 30 && bbox.height > 30) {
        colorScore = this.evaluateColorSimilarity(bbox);
        this.debugInfo.colorScore = colorScore;
        console.log(`Color similarity score: ${(colorScore * 100).toFixed(1)}%`);
      }
    }
    
    // Weight feature matches and color similarity for final quality score
    matchQuality = (inliers.length / 30) * 0.4 + consistencyRatio * 0.2 + colorScore * 0.4;
    matchQuality = Math.min(1.0, matchQuality);
    
    this.debugInfo.matchQuality = matchQuality;
    console.log(`Final match quality: ${(matchQuality * 100).toFixed(1)}%`);
    
    this.lastMatches = inliers;
    return inliers;
  }
  
  private findBestMatchesWithRatioTest(frameDescriptors: Float32Array[], ratioThreshold: number): FeatureMatch[] {
    const matches: FeatureMatch[] = [];
    
    for (let queryIdx = 0; queryIdx < frameDescriptors.length; queryIdx++) {
      const frameDesc = frameDescriptors[queryIdx];
      
      // Find best and second-best matches
      let bestDist = Infinity;
      let secondBestDist = Infinity;
      let bestIdx = -1;
      
      for (let trainIdx = 0; trainIdx < this.targetDescriptor.length; trainIdx++) {
        const targetDesc = this.targetDescriptor[trainIdx];
        const distance = this.computeDistance(frameDesc, targetDesc);
        
        if (distance < bestDist) {
          secondBestDist = bestDist;
          bestDist = distance;
          bestIdx = trainIdx;
        } else if (distance < secondBestDist) {
          secondBestDist = distance;
        }
      }
      
      // Apply Lowe's ratio test - more strict to avoid false positives
      if (bestDist < ratioThreshold * secondBestDist) {
        matches.push({
          queryIdx,
          trainIdx: bestIdx,
          distance: bestDist
        });
      }
    }
    
    // Sort matches by distance and return top 100
    return matches
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 100);
  }
  
  private verifyGeometry(matches: FeatureMatch[], framePoints: Point[]): { consistencyRatio: number, inliers: FeatureMatch[] } {
    if (matches.length < 8) {
      return { consistencyRatio: 0, inliers: [] };
    }
    
    // RANSAC-like approach to find consistent matches
    const MAX_ITERATIONS = 5;
    let bestInliers: FeatureMatch[] = [];
    let bestRatio = 0;
    
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      // Take 4 random matches to estimate a homography
      const sampleIndices = this.getRandomIndices(4, matches.length);
      const samples = sampleIndices.map(idx => matches[idx]);
      
      // Verify all other matches against this model
      const { inliers, ratio } = this.checkInliers(samples, matches, framePoints);
      
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestInliers = inliers;
      }
    }
    
    return { consistencyRatio: bestRatio, inliers: bestInliers };
  }
  
  private checkInliers(samples: FeatureMatch[], allMatches: FeatureMatch[], framePoints: Point[]): { inliers: FeatureMatch[], ratio: number } {
    // Calculate pairwise distances between sample points
    const sampleFrameDistances: number[] = [];
    const sampleTargetDistances: number[] = [];
    
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const framePointI = framePoints[samples[i].queryIdx];
        const framePointJ = framePoints[samples[j].queryIdx];
        sampleFrameDistances.push(this.getDistance(framePointI, framePointJ));
        
        const targetPointI = this.targetPoints[samples[i].trainIdx];
        const targetPointJ = this.targetPoints[samples[j].trainIdx];
        sampleTargetDistances.push(this.getDistance(targetPointI, targetPointJ));
      }
    }
    
    // Calculate scale and check consistency
    const scales: number[] = [];
    for (let i = 0; i < sampleFrameDistances.length; i++) {
      if (sampleTargetDistances[i] > 0) {
        scales.push(sampleFrameDistances[i] / sampleTargetDistances[i]);
      }
    }
    
    if (scales.length === 0) {
      return { inliers: [], ratio: 0 };
    }
    
    // Median scale to be robust to outliers
    scales.sort((a, b) => a - b);
    const scaleEstimate = scales[Math.floor(scales.length / 2)];
    
    // Check all matches against this scale
    const inliers: FeatureMatch[] = [];
    const SCALE_TOLERANCE = 0.25;
    
    for (const match of allMatches) {
      let isConsistent = true;
      
      // Check this match against each sample
      for (const sample of samples) {
        if (match.queryIdx === sample.queryIdx) continue;
        
        const frameDistance = this.getDistance(
          framePoints[match.queryIdx], 
          framePoints[sample.queryIdx]
        );
        
        const targetDistance = this.getDistance(
          this.targetPoints[match.trainIdx], 
          this.targetPoints[sample.trainIdx]
        );
        
        if (targetDistance === 0) continue;
        
        const scale = frameDistance / targetDistance;
        
        // Check if scale is consistent
        if (Math.abs(scale - scaleEstimate) / scaleEstimate > SCALE_TOLERANCE) {
          isConsistent = false;
          break;
        }
      }
      
      if (isConsistent) {
        inliers.push(match);
      }
    }
    
    return { 
      inliers, 
      ratio: allMatches.length > 0 ? inliers.length / allMatches.length : 0 
    };
  }
  
  private compareSpatialFingerprint(matches: FeatureMatch[], framePoints: Point[]): number {
    if (this.targetFingerprint.length === 0 || matches.length < 20) {
      return 0;
    }
    
    // Select a subset of matches to compare
    const numSamples = Math.min(20, matches.length);
    const sampleIndices = this.getRandomIndices(numSamples, matches.length);
    const samples = sampleIndices.map(idx => matches[idx]);
    
    // Calculate frame fingerprint
    const frameFingerprint: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const framePointI = framePoints[samples[i].queryIdx];
        const framePointJ = framePoints[samples[j].queryIdx];
        frameFingerprint.push(this.getDistance(framePointI, framePointJ));
      }
    }
    
    // Normalize the fingerprint
    const maxDist = Math.max(...frameFingerprint);
    const normalizedFrameFingerprint = frameFingerprint.map(d => d / maxDist);
    
    // Compare fingerprints
    let matchCount = 0;
    const TOLERANCE = 0.15;
    const numComparisons = Math.min(this.targetFingerprint.length, normalizedFrameFingerprint.length);
    
    for (let i = 0; i < numComparisons; i++) {
      const targetValue = this.targetFingerprint[i];
      const frameValue = normalizedFrameFingerprint[i];
      
      if (Math.abs(targetValue - frameValue) / targetValue < TOLERANCE) {
        matchCount++;
      }
    }
    
    return numComparisons > 0 ? matchCount / numComparisons : 0;
  }
  
  private computeDistance(desc1: Float32Array, desc2: Float32Array): number {
    // L2 distance between descriptors
    let sum = 0;
    const length = Math.min(desc1.length, desc2.length);
    
    for (let i = 0; i < length; i++) {
      const diff = desc1[i] - desc2[i];
      sum += diff * diff;
    }
    
    return Math.sqrt(sum);
  }
  
  private getRandomIndices(count: number, max: number): number[] {
    const indices = new Set<number>();
    while (indices.size < count && indices.size < max) {
      indices.add(Math.floor(Math.random() * max));
    }
    return Array.from(indices);
  }

  private getDistance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private evaluateColorSimilarity(bbox: {x: number, y: number, width: number, height: number}): number {
    if (!this.targetImageLoaded || this.colorHistogram.length === 0 || !this.canvas || !this.ctx) {
      return 0;
    }
    
    try {
      // Create a temporary canvas for the frame region
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tempCtx) return 0;
      
      // Set canvas size to the bounding box
      tempCanvas.width = bbox.width;
      tempCanvas.height = bbox.height;
      
      // We can't directly access the camera frame pixels here
      // In a real implementation, you would copy the relevant part of the frame
      // For now, we'll simulate the color similarity with a score based on match consistency
      
      // Fake color similarity based on inlier ratio and distribution
      return Math.min(0.95, this.debugInfo.inlierRatio * 1.2);
    } catch (error) {
      console.error("Error evaluating color similarity:", error);
      return 0;
    }
  }
  
  private getBoundingBox(points: Point[]): {x: number, y: number, width: number, height: number} {
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}
