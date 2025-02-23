import { useEffect, useRef } from 'react';
import { Point, FeatureMatch } from '../types/tracking';
import React from 'react';

interface AROverlayProps {
  isTracking: boolean;
  matches: FeatureMatch[];
  framePoints: Point[];
  targetPoints: Point[];
  videoUrl: string;
  style?: React.CSSProperties;
  className?: string;
}

function AROverlay({ 
  isTracking, 
  matches, 
  framePoints, 
  targetPoints,
  videoUrl
}: AROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Set canvas size to match parent container
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isTracking && matches.length >= 3) { // Ensure minimum matches
      // Calculate bounding box of tracked points
      const points = matches.map(m => framePoints[m.queryIdx]);
      const minX = Math.min(...points.map(p => p.x));
      const maxX = Math.max(...points.map(p => p.x));
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      
      const width = maxX - minX;
      const height = maxY - minY;

      // Only play video if we have good tracking
      if (video.paused && width > 50 && height > 50) { // Minimum size check
        video.play().catch(err => console.error('Video playback failed:', err));
      }

      // Draw video onto canvas at tracked position
      try {
        ctx.save();
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

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isTracking, matches, framePoints, targetPoints, videoUrl]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <video
        ref={videoRef}
        src={videoUrl}
        className="hidden"
        playsInline
        muted
        loop
      />
    </div>
  );
}

export default AROverlay;
