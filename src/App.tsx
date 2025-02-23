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
            imageUrl: result.imageUrl // Use the URL from the server response
          };

          console.log('Setting tracking data:', newTrackingData);
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

  return (
    <div className="h-screen bg-zinc-900 text-white overflow-hidden">
      {!showCamera ? (
        <div className="h-full max-w-6xl mx-auto px-6 py-6 flex flex-col">
          {/* Header Section - smaller and fixed height */}
          <div className="mb-6 text-center flex-shrink-0">
            <h1 className="text-6xl font-black tracking-tighter mb-2">
              QR<span className="text-emerald-400">XR</span>
            </h1>
            <div className="flex items-center justify-center gap-4">
              <div className="h-[2px] w-24 bg-emerald-400"></div>
              <p className="text-zinc-400 text-lg">Augmented Reality QR Generator</p>
              <div className="h-[2px] w-24 bg-emerald-400"></div>
            </div>
          </div>

          {/* Main Content Grid - with flex and overflow handling */}
          <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr_auto] gap-4">
            {/* Upload Section - fixed height */}
            <div className="border border-zinc-700 bg-zinc-800/50 backdrop-blur p-6 rounded-xl">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-4">
                <span className="text-emerald-400">01</span>
                Upload Reference Image
              </h2>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full border-2 border-zinc-700 p-3 rounded-lg
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-bold
                  file:bg-emerald-400 file:text-black
                  hover:file:bg-emerald-300
                  cursor-pointer bg-zinc-800"
              />
            </div>

            {/* Preview Section - flexible height with overflow */}
            <div className="border border-zinc-700 bg-zinc-800/50 backdrop-blur p-6 rounded-xl overflow-hidden">
              <h2 className="text-xl font-bold mb-3 flex items-center gap-4">
                <span className="text-emerald-400">02</span>
                Preview
              </h2>
              <div className="relative h-[calc(100%-3rem)]">
                <canvas 
                  ref={previewCanvasRef}
                  className="w-full h-full object-contain rounded-lg border border-zinc-700"
                />
                <div className="absolute inset-0 grid grid-cols-6 pointer-events-none opacity-10">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="border-l border-emerald-400 last:border-r h-full" />
                  ))}
                </div>
              </div>
            </div>

            {/* Features Section - fixed height */}
            {trackingData && (
              <div className="border border-zinc-700 bg-zinc-800/50 backdrop-blur p-6 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold mb-1 flex items-center gap-4">
                      <span className="text-emerald-400">03</span>
                      Features Detected
                    </h2>
                    <div className="text-3xl font-black text-emerald-400">
                      {trackingData.features.length}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCamera(true)}
                    className="bg-emerald-400 text-black px-6 py-3 rounded-xl
                      font-bold text-base hover:bg-emerald-300
                      transition-all duration-200 hover:scale-105"
                  >
                    Start AR Tracking →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative h-screen">
          <Camera 
            trackingData={trackingData!}
            onTrackingUpdate={(isTracking) => {
              console.log('Tracking status:', isTracking);
            }}
            videoUrl="/videos/sneakarvid.mp4"
          />
          <button
            onClick={() => {
              setShowCamera(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              if (previewCanvasRef.current) {
                const ctx = previewCanvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
              }
            }}
            className="absolute top-6 right-6 bg-emerald-400 text-black 
              px-6 py-3 rounded-xl font-bold hover:bg-emerald-300
              transition-all duration-200 hover:scale-105"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
