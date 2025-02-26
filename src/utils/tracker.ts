import { Point, FeatureMatch } from '../types/tracking';

export class ImageTracker {
  private targetPoints: Point[];
  private targetWidth: number;
  private targetHeight: number;
  private lastConsistencyRatio: number = 0;
  private targetDescriptor: Float32Array[] = []; // Store target descriptors

  constructor(trackingData: { points: { pt: { x: number, y: number } }[], width: number, height: number, features?: { descriptor: Float32Array }[] }) {
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
  }

  public getLastConsistencyRatio(): number {
    return this.lastConsistencyRatio;
  }

  public matchFeatures(framePoints: Point[], frameWidth: number, frameHeight: number, frameDescriptors?: Float32Array[]): FeatureMatch[] {
    // If no target points, return empty matches
    if (this.targetPoints.length === 0) {
      console.warn("No target points available for matching");
      return [];
    }
    
    // Try a range of scales for matching
    const scaleOptions = [
      { x: frameWidth / this.targetWidth, y: frameHeight / this.targetHeight },
      { x: frameWidth / this.targetWidth * 0.8, y: frameHeight / this.targetHeight * 0.8 },
      { x: frameWidth / this.targetWidth * 1.2, y: frameHeight / this.targetHeight * 1.2 },
    ];
    
    let bestMatches: FeatureMatch[] = [];
    let bestConsistency = 0;
    
    for (const scale of scaleOptions) {
      const matches = this.matchWithScale(framePoints, scale.x, scale.y);
      
      // Calculate consistency
      const consistency = this.calculateMatchConsistency(matches, framePoints);
      
      // Select the scale that gives the most consistent matches
      if (consistency > bestConsistency && matches.length >= 8) {
        bestMatches = matches;
        bestConsistency = consistency;
      } else if (bestConsistency === 0 && matches.length > bestMatches.length) {
        // Fallback to match count if no consistent matches found yet
        bestMatches = matches;
      }
    }
    
    // Calculate consistency for the best matches
    this.calculateConsistency(bestMatches, framePoints, frameWidth, frameHeight);
    
    // Apply strict geometric verification
    bestMatches = this.geometricVerification(bestMatches, framePoints);
    
    return bestMatches;
  }
  
  private matchWithScale(framePoints: Point[], scaleX: number, scaleY: number): FeatureMatch[] {
    const matches: FeatureMatch[] = [];
    const maxDistance = 25; // More restrictive distance threshold
    
    // For each frame point, find the closest target point
    framePoints.forEach((framePoint, queryIdx) => {
      let bestMatch = {
        trainIdx: -1,
        distance: Infinity
      };
      
      this.targetPoints.forEach((targetPoint, trainIdx) => {
        // Scale target point to match frame coordinates
        const scaledX = targetPoint.x * scaleX;
        const scaledY = targetPoint.y * scaleY;
        
        // Calculate distance
        const dx = framePoint.x - scaledX;
        const dy = framePoint.y - scaledY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Update best match if this is better
        if (distance < bestMatch.distance && distance < maxDistance) {
          bestMatch = {
            trainIdx,
            distance
          };
        }
      });
      
      // If we found a match, add it
      if (bestMatch.trainIdx !== -1) {
        matches.push({
          queryIdx,
          trainIdx: bestMatch.trainIdx,
          distance: bestMatch.distance
        });
      }
    });
    
    // Apply stricter filtering
    if (matches.length > 10) {
      matches.sort((a, b) => a.distance - b.distance);
      
      // Only take the top 40% of matches - these are more likely to be good
      const goodMatches = matches.slice(0, Math.floor(matches.length * 0.4));
      
      return goodMatches;
    }
    
    // Sort matches by distance (best matches first)
    return matches.sort((a, b) => a.distance - b.distance);
  }

  private calculateMatchConsistency(matches: FeatureMatch[], framePoints: Point[]): number {
    if (matches.length < 8) return 0;
    
    const totalPairs = Math.min(matches.length * (matches.length - 1) / 2, 100);
    if (totalPairs === 0) return 0;
    
    const consistentPairs = this.countConsistentPairs(
      matches, 
      framePoints, 
      0.7, 1.3 // Narrower range for ratio acceptance
    );
    
    return consistentPairs / totalPairs;
  }

  private countConsistentPairs(
    matches: FeatureMatch[],
    framePoints: Point[],
    minRatio: number,
    maxRatio: number
  ): number {
    let consistentPairs = 0;
    let totalPairs = 0;
    
    for (let i = 0; i < matches.length; i++) {
      const matchI = matches[i];
      const framePointI = framePoints[matchI.queryIdx];
      const targetPointI = this.targetPoints[matchI.trainIdx];
      
      for (let j = i + 1; j < matches.length && totalPairs < 100; j++) {
        const matchJ = matches[j];
        const framePointJ = framePoints[matchJ.queryIdx];
        const targetPointJ = this.targetPoints[matchJ.trainIdx];
        
        // Skip pairs that are too close to each other
        const frameDistance = this.getDistance(framePointI, framePointJ);
        const targetDistance = this.getDistance(targetPointI, targetPointJ);
        
        if (frameDistance < 10 || targetDistance < 10) continue;
        
        totalPairs++;
        
        // Calculate ratio - should be similar if match is consistent
        const ratio = frameDistance / targetDistance;
        
        if (ratio >= minRatio && ratio <= maxRatio) {
          consistentPairs++;
        }
      }
    }
    
    return consistentPairs;
  }

