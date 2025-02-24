import { useEffect, useRef, useState } from 'react';
import { TrackingData } from '../types/tracking';
import { FrameProcessor } from '../utils/frameProcessor';
import { ImageTracker } from '../utils/tracker';
import { Canvas } from '@react-three/fiber';
import ARVideoPlane from './ARVideoPlane';

interface CameraProps {
  trackingData: TrackingData;
  onTrackingUpdate: (isTracking: boolean) => void;
  videoUrl?: string; // Make videoUrl optional
}

function Camera({ videoUrl, trackingData, onTrackingUpdate }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isTracking, setIsTracking] = useState(false);
  const hasInitialized = useRef(false);
  const arVideoRef = useRef<HTMLVideoElement>(null);

  // Handle back button and cleanup
  useEffect(() => {
    const handleBackButton = () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (arVideoRef.current) {
        arVideoRef.current.pause();
      }
      setIsTracking(false);
      onTrackingUpdate(false);
    };

    window.addEventListener('popstate', handleBackButton);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
      // Cleanup camera and video on unmount
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (arVideoRef.current) {
        arVideoRef.current.pause();
      }
    };
  }, [onTrackingUpdate]);

  useEffect(() => {
    const currentVideo = videoRef.current;
    if (!currentVideo || !trackingData) {
      console.log('Missing video or tracking data:', { video: !!currentVideo, trackingData: !!trackingData });
      return;
    }

    console.log('Initializing tracking with data:', trackingData);

    const frameProcessor = new FrameProcessor();
    const tracker = new ImageTracker(trackingData);
    let animationFrame: number;

    const processFrame = async () => {
      try {
        if (!currentVideo.videoWidth || !currentVideo.videoHeight) {
          console.log('Video not ready:', {
            width: currentVideo.videoWidth,
            height: currentVideo.videoHeight
          });
          animationFrame = requestAnimationFrame(processFrame);
          return;
        }

        const framePoints = await frameProcessor.processFrame(currentVideo);
        console.log('Frame points found:', framePoints.length);

        const matches = tracker.matchFeatures(
          framePoints,
          currentVideo.videoWidth,
          currentVideo.videoHeight
        );

        console.log('Current matches:', matches.length);

        if (!hasInitialized.current && matches.length >= 1) {
          console.log('Target detected! Starting tracking...');
          setIsTracking(true);
          onTrackingUpdate(true);
          hasInitialized.current = true;
        }

        animationFrame = requestAnimationFrame(processFrame);
      } catch (error) {
        console.error('Frame processing error:', error);
        animationFrame = requestAnimationFrame(processFrame);
      }
    };

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      }
    }).then((stream) => {
      currentVideo.srcObject = stream;
      console.log('Camera initialized:', stream.getVideoTracks()[0].getSettings());
      
      currentVideo.onloadedmetadata = () => {
        console.log('Video metadata loaded:', {
          width: currentVideo.videoWidth,
          height: currentVideo.videoHeight
        });
        currentVideo.play().catch(console.error);
        processFrame();
      };
    }).catch((error) => {
      console.error('Camera initialization failed:', error);
    });

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (currentVideo.srcObject) {
        (currentVideo.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [trackingData, onTrackingUpdate]);

  // Add effect to handle AR video playback
  useEffect(() => {
    const videoElement = arVideoRef.current;
    
    if ((isTracking || hasInitialized.current) && videoElement) {
      const playVideo = async () => {
        try {
          console.log('Attempting to play AR video...');
          if (!videoElement) return;

          // Don't reset video if it's already playing
          if (!videoElement.paused) {
            console.log('Video is already playing, skipping...');
            return;
          }

          // Only reset if video has ended or hasn't started
          if (videoElement.ended || videoElement.currentTime === 0) {
            videoElement.currentTime = 0;
          }
          
          // Ensure video is loaded
          if (videoElement.readyState < 4) {
            await new Promise((resolve) => {
              videoElement.addEventListener('canplaythrough', resolve, { once: true });
              videoElement.load();
            });
          }

          // Try to play
          await videoElement.play();
          if (!hasInitialized.current) {
            hasInitialized.current = true;
          }
          
          console.log('Video playing:', { 
            currentTime: videoElement.currentTime,
            duration: videoElement.duration,
            paused: videoElement.paused
          });
        } catch (error) {
          console.error('Failed to play AR video:', error);
        }
      };

      playVideo();

      // Add event listener for video end
      const handleVideoEnd = () => {
        hasInitialized.current = false;
      };
      videoElement.addEventListener('ended', handleVideoEnd);

      return () => {
        videoElement.removeEventListener('ended', handleVideoEnd);
        if (videoElement && !videoElement.paused && !hasInitialized.current) {
          console.log('Preserving video playback state');
        }
      };
    }
  }, [isTracking, hasInitialized.current]);

  // Add effect to preload video
  useEffect(() => {
    if (videoUrl && arVideoRef.current) {
      console.log('Preloading AR video...');
      arVideoRef.current.load();
    }
  }, [videoUrl]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
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
          zIndex: 0
        }}
      />

      <video
        ref={arVideoRef}
        src="/videos/sneakarvid.mp4"
        playsInline
        muted
        preload="auto"
        style={{ display: 'none' }}
      />

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '125vw',
        height: '125vh',
        transform: 'translate(-12.5%, -12.5%)',
        pointerEvents: 'none',
        zIndex: 1
      }}>
        <Canvas
          camera={{
            position: [0, 0, 3],
            fov: 90,
            near: 0.1,
            far: 1000
          }}
          gl={{ 
            antialias: true,
            alpha: true,
          }}
          style={{
            width: '100%',
            height: '100%'
          }}
        >
          <ARVideoPlane
            isVisible={isTracking}
            videoRef={arVideoRef}
          />
        </Canvas>
      </div>
    </div>
  );
}

export default Camera;
