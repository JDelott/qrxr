import { useEffect, useRef, useState } from 'react';
import { FrameProcessor } from '../utils/frameProcessor';
import { ImageTracker } from '../utils/tracker';
import AROverlay from './AROverlay';
import { TrackingData, FeatureMatch, Point } from '../types/tracking';

interface CameraProps {
  trackingData: TrackingData;
  onTrackingUpdate?: (isTracking: boolean) => void;
}

function Camera({ trackingData, onTrackingUpdate }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<{
    points: Point[];
    matches: FeatureMatch[];
  }>({ points: [], matches: [] });
  
  useEffect(() => {
    const frameProcessor = new FrameProcessor();
    
    // Transform the tracking data to the format ImageTracker expects
    const trackerData = {
      points: trackingData.features.map(feature => ({
        pt: feature.pt
      })),
      width: trackingData.width,
      height: trackingData.height
    };
    
    const tracker = new ImageTracker(trackerData);
    let animationFrame: number;
    
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
      }
    }

    async function processFrame() {
      if (videoRef.current && canvasRef.current) {
        // Process frame
        const framePoints = await frameProcessor.processFrame(videoRef.current);
        
        // Match features
        const matches = tracker.matchFeatures(
          framePoints,
          videoRef.current.videoWidth,
          videoRef.current.videoHeight
        );
        
        // Update tracking status
        const newTrackingStatus = matches.length > 10;
        setIsTracking(newTrackingStatus);
        onTrackingUpdate?.(newTrackingStatus);
        
        // Update current frame data for overlay
        setCurrentFrame({ points: framePoints, matches });
        
        // Draw debug visualization
        const ctx = canvasRef.current.getContext('2d')!;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Draw feature points
        ctx.fillStyle = 'red';
        framePoints.forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      
      animationFrame = requestAnimationFrame(processFrame);
    }

    setupCamera();
    processFrame();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [trackingData, onTrackingUpdate]);

  return (
    <div className="camera-container relative">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        className="camera-feed w-full h-full object-cover"
      />
      <canvas 
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />
      <AROverlay
        isTracking={isTracking}
        matches={currentFrame.matches}
        framePoints={currentFrame.points}
        targetPoints={trackingData.features.map(feature => feature.pt)}
        videoUrl="/videos/sneakarvid.mp4"
      />
      {/* Debug overlay */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-2 rounded">
        <div>Tracking: {isTracking ? '✅' : '❌'}</div>
        <div>Features: {currentFrame.points.length}</div>
        <div>Matches: {currentFrame.matches.length}</div>
      </div>
    </div>
  );
}

export default Camera;
