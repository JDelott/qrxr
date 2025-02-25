import { Point, FeatureMatch, TrackingConfidence } from '../types/tracking';

export class ImageTracker {
  private targetPoints: Point[];
  private targetWidth: number;
  private targetHeight: number;
  private consecutiveGoodFrames: number = 0;
  private readonly requiredConsecutiveFrames: number = 8; // Reduced from 20 to 8
  private trackingConfidence: TrackingConfidence = TrackingConfidence.None;

  constructor(trackingData: { points: { pt: { x: number, y: number } }[], width: number, height: number }) {
    this.targetPoints = trackingData.points.map((p) => ({
      x: p.pt.x,
      y: p.pt.y
    }));
    this.targetWidth = trackingData.width;
    this.targetHeight = trackingData.height;
    console.log('ImageTracker initialized with:', {
      points: this.targetPoints.length,
      width: this.targetWidth,
      height: this.targetHeight
    });
  }

  public matchFeatures(framePoints: Point[], frameWidth: number, frameHeight: number): FeatureMatch[] {
    const matches: FeatureMatch[] = [];
    const maxDistance = 60; // Increased from 50 to 60
    const minMatchRatio = 0.08; // Reduced from 0.15 to 0.08

    // Log incoming frame data
    if (Math.random() < 0.05) {
      console.log('Processing frame:', {
        framePoints: framePoints.length,
        frameWidth,
        frameHeight
      });
    }

    // Skip processing if we don't have enough frame points
    if (framePoints.length < 5) { // Reduced from 10 to 5
      console.log('Not enough frame points to process');
      this.consecutiveGoodFrames = 0;
      this.trackingConfidence = TrackingConfidence.None;
      return [];
    }

    // Calculate scale factors
    const scaleX = frameWidth / this.targetWidth;
    const scaleY = frameHeight / this.targetHeight;
    const avgScale = (scaleX + scaleY) / 2;
    const scaleThreshold = 0.65; // Increased from 0.5 to 0.65

    // Skip if scales are too different
    if (Math.abs(scaleX - scaleY) > avgScale * scaleThreshold) {
      console.log('Scale difference too large:', {
        scaleX,
        scaleY,
        avgScale,
        threshold: avgScale * scaleThreshold
      });
      this.consecutiveGoodFrames = 0;
      this.trackingConfidence = TrackingConfidence.None;
      return [];
    }

    // Track matched points to prevent duplicates
    const usedFramePoints = new Set<number>();
    const usedTargetPoints = new Set<number>();

    // Find best matches
    framePoints.forEach((framePoint, queryIdx) => {
      let bestMatch = {
        trainIdx: -1,
        distance: Infinity
      };

      this.targetPoints.forEach((targetPoint, trainIdx) => {
        if (usedTargetPoints.has(trainIdx)) return;

        const scaledTargetPoint = {
          x: targetPoint.x * scaleX,
          y: targetPoint.y * scaleY
        };

        const distance = this.getDistance(framePoint, scaledTargetPoint);
        if (distance < bestMatch.distance && distance < maxDistance) {
          bestMatch = {
            trainIdx,
            distance
          };
        }
      });

      if (bestMatch.trainIdx !== -1 && !usedFramePoints.has(queryIdx)) {
        matches.push({
          queryIdx,
          trainIdx: bestMatch.trainIdx,
          distance: bestMatch.distance
        });
        usedFramePoints.add(queryIdx);
        usedTargetPoints.add(bestMatch.trainIdx);
      }
    });

    // Calculate match quality based on average distance
    const avgDistance = matches.length > 0 
      ? matches.reduce((sum, m) => sum + m.distance, 0) / matches.length 
      : Infinity;
    
    // Require minimum matches with good quality
    const minMatches = Math.max(
      6, // Reduced from 10 to 6
      Math.floor(this.targetPoints.length * minMatchRatio)
    );

    // Less strict spatial distribution check
    const hasGoodDistribution = this.checkSpatialDistribution(
      matches.map(m => framePoints[m.queryIdx])
    );

    const hasEnoughMatches = matches.length >= minMatches;
    const hasGoodQuality = avgDistance < maxDistance * 0.7; // Increased from 0.6 to 0.7
    
    // Update tracking confidence based on consecutive good frames
    if (hasEnoughMatches && hasGoodQuality && hasGoodDistribution) {
      this.consecutiveGoodFrames++;
      if (this.consecutiveGoodFrames >= this.requiredConsecutiveFrames) {
        this.trackingConfidence = TrackingConfidence.High;
      } else if (this.consecutiveGoodFrames >= this.requiredConsecutiveFrames / 2) {
        this.trackingConfidence = TrackingConfidence.Medium;
      } else {
        this.trackingConfidence = TrackingConfidence.Low;
      }
    } else {
      // Reset counter if we don't have good matches
      this.consecutiveGoodFrames = 0;
      this.trackingConfidence = TrackingConfidence.None;
    }
    
    // Log tracking confidence every few frames
    if (Math.random() < 0.1) {
      console.log('Tracking confidence:', {
        level: TrackingConfidence[this.trackingConfidence],
        consecutiveFrames: this.consecutiveGoodFrames,
        required: this.requiredConsecutiveFrames,
        matches: matches.length,
        minRequired: minMatches,
        avgDistance: avgDistance.toFixed(2),
        hasGoodDistribution
      });
    }

    // Only return matches if we have high confidence
    return this.trackingConfidence === TrackingConfidence.High ? matches : [];
  }

  // Check that matches are well distributed across the image
  private checkSpatialDistribution(points: Point[]): boolean {
    if (points.length < 5) return false; // Reduced from 8 to 5
    
    // Find bounding box of matched points
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    points.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    
    // Calculate area of bounding box
    const area = (maxX - minX) * (maxY - minY);
    
    // Less demanding minimum size
    return area > 5000; // Reduced from 10000 to 5000 (about 70x70 pixels)
  }

  private getDistance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // Add a method to check if we have strong tracking
  public hasStrongTracking(): boolean {
    return this.trackingConfidence === TrackingConfidence.High;
  }
}
