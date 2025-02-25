import { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ARVideoPlaneProps {
  isVisible: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  zPosition?: number;
  opacity?: number;
  scale?: [number, number, number];
}

function ARVideoPlane({ 
  isVisible, 
  videoRef, 
  zPosition = -1.5,
  opacity = 1.0,
  scale = [3.8, 2.15, 1]
}: ARVideoPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const hasStartedPlayback = useRef(false);

  // Create custom shader material for chroma keying
  const shaderMaterial = useMemo(() => {
    // Define our custom shader for chroma keying
    const shader = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        keyColor: { value: new THREE.Color(0x00FFFF) }, // Cyan color to key out
        similarity: { value: 0.45 },  // How similar colors need to be to be keyed out (0-1)
        smoothness: { value: 0.09 },  // Edge smoothness
        opacity: { value: opacity }   // Overall opacity
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 keyColor;
        uniform float similarity;
        uniform float smoothness;
        uniform float opacity;
        varying vec2 vUv;
        
        void main() {
          vec4 videoColor = texture2D(map, vUv);
          
          // Calculate color distance - how close is the color to our key color
          float colorDistance = length(keyColor - videoColor.rgb);
          
          // Create a mask based on the similarity
          float mask = smoothstep(similarity, similarity + smoothness, colorDistance);
          
          // Apply the mask with overall opacity control
          gl_FragColor = vec4(videoColor.rgb, videoColor.a * mask * opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    
    return shader;
  }, [opacity]);

  // Setup video texture and material once
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    video.loop = false;
    
    // Create video texture
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    // Update the uniform with our texture
    shaderMaterial.uniforms.map.value = texture;
    materialRef.current = shaderMaterial;

    // Apply material to mesh
    if (meshRef.current) {
      meshRef.current.material = shaderMaterial;
    }

    return () => {
      texture.dispose();
      shaderMaterial.dispose();
    };
  }, [shaderMaterial]);

  // Handle initial video playback
  useEffect(() => {
    if (!videoRef.current || hasStartedPlayback.current) return;

    if (isVisible) {
      const video = videoRef.current;
      video.currentTime = 0;
      video.play()
        .then(() => {
          hasStartedPlayback.current = true;
        })
        .catch(console.error);
    }
  }, [isVisible]);

  // Keep texture updated
  useFrame(() => {
    if (materialRef.current?.uniforms.map.value) {
      (materialRef.current.uniforms.map.value as THREE.VideoTexture).needsUpdate = true;
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      position={[0, 0, zPosition]}
      scale={scale}
      renderOrder={Math.abs(zPosition) * 100}
    >
      <planeGeometry />
    </mesh>
  );
}

export default ARVideoPlane;
