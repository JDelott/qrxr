import { Point, FeatureMatch } from '../types/tracking';

export class ImageTracker {
  private targetPoints: Point[];
  private targetWidth: number;
  private targetHeight: number;

  constructor(trackingData: { points: { pt: { x: number, y: number } }[], width: number, height: number }) {
    this.targetPoints = trackingData.points.map((p) => ({
      x: p.pt.x,
      y: p.pt.y
    }));
    this.targetWidth = trackingData.width;
    this.targetHeight = trackingData.height;
  }

  public matchFeatures(framePoints: Point[], frameWidth: number, frameHeight: number): FeatureMatch[] {
    const matches: FeatureMatch[] = [];
    const maxDistance = 15; // Original strict threshold
    const minMatchRatio = 0.15; // Original ratio - require 15% of points to match

    // Calculate scale factors
    const scaleX = frameWidth / this.targetWidth;
    const scaleY = frameHeight / this.targetHeight;

    // Track matched points to prevent duplicates
    const usedFramePoints = new Set<number>();
    const usedTargetPoints = new Set<number>();

    // First pass: Find best matches with strict distance threshold
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

    // Only return matches if we have enough of them
    const minMatches = Math.max(
      3, // Original minimum of 3 matches required
      Math.floor(this.targetPoints.length * minMatchRatio)
    );

    return matches.length >= minMatches ? matches : [];
  }

  private getDistance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
