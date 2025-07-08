import React, { useRef, useEffect, useState } from 'react';
import { Camera, CameraOff, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { loadFaceModels, getFaceDescriptor, detectFaceCount } from '../utils/faceModels';

const FaceCapture = ({ onFaceCapture, isCapturing = false }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  const [modelsReady, setModelsReady] = useState(false);

  useEffect(() => {
    initializeSystem();
    return () => cleanup();
  }, []);

  const initializeSystem = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load AI models first
      console.log('Loading face recognition models...');
      await loadFaceModels();
      setModelsReady(true);
      console.log('✅ Models loaded, initializing camera...');
      
      // Then initialize camera
      await initializeCamera();
      
    } catch (err) {
      console.error('System initialization error:', err);
      setError(err.message || 'Gagal menginisialisasi sistem pengenalan wajah');
      setIsLoading(false);
    }
  };

  const initializeCamera = async () => {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh browser ini');
      }
      
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 }, 
          facingMode: 'user' 
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setIsLoading(false);
      
    } catch (err) {
      console.error('Camera initialization error:', err);
      let errorMessage = 'Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Akses kamera ditolak. Silakan izinkan akses kamera dan refresh halaman.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage = 'Kamera tidak didukung oleh browser ini.';
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const cleanup = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleVideoPlay = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || !modelsReady) return;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Start face detection loop
    startFaceDetection();
  };

  const startFaceDetection = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !modelsReady) return;
      
      try {
        const count = await detectFaceCount(videoRef.current);
        setFaceCount(count);
        setFaceDetected(count === 1); // Exactly one face should be detected
      } catch (error) {
        console.error('Face detection error:', error);
        setFaceDetected(false);
        setFaceCount(0);
      }
    }, 500); // Check every 500ms
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !faceDetected || !modelsReady) {
      setError('Tidak ada wajah yang terdeteksi atau sistem belum siap. Silakan posisikan wajah Anda di kamera.');
      return;
    }

    if (faceCount !== 1) {
      setError(`Terdeteksi ${faceCount} wajah. Pastikan hanya ada 1 wajah di kamera.`);
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get face descriptor from current frame
      const descriptor = await getFaceDescriptor(video);
      
      if (!descriptor) {
        throw new Error('Gagal mendapatkan data wajah. Silakan coba lagi.');
      }
      
      // Convert canvas to blob
      canvas.toBlob((blob) => {
        if (blob && onFaceCapture) {
          console.log('✅ Face captured successfully with descriptor');
          onFaceCapture(blob, descriptor);
        } else {
          setError('Gagal mengambil foto. Silakan coba lagi.');
        }
      }, 'image/jpeg', 0.8);
      
    } catch (err) {
      console.error('Photo capture error:', err);
      setError(err.message || 'Gagal mengambil foto. Silakan coba lagi.');
    }
  };

  const getFaceStatusMessage = () => {
    if (!modelsReady) return 'Memuat model AI...';
    if (faceCount === 0) return 'Tidak ada wajah terdeteksi';
    if (faceCount === 1) return 'Wajah terdeteksi';
    return `${faceCount} wajah terdeteksi - hanya 1 yang diizinkan`;
  };

  const getFaceStatusColor = () => {
    if (!modelsReady) return 'bg-yellow-600';
    if (faceCount === 1) return 'bg-green-600';
    return 'bg-red-600';
  };

  const getFaceStatusIcon = () => {
    if (!modelsReady) return <AlertTriangle className="h-4 w-4" />;
    if (faceCount === 1) return <CheckCircle className="h-4 w-4" />;
    return <XCircle className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600 text-center">
          {modelsReady ? 'Memuat kamera...' : 'Memuat model AI pengenalan wajah...'}
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Proses ini mungkin memakan waktu beberapa detik
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-lg">
        <CameraOff className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600 text-center mb-4">{error}</p>
        <button
          onClick={initializeSystem}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Coba Lagi
        </button>
        
        {error.includes('model') && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-700">
              <strong>Catatan:</strong> Pastikan file model AI telah didownload ke folder /public/models/
            </p>
            <p className="text-xs text-yellow-600 mt-1">
              Download dari: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={handleVideoPlay}
          className="w-full h-auto max-w-md mx-auto"
        />
        
        {/* Face detection status overlay */}
        <div className="absolute top-4 right-4">
          <div className={`flex items-center space-x-2 text-white px-3 py-1 rounded-full ${getFaceStatusColor()}`}>
            {getFaceStatusIcon()}
            <span className="text-sm">{getFaceStatusMessage()}</span>
          </div>
        </div>
        
        {/* Face detection guide frame */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-4 border-2 border-white/50 rounded-lg">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white"></div>
          </div>
        </div>
        
        {/* Center guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-64 border-2 border-white/30 rounded-lg"></div>
        </div>
      </div>
      
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Capture button */}
      <div className="mt-4 text-center">
        <button
          onClick={capturePhoto}
          disabled={!faceDetected || isCapturing || faceCount !== 1}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            faceDetected && !isCapturing && faceCount === 1
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Camera className="h-5 w-5" />
            <span>{isCapturing ? 'Memproses...' : 'Ambil Foto'}</span>
          </div>
        </button>
      </div>
      
      <div className="mt-3 text-center">
        <p className="text-sm text-gray-600">
          Posisikan wajah Anda dalam bingkai dan pastikan pencahayaan yang baik
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Hanya 1 wajah yang boleh terdeteksi untuk keamanan
        </p>
      </div>
    </div>
  );
};

export default FaceCapture;