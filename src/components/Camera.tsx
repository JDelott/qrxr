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
  // Create refs for all three AR videos
  const arVideoRef1 = useRef<HTMLVideoElement>(null);
  const arVideoRef2 = useRef<HTMLVideoElement>(null);
  const arVideoRef3 = useRef<HTMLVideoElement>(null);

  // Handle back button and cleanup
  useEffect(() => {
    const handleBackButton = () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      // Pause all videos
      [arVideoRef1.current, arVideoRef2.current, arVideoRef3.current].forEach(video => {
        if (video) video.pause();
      });
      setIsTracking(false);
      onTrackingUpdate(false);
    };

    window.addEventListener('popstate', handleBackButton);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
      // Cleanup camera and videos on unmount
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      // Pause all videos
      [arVideoRef1.current, arVideoRef2.current, arVideoRef3.current].forEach(video => {
        if (video) video.pause();
      });
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
        
        // Only log occasionally
        if (Math.random() < 0.05) {
          console.log('Frame points found:', framePoints.length);
        }

        // Call matchFeatures but ignore the return value since the tracker handles confidence internally
        tracker.matchFeatures(
          framePoints,
          currentVideo.videoWidth,
          currentVideo.videoHeight
        );

        // Check if the tracker has strong tracking (determined inside the tracker)
        if (!hasInitialized.current && tracker.hasStrongTracking()) {
          console.log('Strong tracking confirmed! Starting AR experience...');
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

  // Update effect to handle all AR videos playback
  useEffect(() => {
    const videoElements = [arVideoRef1.current, arVideoRef2.current, arVideoRef3.current];
    
    if ((isTracking || hasInitialized.current) && videoElements.every(v => v !== null)) {
      const playVideos = async () => {
        try {
          console.log('Attempting to play AR videos...');
          
          for (const videoElement of videoElements) {
            if (!videoElement) continue;

            // Don't reset video if it's already playing
            if (!videoElement.paused) {
              console.log('Video is already playing, skipping...');
              continue;
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
          }
          
          if (!hasInitialized.current) {
            hasInitialized.current = true;
          }
          
          console.log('Videos playing successfully');
        } catch (error) {
          console.error('Failed to play AR videos:', error);
        }
      };

      playVideos();

      // Add event listener for video end
      const handleVideoEnd = () => {
        hasInitialized.current = false;
      };
      
      videoElements.forEach(video => {
        if (video) video.addEventListener('ended', handleVideoEnd);
      });

      return () => {
        videoElements.forEach(video => {
          if (video) video.removeEventListener('ended', handleVideoEnd);
        });
      };
    }
  }, [isTracking]);

  // Add effect to preload all videos
  useEffect(() => {
    [arVideoRef1.current, arVideoRef2.current, arVideoRef3.current].forEach(video => {
      if (video) {
        console.log('Preloading AR video...');
        video.load();
      }
    });
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

      {/* Hidden video elements for the AR content */}
      <video
        ref={arVideoRef1}
        src="/videos/Eagle1.mp4"
        playsInline
        muted
        preload="auto"
        style={{ display: 'none' }}
      />
      <video
        ref={arVideoRef2}
        src="/videos/Eagle2.mp4"
        playsInline
        muted
        preload="auto"
        style={{ display: 'none' }}
      />
      <video
        ref={arVideoRef3}
        src="/videos/Eagle3.mp4"
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
          {/* Multiple video planes with different z positions and opacities */}
          <ARVideoPlane
            isVisible={isTracking}
            videoRef={arVideoRef1}
            zPosition={-1.0}
            opacity={0.9}
            scale={[3.8, 2.15, 1]}
          />
          <ARVideoPlane
            isVisible={isTracking}
            videoRef={arVideoRef2}
            zPosition={-2.0}
            opacity={0.8}
            scale={[3.8, 2.15, 1]}
          />
          <ARVideoPlane
            isVisible={isTracking}
            videoRef={arVideoRef3}
            zPosition={-3.0}
            opacity={0.7}
            scale={[3.8, 2.15, 1]}
          />
        </Canvas>
      </div>
    </div>
  );
}

export default Camera;
