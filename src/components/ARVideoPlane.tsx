import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ARVideoPlaneProps {
  isVisible: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
}

function ARVideoPlane({ isVisible, videoRef }: ARVideoPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hasStartedPlayback = useRef(false);

  // Setup video texture and material once
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    video.loop = false;
    
    // Create video texture
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // Create material
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
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

  // Handle initial video playback
  useEffect(() => {
    if (!videoRef.current || hasStartedPlayback.current) return;

    if (isVisible) {
      const video = videoRef.current;
      video.currentTime = 0;
      video.play()
        .then(() => {
          hasStartedPlayback.current = true;
          if (materialRef.current) {
            materialRef.current.opacity = 1;
          }
        })
        .catch(console.error);
    }
  }, [isVisible]);

  // Keep texture updated
  useFrame(() => {
    if (materialRef.current?.map) {
      (materialRef.current.map as THREE.VideoTexture).needsUpdate = true;
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      position={[0, 0, -1.5]}
      scale={[4.5, 2.53125, 1]}
    >
      <planeGeometry />
    </mesh>
  );
}

export default ARVideoPlane;
