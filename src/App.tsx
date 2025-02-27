import { useState, useRef, useEffect } from 'react'
import './App.css'
import Camera from './components/Camera'
import { TrackingData } from './types/tracking'
import { FrameProcessor } from './utils/frameProcessor'

function App() {
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Debug mount
  useEffect(() => {
    console.log('App mounted');
  }, []);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleImageUpload called');
    
    const file = event.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    try {
      // First, create FormData to send the file
      const formData = new FormData();
      formData.append('image', file);

      // Send to server using relative URL
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);

      // Create an image element to load the file
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      console.log('Created object URL:', objectUrl);
      
      img.onload = async () => {
        console.log('Image loaded:', {
          width: img.width,
          height: img.height,
          src: img.src
        });

        try {
          // Process the image to get feature points with descriptors
          const frameProcessor = new FrameProcessor();
          console.log('Processing image...');
          const features = await frameProcessor.processImage(img);
          console.log('Features detected:', features.length);

          // Preview the features
          if (previewCanvasRef.current) {
            console.log('Drawing preview...');
            const ctx = previewCanvasRef.current.getContext('2d')!;
            previewCanvasRef.current.width = img.width;
            previewCanvasRef.current.height = img.height;
            
            // Draw the original image
            ctx.drawImage(img, 0, 0);
            
            // Draw feature points
            ctx.fillStyle = 'red';
            features.forEach(feature => {
              ctx.beginPath();
              ctx.arc(feature.pt.x, feature.pt.y, 3, 0, Math.PI * 2);
              ctx.fill();
            });

            console.log('Preview rendered');
          } else {
            console.log('Preview canvas not found');
          }

          // Create tracking data using the uploaded URL from the server
          const newTrackingData: TrackingData = {
            width: img.width,
            height: img.height,
            features: features,
            points: features.map(f => ({ pt: f.pt })),
            imageUrl: result.imageUrl // This will be used by the tracker now
          };

          console.log('Setting tracking data with image URL:', result.imageUrl);
          setTrackingData(newTrackingData);
        } catch (error) {
          console.error('Error processing image:', error);
        }
      };

      img.onerror = (error) => {
        console.error('Error loading image:', error);
      };

      img.src = objectUrl;
    } catch (error) {
      console.error('Error in handleImageUpload:', error);
    }
  };

  // Debug render
  console.log('Rendering App:', {
    hasTrackingData: !!trackingData,
    showCamera,
    hasFileInput: !!fileInputRef.current,
    hasPreviewCanvas: !!previewCanvasRef.current
  });

  if (!showCamera) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl w-full">
          <h1 className="text-2xl font-bold mb-4">Image Tracker Setup</h1>
          <p className="mb-4 text-gray-600">
            First, take a screenshot of the image you want to track and upload it here:
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            onClick={() => console.log('File input clicked')}
            className="block w-full text-sm text-gray-500 
              file:mr-4 file:py-2 file:px-4 
              file:rounded-full file:border-0 
              file:text-sm file:font-semibold 
              file:bg-blue-50 file:text-blue-700 
              hover:file:bg-blue-100"
          />
          
          {/* Preview canvas */}
          <canvas 
            ref={previewCanvasRef}
            className="mt-4 max-w-full h-auto border border-gray-300"
          />
          
          {trackingData && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                Found {trackingData.features.length} features in the image.
              </p>
              <button
                onClick={() => {
                  console.log('Starting camera...');
                  setShowCamera(true);
                }}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Start Camera Tracking
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!trackingData) {
    return <div>Processing image...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Camera 
        trackingData={trackingData}
        onTrackingUpdate={(isTracking) => {
          console.log('Tracking status:', isTracking);
        }}
        videoUrl="/videos/sneakarvid.mp4"
      />
      <button
        onClick={() => {
          console.log('Going back...');
          setShowCamera(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          if (previewCanvasRef.current) {
            const ctx = previewCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
          }
        }}
        className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded"
      >
        Back
      </button>
    </div>
  );
}

export default App;
