import { useState } from 'react'
import './App.css'

interface TrackingData {
  width: number;
  height: number;
  features: number;
  points: Array<{
    pt: { x: number; y: number };
    size: number;
    angle: number;
    response: number;
    octave: number;
  }>;
}

function App() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));
    setIsLoading(true);
    setTrackingData(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.success) {
        console.log('Tracking data received:', data.trackingData);
        setTrackingData(data.trackingData);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to process image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-bold mb-5">Image Tracker</h1>
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <div className="flex flex-col items-center space-y-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />

                  {previewUrl && (
                    <div className="relative w-full max-w-md">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full object-contain rounded-lg"
                        style={{ maxHeight: '400px' }}
                      />
                      {trackingData && (
                        <svg 
                          className="absolute top-0 left-0 w-full h-full"
                          viewBox={`0 0 ${trackingData.width} ${trackingData.height}`}
                          preserveAspectRatio="none"
                        >
                          {trackingData.points.map((point, index) => (
                            <circle
                              key={index}
                              cx={point.pt.x}
                              cy={point.pt.y}
                              r="2"
                              fill="red"
                              opacity="0.5"
                            />
                          ))}
                        </svg>
                      )}
                    </div>
                  )}

                  {isLoading && (
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                      <p className="mt-2 text-sm text-gray-500">Processing image...</p>
                    </div>
                  )}

                  {trackingData && (
                    <div className="bg-gray-50 p-4 rounded mt-4 w-full">
                      <h3 className="font-semibold mb-2">Tracking Information:</h3>
                      <ul className="space-y-1 text-sm text-gray-600">
                        <li>Image Size: {trackingData.width}x{trackingData.height}px</li>
                        <li>Features Detected: {trackingData.features}</li>
                        <li>Feature Points: {trackingData.points.length}</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