  private geometricVerification(matches: FeatureMatch[], framePoints: Point[]): FeatureMatch[] {
    if (matches.length < 8) return matches;
    
    // Implement a simple homography-like check
    // Select 4 well-distributed matches and check if they form a valid quadrilateral
    const verifiedMatches: FeatureMatch[] = [];
    
    // Check the spatial distribution of matches
    // Calculate centroid of frame points
    let sumX = 0, sumY = 0;
    matches.forEach(match => {
      const p = framePoints[match.queryIdx];
      sumX += p.x;
      sumY += p.y;
    });
    
    const centroidX = sumX / matches.length;
    const centroidY = sumY / matches.length;
    
    // Check if matches are well distributed in all quadrants
    let quadrants = [0, 0, 0, 0]; // [top-left, top-right, bottom-left, bottom-right]
    
    matches.forEach(match => {
      const p = framePoints[match.queryIdx];
      if (p.x < centroidX && p.y < centroidY) quadrants[0]++;
      else if (p.x >= centroidX && p.y < centroidY) quadrants[1]++;
      else if (p.x < centroidX && p.y >= centroidY) quadrants[2]++;
      else quadrants[3]++;
    });
    
    // Check if we have at least 2 points in each quadrant
    const isWellDistributed = quadrants.every(count => count >= 2);
    
    // If matches are well distributed, it's more likely to be a real match
    if (isWellDistributed) {
      // Check relative distances within the same quadrant
      // (This is a simplified check, a true homography would be more rigorous)
      let consistentRelativeDistances = true;
      
      // Check each quadrant
      for (let q = 0; q < 4; q++) {
        if (quadrants[q] < 2) continue;
        
        // Find points in this quadrant
        const quadrantPoints = matches.filter(match => {
          const p = framePoints[match.queryIdx];
          return (q === 0 && p.x < centroidX && p.y < centroidY) ||
                 (q === 1 && p.x >= centroidX && p.y < centroidY) ||
                 (q === 2 && p.x < centroidX && p.y >= centroidY) ||
                 (q === 3 && p.x >= centroidX && p.y >= centroidY);
        });
        
        // Check pairwise distances within quadrant
        for (let i = 0; i < quadrantPoints.length - 1; i++) {
          for (let j = i + 1; j < quadrantPoints.length; j++) {
            const matchI = quadrantPoints[i];
            const matchJ = quadrantPoints[j];
            
            const framePointI = framePoints[matchI.queryIdx];
            const framePointJ = framePoints[matchJ.queryIdx];
            const targetPointI = this.targetPoints[matchI.trainIdx];
            const targetPointJ = this.targetPoints[matchJ.trainIdx];
            
            const frameDistance = this.getDistance(framePointI, framePointJ);
            const targetDistance = this.getDistance(targetPointI, targetPointJ);
            
            if (targetDistance < 1) continue;
            
            const ratio = frameDistance / targetDistance;
            
            // More strict ratio check for verification
            if (ratio < 0.75 || ratio > 1.25) {
              consistentRelativeDistances = false;
              break;
            }
          }
          if (!consistentRelativeDistances) break;
        }
      }
      
      if (consistentRelativeDistances) {
        // If we passed all checks, return the original matches
        return matches;
      }
    }
    
    // If verification failed, return a reduced set of matches
    return matches.slice(0, Math.floor(matches.length * 0.5));
  }

  private calculateConsistency(
    matches: FeatureMatch[], 
    framePoints: Point[], 
    frameWidth: number, 
    frameHeight: number
  ): void {
    if (matches.length < 8) {
      this.lastConsistencyRatio = 0;
      return;
    }
    
    // Take the top matches
    const topMatches = matches.slice(0, Math.min(30, matches.length));
    
    // Count pairwise geometric consistency
    let consistentPairs = 0;
    let totalPairs = 0;
    
    for (let i = 0; i < topMatches.length; i++) {
      const matchI = topMatches[i];
      const framePointI = framePoints[matchI.queryIdx];
      const targetPointI = this.targetPoints[matchI.trainIdx];
      
      for (let j = i + 1; j < topMatches.length; j++) {
        const matchJ = topMatches[j];
        const framePointJ = framePoints[matchJ.queryIdx];
        const targetPointJ = this.targetPoints[matchJ.trainIdx];
        
        // Calculate distances between points
        const frameDistance = this.getDistance(framePointI, framePointJ);
        
        // Scale target points to frame size
        const scaledTargetPointI = {
          x: targetPointI.x * frameWidth / this.targetWidth,
          y: targetPointI.y * frameHeight / this.targetHeight
        };
        
        const scaledTargetPointJ = {
          x: targetPointJ.x * frameWidth / this.targetWidth,
          y: targetPointJ.y * frameHeight / this.targetHeight
        };
        
        const targetDistance = this.getDistance(scaledTargetPointI, scaledTargetPointJ);
        
        // Skip if either distance is too small
        if (targetDistance < 1 || frameDistance < 1) continue;
        
        // Calculate ratio
        const ratio = frameDistance / targetDistance;
        
        // Increment counters
        totalPairs++;
        
        // Stricter criteria for consistency
        if (ratio >= 0.75 && ratio <= 1.25) {
          consistentPairs++;
        }
      }
    }
    
    // Calculate final consistency ratio
    this.lastConsistencyRatio = totalPairs > 0 ? consistentPairs / totalPairs : 0;
    
    console.log(`Consistency ratio: ${(this.lastConsistencyRatio * 100).toFixed(2)}% (${consistentPairs}/${totalPairs})`);
  }

  private getDistance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
