import { useEffect, useRef } from 'react';

function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Use back camera
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

    setupCamera();
  }, []);

  return (
    <div className="camera-container">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        className="camera-feed"
      />
    </div>
  );
}

export default Camera;
