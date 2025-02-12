export interface Point {
  x: number;
  y: number;
}

export interface Feature {
  pt: Point;
  descriptor: Float32Array;
}

export interface TrackingData {
  width: number;
  height: number;
  features: Feature[];
  points: Array<{ pt: Point }>;
}

export interface FeatureMatch {
  queryIdx: number;
  trainIdx: number;
  distance: number;
}
