import { useEffect, useRef, useState } from 'react';
import { TrackingData } from '../types/tracking';
import { FrameProcessor } from '../utils/frameProcessor';
import { ImageTracker } from '../utils/tracker';

interface CameraProps {
  videoUrl: string;
  trackingData: TrackingData;
  onTrackingUpdate?: (isTracking: boolean) => void;
}

function Camera({ videoUrl, trackingData, onTrackingUpdate }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTracking, setIsTracking] = useState(false);
  const lastFramesRef = useRef<number[]>([]); // Store last N frame match counts
  const FRAME_BUFFER_SIZE = 10; // Increased buffer size
  const frameCountRef = useRef(0); // Count frames since last state change
  const MIN_FRAMES_BEFORE_CHANGE = 5; // Minimum frames before allowing state change
  
  // Add constants for tracking thresholds
  const START_TRACKING_THRESHOLD = 40;
  const STOP_TRACKING_THRESHOLD = 20;

  // Add ref for AR video
  const arVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const currentVideo = videoRef.current;
    const currentCanvas = canvasRef.current;
    if (!currentVideo || !currentCanvas || !trackingData) return;

    const frameProcessor = new FrameProcessor();
    const tracker = new ImageTracker(trackingData);
    let animationFrame: number;

    const processFrame = async () => {
      try {
        // Process frame to get points
        const framePoints = await frameProcessor.processFrame(currentVideo);
        
        if (framePoints.length > 0) {
          // Calculate bounding box of points
          const minX = Math.min(...framePoints.map(p => p.x));
          const maxX = Math.max(...framePoints.map(p => p.x));
          const minY = Math.min(...framePoints.map(p => p.y));
          const maxY = Math.max(...framePoints.map(p => p.y));
          
          const width = maxX - minX;
          const height = maxY - minY;
          
          // Match features
          const matches = tracker.matchFeatures(
            framePoints,
            width,
            height
          );

          // Update frame buffer
          lastFramesRef.current.push(matches.length);
          if (lastFramesRef.current.length > FRAME_BUFFER_SIZE) {
            lastFramesRef.current.shift();
          }

          // Calculate average matches
          const averageMatches = Math.round(
            lastFramesRef.current.reduce((a, b) => a + b, 0) / lastFramesRef.current.length
          );

          // Increment frame counter
          frameCountRef.current++;

          // Update tracking status with debounce
          const shouldBeTracking = isTracking 
            ? averageMatches >= STOP_TRACKING_THRESHOLD
            : averageMatches >= START_TRACKING_THRESHOLD;

          if (shouldBeTracking !== isTracking && frameCountRef.current >= MIN_FRAMES_BEFORE_CHANGE) {
            console.log('State change:', {
              averageMatches,
              threshold: isTracking ? STOP_TRACKING_THRESHOLD : START_TRACKING_THRESHOLD,
              frameCount: frameCountRef.current
            });
            setIsTracking(shouldBeTracking);
            onTrackingUpdate?.(shouldBeTracking);
            frameCountRef.current = 0; // Reset frame counter
          }

          // Draw debug visualization
          const ctx = currentCanvas.getContext('2d');
          if (ctx) {
            currentCanvas.width = currentVideo.videoWidth;
            currentCanvas.height = currentVideo.videoHeight;
            
            // Draw all points in blue
            ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
            framePoints.forEach(point => {
              ctx.beginPath();
              ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
              ctx.fill();
            });

            // Draw matches in bright green
            ctx.strokeStyle = 'rgba(0, 255, 0, 1)';
            ctx.lineWidth = 3;
            matches.forEach(match => {
              const framePoint = framePoints[match.queryIdx];
              ctx.beginPath();
              ctx.arc(framePoint.x, framePoint.y, 8, 0, Math.PI * 2);
              ctx.stroke();
            });

            // Draw bounding box
            ctx.strokeStyle = 'yellow';
            ctx.strokeRect(minX, minY, width, height);

            // Draw tracking status and debug info
            ctx.fillStyle = 'white';
            ctx.font = '24px Arial';
            ctx.fillText(`Tracking: ${isTracking ? 'YES' : 'NO'}`, 10, 30);
            ctx.fillText(`Matches: ${averageMatches}/${isTracking ? STOP_TRACKING_THRESHOLD : START_TRACKING_THRESHOLD}`, 10, 60);
            ctx.fillText(`Frame Buffer: ${lastFramesRef.current.length}/${FRAME_BUFFER_SIZE}`, 10, 90);
            ctx.fillText(`Frames Since Change: ${frameCountRef.current}/${MIN_FRAMES_BEFORE_CHANGE}`, 10, 120);
          }
        }

        animationFrame = requestAnimationFrame(processFrame);
      } catch (error) {
        console.error('Error in processFrame:', error);
        animationFrame = requestAnimationFrame(processFrame);
      }
    };

    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        currentVideo.srcObject = stream;
        currentVideo.onloadedmetadata = () => {
          processFrame();
        };
      } catch (error) {
        console.error('Error setting up camera:', error);
      }
    };

    setupCamera();

    return () => {
      cancelAnimationFrame(animationFrame);
      if (currentVideo?.srcObject) {
        const tracks = (currentVideo.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [trackingData, onTrackingUpdate, isTracking]);

  // Add effect to handle AR video playback
  useEffect(() => {
    if (isTracking && arVideoRef.current) {
      const playVideo = async () => {
        try {
          console.log('Attempting to play AR video...');
          const video = arVideoRef.current;
          if (!video) return;

          // Reset video
          video.currentTime = 0;
          
          // Ensure video is loaded
          if (video.readyState < 4) {
            await new Promise((resolve) => {
              video.addEventListener('canplaythrough', resolve, { once: true });
              video.load();
            });
          }

          // Try to play
          await video.play();
          console.log('Video playing:', { 
            currentTime: video.currentTime,
            duration: video.duration,
            paused: video.paused
          });
        } catch (error) {
          console.error('Failed to play AR video:', error);
        }
      };

      playVideo();
    }
  }, [isTracking]);

  // Add effect to preload video
  useEffect(() => {
    if (videoUrl && arVideoRef.current) {
      console.log('Preloading AR video...');
      arVideoRef.current.load();
    }
  }, [videoUrl]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Camera Layer */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'translateZ(0)'
        }}
      />

      {/* Debug Layer */}
      <canvas 
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          transform: 'translateZ(1px)'
        }}
      />

      {/* AR Video Layer */}
      <video
        ref={arVideoRef}
        key="ar-video"
        src="/videos/sneakarvid.mp4"
        playsInline
        muted
        loop
        preload="auto"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'translateZ(2px)',
          opacity: isTracking ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none'
        }}
        onLoadedMetadata={(e) => {
          console.log('AR video metadata loaded:', {
            duration: e.currentTarget.duration,
            width: e.currentTarget.videoWidth,
            height: e.currentTarget.videoHeight
          });
        }}
        onCanPlay={() => {
          console.log('AR video can play');
        }}
        onPlaying={() => {
          console.log('AR video started playing');
        }}
        onPause={() => {
          console.log('AR video paused');
        }}
        onError={(e) => {
          console.error('AR video error:', e);
        }}
      />

      {/* Debug Info */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(0,0,0,0.5)',
        color: 'white',
        padding: 10,
        borderRadius: 5,
        transform: 'translateZ(3px)',
        zIndex: 1000
      }}>
        <div>Tracking: {isTracking ? '✅' : '❌'}</div>
        <div>Video URL: {videoUrl ? '✅' : '❌'}</div>
        <div>Video Ready: {arVideoRef.current?.readyState === 4 ? '✅' : '❌'}</div>
        <div>Video Playing: {!arVideoRef.current?.paused ? '✅' : '❌'}</div>
      </div>
    </div>
  );
}

export default Camera;
