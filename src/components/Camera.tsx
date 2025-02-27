import{ useState, useEffect, useRef } from 'react';
import { FrameProcessor } from '../utils/frameProcessor';
import { ImageTracker } from '../utils/tracker';
import { Point, FeatureMatch } from '../types/tracking';

interface CameraProps {
  videoUrl: string | null;
  trackingData: any;
  onTrackingUpdate: (isTracking: boolean, matches: FeatureMatch[], framePoints: Point[], targetPoints: Point[]) => void;
}

function Camera({ videoUrl, trackingData, onTrackingUpdate }: CameraProps) {
  // Refs for DOM elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arVideoRef = useRef<HTMLVideoElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for tracking
  const [isTracking, setIsTracking] = useState(false);
  const [trackingConfirmed, setTrackingConfirmed] = useState(false);
  const lastFramesRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const [debugMode] = useState(true);
  const [testMode, setTestMode] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // More demanding thresholds
  const TRACKING_STABILITY_THRESHOLD = 20; // Require more frames of stable tracking
  const START_TRACKING_THRESHOLD = 15;
  const STOP_TRACKING_THRESHOLD = 10;
  const MIN_MATCH_QUALITY = 0.4;
  const MAINTAIN_MATCH_QUALITY = 0.3;
  const PATTERN_MATCH_THRESHOLD = 0.70; // 70% pattern similarity required
  const DENSITY_MATCH_THRESHOLD = 0.65; // 65% density similarity required

  // Tracking stability states
  const [trackingStartFrameCount, setTrackingStartFrameCount] = useState(0);
  const [lastFrameWasTracking, setLastFrameWasTracking] = useState(false);
  const trackingStabilityCounter = useRef(0);
  const lastMatchScoreRef = useRef(0);

  // Image grid dimensions for pattern matching
  const GRID_SIZE = 8; // 8x8 grid for pattern matching

  // Function to calculate the average number of matches over recent frames
  const getAverageMatches = (currentMatches: number): number => {
    // Keep the last 5 frames for smoothing
    const MAX_FRAMES = 5;
    
    // Add current matches to history
    lastFramesRef.current.push(currentMatches);
    
    // Trim history to only keep last MAX_FRAMES values
    if (lastFramesRef.current.length > MAX_FRAMES) {
      lastFramesRef.current.shift();
    }
    
    // Calculate average
    const sum = lastFramesRef.current.reduce((total, matches) => total + matches, 0);
    return sum / lastFramesRef.current.length;
  };

  // Initialize camera separately to ensure it works
  useEffect(() => {
    // Don't initialize if already ready
    if (cameraReady) return;
    
    const initCamera = async () => {
      try {
        console.log('Initializing camera...');
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment' // Use back camera on mobile
          }
        };
        
        // Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Connect stream to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Wait for video to be ready
          videoRef.current.onloadedmetadata = () => {
            console.log(`Camera initialized: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
            setCameraReady(true);
          };
          
          videoRef.current.onplaying = () => {
            console.log("Video playing:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight);
          };
        }
      } catch (error) {
        console.error('Camera initialization error:', error);
        setCameraError(`Failed to access camera: ${error}`);
      }
    };
    
    initCamera();
    
    // Cleanup function to stop camera when component unmounts
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Preload the AR video when it changes
  useEffect(() => {
    if (arVideoRef.current && videoUrl) {
      console.log('Preloading AR video...');
      arVideoRef.current.src = videoUrl;
      
      arVideoRef.current.onloadedmetadata = () => {
        console.log('AR video metadata loaded:', {
          width: arVideoRef.current?.videoWidth,
          height: arVideoRef.current?.videoHeight,
          duration: arVideoRef.current?.duration
        });
      };
      
      arVideoRef.current.oncanplay = () => {
        console.log('Attempting to play AR video...');
        arVideoRef.current?.play().catch(err => {
          console.error('Error playing AR video:', err);
        });
      };
    }
  }, [videoUrl]);

  // Only set up tracking after camera is ready
  useEffect(() => {
    if (!cameraReady || !videoRef.current || !trackingData) return;
    
    console.log('Setting up tracking with ready camera...');
    const currentVideo = videoRef.current;
    const currentCanvas = canvasRef.current;
    const debugCanvas = debugCanvasRef.current;
    if (!currentCanvas || !debugCanvas) return;

    const frameProcessor = new FrameProcessor();
    const tracker = new ImageTracker(trackingData);
    let animationFrame: number;

    const calculateAdvancedMatchScore = (framePoints: Point[]): number => {
      if (!trackingData || !trackingData.points || framePoints.length === 0) {
        return 0;
      }
      
      // 1. Create density grid for target image
      const targetGrid = new Array(GRID_SIZE * GRID_SIZE).fill(0);
      const frameGrid = new Array(GRID_SIZE * GRID_SIZE).fill(0);
      
      // Calculate density for target grid
      trackingData.points.forEach((feature: { pt: Point }) => {
        const x = Math.floor((feature.pt.x / trackingData.width) * GRID_SIZE);
        const y = Math.floor((feature.pt.y / trackingData.height) * GRID_SIZE);
        if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
          const idx = y * GRID_SIZE + x;
          targetGrid[idx]++;
        }
      });
      
      // Calculate total points in each grid for normalization
      const targetTotal = trackingData.points.length;
      
      // 2. Create density grid for frame
      const frameWidth = currentVideo.videoWidth;
      const frameHeight = currentVideo.videoHeight;
      
      // Center region calculation - assume the target is centered in viewport
      const centerX = frameWidth / 2;
      const centerY = frameHeight / 2;
      const regionWidth = frameWidth * 0.7; // 70% of frame width for matching
      const regionHeight = frameHeight * 0.7; // 70% of frame height for matching
      
      // Count points only in the center region and map to grid
      let pointsInRegion = 0;
      framePoints.forEach(point => {
        // Check if point is in center region
        if (Math.abs(point.x - centerX) < regionWidth/2 && 
            Math.abs(point.y - centerY) < regionHeight/2) {
          
          // Map to normalized grid position
          const normalizedX = (point.x - (centerX - regionWidth/2)) / regionWidth;
          const normalizedY = (point.y - (centerY - regionHeight/2)) / regionHeight;
          
          const gridX = Math.floor(normalizedX * GRID_SIZE);
          const gridY = Math.floor(normalizedY * GRID_SIZE);
          
          if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
            const idx = gridY * GRID_SIZE + gridX;
            frameGrid[idx]++;
            pointsInRegion++;
          }
        }
      });
      
      // No points in region means no match
      if (pointsInRegion < 50) {
        return 0;
      }
      
      // 3. Calculate pattern similarity
      // Normalize both grids for fair comparison
      const normalizedTargetGrid = targetGrid.map(count => count / targetTotal);
      const normalizedFrameGrid = frameGrid.map(count => count / pointsInRegion);
      
      // Calculate mean square error between patterns
      let sumSquareError = 0;
      let nonEmptyGrids = 0;
      
      for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        // Only compare cells that have points in the target
        if (normalizedTargetGrid[i] > 0) {
          const error = normalizedTargetGrid[i] - normalizedFrameGrid[i];
          sumSquareError += error * error;
          nonEmptyGrids++;
        }
      }
      
      // Calculate root mean square error and convert to similarity score
      const rmse = nonEmptyGrids > 0 ? Math.sqrt(sumSquareError / nonEmptyGrids) : 1;
      const patternSimilarity = Math.max(0, 1 - rmse);
      
      // 4. Calculate point count similarity
      // Target has trackingData.points.length points
      // We want to see similar number in the frame (not too few, not too many)
      const targetPoints = trackingData.points.length;
      const countRatio = Math.min(pointsInRegion, targetPoints) / Math.max(pointsInRegion, targetPoints);
      
      // 5. Calculate final match score with more weight on pattern
      const finalScore = (patternSimilarity * 0.7) + (countRatio * 0.3);
      
      // Debug output every 30 frames
      if (frameCountRef.current % 30 === 0) {
        console.log(`Pattern similarity: ${(patternSimilarity * 100).toFixed(1)}%, ` +
                    `Count similarity: ${(countRatio * 100).toFixed(1)}%, ` +
                    `Final score: ${(finalScore * 100).toFixed(1)}%`);
      }
      
      return finalScore;
    };

    const processFrame = async () => {
      try {
        // Process frame to get points and descriptors
        const frameData = await frameProcessor.getFrameData(currentVideo);
        
        // Default tracking variables
        let shouldBeTracking = false;
        let matches: FeatureMatch[] = [];
        let forceMatches: FeatureMatch[] = [];
        
        if (frameData.points.length > 0) {
          // IMPROVED TEST MODE with pattern matching
          if (testMode && frameData.points.length > 0) {
            // Calculate advanced match score
            const matchScore = calculateAdvancedMatchScore(frameData.points);
            lastMatchScoreRef.current = matchScore;
            
            // Check if the score meets our threshold
            if (matchScore >= PATTERN_MATCH_THRESHOLD) {
              // Create simulated matches for visualization only if pattern matched
              forceMatches = [];
              
              // Use the first 30 points in the frame as matches
              for (let i = 0; i < Math.min(30, frameData.points.length); i++) {
                forceMatches.push({
                  queryIdx: i,
                  trainIdx: i % trackingData.points.length,
                  distance: 0.1
                });
              }
              
              // Force tracking mode
              shouldBeTracking = true;
            } else {
              // Pattern doesn't match, don't track
              shouldBeTracking = false;
              forceMatches = [];
            }
            
            // Use these forced matches regardless of tracking algorithm
            if (forceMatches.length > 0) {
              matches = forceMatches;
            }
          } else {
            // Regular tracking mode (not test mode)
            // Get match quality
            const matchQuality = tracker.getDebugInfo().matchQuality || 0;
            const averageMatches = getAverageMatches(matches.length);
            
            if (isTracking) {
              // Need reasonable match quality to maintain tracking
              shouldBeTracking = matchQuality >= MAINTAIN_MATCH_QUALITY && averageMatches >= STOP_TRACKING_THRESHOLD;
            } else {
              // Need good match quality to start tracking
              shouldBeTracking = matchQuality >= MIN_MATCH_QUALITY && averageMatches >= START_TRACKING_THRESHOLD;
              
              // Add a frame delay before starting tracking to avoid flickers
              if (shouldBeTracking && !lastFrameWasTracking) {
                const newCount = trackingStartFrameCount + 1;
                setTrackingStartFrameCount(newCount);
                shouldBeTracking = newCount >= 3; // Require 3 consecutive frames
              } else if (!shouldBeTracking) {
                setTrackingStartFrameCount(0);
              }
            }
          }

          // Update last frame tracking state
          setLastFrameWasTracking(shouldBeTracking);
          
          // Tracking stability counter - ensure tracking is stable before rendering AR
          if (shouldBeTracking) {
            trackingStabilityCounter.current++;
            
            // Only set tracking confirmed after sufficient stable frames
            if (trackingStabilityCounter.current >= TRACKING_STABILITY_THRESHOLD && !trackingConfirmed) {
              console.log('Tracking confirmed after stability threshold');
              setTrackingConfirmed(true);
            }
          } else {
            // Reset stability counter when tracking is lost
            trackingStabilityCounter.current = 0;
            if (trackingConfirmed) {
              setTrackingConfirmed(false);
            }
          }

          // Only change tracking state when necessary to avoid re-renders
          if (shouldBeTracking !== isTracking) {
            console.log(`Changing tracking state to: ${shouldBeTracking ? 'TRACKED' : 'LOST'}`);
            setIsTracking(shouldBeTracking);
            
            // If we're losing tracking, immediately remove confirmation
            if (!shouldBeTracking) {
              setTrackingConfirmed(false);
              trackingStabilityCounter.current = 0;
            }
            
            // Convert trackingData.points to proper Point[] format for callback
            const targetPoints = trackingData.points.map((p: { pt: { x: number, y: number } }) => ({ 
              x: p.pt.x, 
              y: p.pt.y 
            }));
            
            // Always use the matches (forced or real) when updating
            onTrackingUpdate(shouldBeTracking, matches, frameData.points, targetPoints);
          }
          
          // Add test mode and match score to debug info
          const debugInfoWithTestMode = {
            ...tracker.getDebugInfo(),
            testMode: testMode,
            targetSize: `${trackingData.width}x${trackingData.height}`,
            targetPoints: trackingData.points.length,
            frameSize: `${currentVideo.videoWidth}x${currentVideo.videoHeight}`,
            framePoints: frameData.points.length,
            descriptorMatches: tracker.getDebugInfo().descriptorMatches || 0,
            stabilityCounter: trackingStabilityCounter.current,
            stabilityThreshold: TRACKING_STABILITY_THRESHOLD,
            patternMatchScore: lastMatchScoreRef.current,
            patternMatchThreshold: PATTERN_MATCH_THRESHOLD
          };
          
          // Draw debug visualization
          if (debugMode) {
            drawDebugView(debugCanvas, currentVideo, frameData.points, matches, debugInfoWithTestMode, MIN_MATCH_QUALITY);
          }
        }
        
        // Increment frame counter
        frameCountRef.current++;
        
        // Request next frame
        animationFrame = requestAnimationFrame(processFrame);
      } catch (error) {
        console.error('Error in processFrame:', error);
        animationFrame = requestAnimationFrame(processFrame);
      }
    };

    // Start processing frames
    processFrame();
    
    // Add keyboard listener for test mode toggle
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 't') {
        setTestMode(prev => !prev);
        console.log(`Test mode ${!testMode ? 'enabled' : 'disabled'}`);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cameraReady, videoUrl, trackingData, isTracking, onTrackingUpdate, trackingStartFrameCount, 
      lastFrameWasTracking, testMode, debugMode]);

  return (
    <div className="camera-container">
      {cameraError && (
        <div className="camera-error">
          {cameraError}
        </div>
      )}
      
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={isTracking ? 'camera-video tracking' : 'camera-video'}
      />
      
      {cameraReady && (
        <>
          <canvas ref={canvasRef} className="camera-canvas" />
          
          {/* Only show AR video when tracking is CONFIRMED */}
          {isTracking && trackingConfirmed && (
            <video 
              ref={arVideoRef}
              autoPlay
              loop
              muted
              playsInline
              src={videoUrl || ''}
              className="ar-video"
            />
          )}
          
          <canvas ref={debugCanvasRef} className="debug-canvas" />
        </>
      )}
      
      {!cameraReady && !cameraError && (
        <div className="camera-loading">
          Initializing camera...
        </div>
      )}
      
      {/* Add a visual indicator for tracking status */}
      {isTracking && !trackingConfirmed && (
        <div className="tracking-stabilizing">
          Stabilizing tracking ({trackingStabilityCounter.current}/{TRACKING_STABILITY_THRESHOLD})...
        </div>
      )}
    </div>
  );
}

function drawDebugView(
  canvas: HTMLCanvasElement, 
  video: HTMLVideoElement, 
  framePoints: Point[], 
  matches: FeatureMatch[], 
  debugInfo: any,
  minMatchQuality: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw frame points (blue)
  ctx.fillStyle = 'blue';
  for (let i = 0; i < framePoints.length; i++) {
    const point = framePoints[i];
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  
  // Draw matched points (green)
  ctx.fillStyle = 'green';
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    // Ensure the index is valid before accessing
    if (match && typeof match.queryIdx === 'number' && 
        match.queryIdx >= 0 && match.queryIdx < framePoints.length) {
      const point = framePoints[match.queryIdx];
      // Validate point has valid x,y coordinates
      if (point && typeof point.x === 'number' && typeof point.y === 'number') {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  
  // Draw match lines if we have trainIdx points
  if (matches.length > 0) {
    ctx.strokeStyle = 'green';
    ctx.lineWidth = 1;

    matches.forEach(match => {
      // Safety check to avoid undefined access
      if (!match || typeof match.queryIdx !== 'number' || 
          match.queryIdx < 0 || match.queryIdx >= framePoints.length) {
        return; // Skip this match
      }
      
      const queryPoint = framePoints[match.queryIdx];
      
      // Validate the point exists and has coordinates
      if (!queryPoint || typeof queryPoint.x !== 'number' || 
          typeof queryPoint.y !== 'number') {
        return; // Skip this point
      }
      
      // Draw a line from this point to the center to visualize tracking
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.beginPath();
      ctx.moveTo(queryPoint.x, queryPoint.y);
      ctx.lineTo(centerX, centerY);
      ctx.stroke();
    });
  }
  
  // Draw tracking status info
  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 4;
  
  // Target info
  ctx.fillText(`Target: ${debugInfo.targetSize} (${debugInfo.targetPoints} points)`, 10, 30);
  
  // Frame info
  ctx.fillText(`Frame: ${debugInfo.frameSize} (${debugInfo.framePoints} points)`, 10, 60);
  
  // Match info
  ctx.fillText(`Matches: ${matches.length} (${debugInfo.descriptorMatches || 0} total)`, 10, 90);
  
  // Match quality
  const matchQualityColor = (debugInfo.matchQuality || 0) >= minMatchQuality ? 'lime' : 'red';
  ctx.fillStyle = matchQualityColor;
  ctx.fillText(`Match Quality: ${((debugInfo.matchQuality || 0) * 100).toFixed(1)}%`, 10, 120);
  
  // Inlier ratio
  ctx.fillStyle = 'white';
  ctx.fillText(`Inlier Ratio: ${((debugInfo.inlierRatio || 0) * 100).toFixed(1)}%`, 10, 150);
  
  // Required quality threshold
  ctx.fillText(`Required: ${(minMatchQuality * 100)}%`, 10, 180);
  
  // Color score if available
  if (debugInfo.colorScore !== undefined) {
    ctx.fillText(`Color Score: ${(debugInfo.colorScore * 100).toFixed(1)}%`, 10, 210);
  }
  
  // Test mode indicator
  ctx.font = '18px Arial';
  ctx.shadowBlur = 4;
  if (debugInfo.testMode) {
    ctx.fillStyle = 'yellow';
    ctx.fillText('TEST MODE: ON', 10, 280);
    ctx.fillText('(Press \'T\' to toggle)', 10, 310);
    
    // Show when forced matches are active
    if (matches.length > 0 && matches[0].distance === 0.1) {
      ctx.fillStyle = '#ff9900';
      ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
      ctx.fillStyle = 'black';
      ctx.shadowColor = 'white';
      ctx.fillText('FORCED TRACKING ACTIVE', canvas.width/2 - 110, canvas.height - 15);
    }
  }
}

export default Camera;
