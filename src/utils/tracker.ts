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
    const maxDistance = 10; // Maximum pixel distance for a match

    // Calculate scale factors
    const scaleX = frameWidth / this.targetWidth;
    const scaleY = frameHeight / this.targetHeight;

    // Simple nearest-neighbor matching with scale consideration
    framePoints.forEach((framePoint, queryIdx) => {
      let bestMatch = {
        trainIdx: -1,
        distance: Infinity
      };

      this.targetPoints.forEach((targetPoint, trainIdx) => {
        // Scale target point to frame dimensions
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

      if (bestMatch.trainIdx !== -1) {
        matches.push({
          queryIdx,
          trainIdx: bestMatch.trainIdx,
          distance: bestMatch.distance
        });
      }
    });

    return matches;
  }

  private getDistance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
