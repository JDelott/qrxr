import { useEffect, useRef } from 'react';
import { Point, FeatureMatch } from '../types/tracking';

interface AROverlayProps {
  isTracking: boolean;
  matches: FeatureMatch[];
  framePoints: Point[];
  targetPoints: Point[];
  videoUrl?: string; // New prop for video source
}

function AROverlay({ 
  isTracking, 
  matches, 
  framePoints, 
  targetPoints,
  videoUrl = '/path/to/your/video.mp4' // Default video or from props
}: AROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isTracking && matches.length > 0) {
      // Calculate bounding box of tracked points
      const points = matches.map(m => framePoints[m.queryIdx]);
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      
      const width = maxX - minX;
      const height = maxY - minY;

      // Start playing video when tracking starts
      if (video.paused) {
        video.play().catch(err => console.error('Video playback failed:', err));
      }

      // Draw video onto canvas at tracked position
      try {
        ctx.save();
        // Optional: add perspective transform here for better AR effect
        ctx.drawImage(
          video,
          minX,
          minY,
          width,
          height
        );
        ctx.restore();
      } catch (err) {
        console.error('Error drawing video:', err);
      }
    } else {
      // Pause video when not tracking
      if (!video.paused) {
        video.pause();
      }
    }
  }, [isTracking, matches, framePoints, targetPoints, videoUrl]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />
      <video
        ref={videoRef}
        src={videoUrl}
        className="hidden" // Hide the video element, we'll draw to canvas
        playsInline
        muted
        loop
      />
    </>
  );
}

export default AROverlay;
