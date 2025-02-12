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
    const tracker = new ImageTracker(trackingData);
    let animationFrame: number;

    console.log('Camera mounted with tracking data:', {
      features: trackingData.features.length,
      width: trackingData.width,
      height: trackingData.height
    });
    
    async function processFrame() {
      if (!videoRef.current || !canvasRef.current) return;
      
      try {
        // Process frame
        const framePoints = await frameProcessor.processFrame(videoRef.current);
        
        // Match features
        const matches = tracker.matchFeatures(
          framePoints,
          videoRef.current.videoWidth,
          videoRef.current.videoHeight
        );

        // Debug info
        console.log('Frame processed:', {
          framePoints: framePoints.length,
          matches: matches.length
        });
        
        // Update tracking status
        const newTrackingStatus = matches.length >= 10;
        setIsTracking(newTrackingStatus);
        onTrackingUpdate?.(newTrackingStatus);
        
        // Update current frame data
        setCurrentFrame({ points: framePoints, matches });
        
        // Draw debug visualization
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true })!;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Set canvas dimensions to match video
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        
        // Draw frame points (red)
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        framePoints.forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        
        // Draw target points (blue)
        ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
        trackingData.features.forEach(feature => {
          ctx.beginPath();
          ctx.arc(feature.pt.x, feature.pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        
        // Draw matches (green lines)
        if (matches.length > 0) {
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
          ctx.lineWidth = 2;
          matches.forEach(match => {
            const framePoint = framePoints[match.queryIdx];
            const targetPoint = trackingData.features[match.trainIdx].pt;
            ctx.beginPath();
            ctx.moveTo(framePoint.x, framePoint.y);
            ctx.lineTo(targetPoint.x, targetPoint.y);
            ctx.stroke();
          });
        }
      } catch (error) {
        console.error('Error in processFrame:', error);
      }
      
      animationFrame = requestAnimationFrame(processFrame);
    }

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
          videoRef.current.onloadedmetadata = () => {
            console.log('Video ready:', {
              width: videoRef.current?.videoWidth,
              height: videoRef.current?.videoHeight
            });
            processFrame();
          };
        }
      } catch (error) {
        console.error('Error setting up camera:', error);
      }
    }

    setupCamera();

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
        targetPoints={trackingData.features.map(f => f.pt)}
        videoUrl="/videos/sneakarvid.mp4"
      />
      {/* Debug overlay */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-2 rounded">
        <div>Tracking: {isTracking ? '✅' : '❌'}</div>
        <div>Frame Points: {currentFrame.points.length}</div>
        <div>Target Points: {trackingData.features.length}</div>
        <div>Matches: {currentFrame.matches.length}</div>
      </div>
    </div>
  );
}

export default Camera;
