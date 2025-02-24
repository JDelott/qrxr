import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ARVideoPlaneProps {
  videoUrl?: string;
  isVisible: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
}

function ARVideoPlane({ isVisible, videoRef }: ARVideoPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hasStartedPlayback = useRef(false);

  // Handle video playback
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    
    if (isVisible && !hasStartedPlayback.current) {
      // Reset video to start
      video.currentTime = 0;
      
      // Attempt to play
      video.play()
        .then(() => {
          hasStartedPlayback.current = true;
          console.log('Video started playing successfully');
        })
        .catch(error => {
          console.error('Failed to play video:', error);
          hasStartedPlayback.current = false;
        });
    }
  }, [isVisible]);

  // Setup video texture and material
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    
    // Create video texture
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Create material
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isVisible ? 1 : 0,
    });
    materialRef.current = material;

    // Apply material to mesh
    if (meshRef.current) {
      meshRef.current.material = material;
    }

    return () => {
      material.dispose();
      texture.dispose();
    };
  }, []);

  // Keep texture updated and handle visibility
  useFrame(() => {
    if (materialRef.current?.map) {
      (materialRef.current.map as THREE.VideoTexture).needsUpdate = true;
      materialRef.current.opacity = isVisible ? 1 : 0;
      materialRef.current.needsUpdate = true;
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      position={[0, 0, -2]}
      scale={[2, 1.125, 1]}
      visible={isVisible} // Only show mesh when tracking
    >
      <planeGeometry />
    </mesh>
  );
}

export default ARVideoPlane;
