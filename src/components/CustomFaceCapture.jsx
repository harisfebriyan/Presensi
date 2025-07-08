import React, { useRef, useEffect, useState } from 'react';
import { Camera, CameraOff, CheckCircle, XCircle, AlertTriangle, Eye, Sun, Moon } from 'lucide-react';
import { processImageBlob, detectFacePattern, extractFaceRegion } from '../utils/customFaceRecognition';

const CustomFaceCapture = ({ onFaceCapture, isCapturing = false }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceQuality, setFaceQuality] = useState(0);
  const [captureCountdown, setCaptureCountdown] = useState(null);
  const [showInstructions, setShowInstructions] = useState(true);
  const [lastFeedbackTime, setLastFeedbackTime] = useState(0);
  const [lightingFeedback, setLightingFeedback] = useState(null);
  const [brightness, setBrightness] = useState(0);

  useEffect(() => {
    initializeCamera();
    return () => cleanup();
  }, []);

  const initializeCamera = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh browser ini');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 }, 
          facingMode: 'user' 
        },
        audio: false
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
    
    if (!video || !canvas) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    startFaceDetection();
  };

  const startFaceDetection = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Draw current frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Extract face region for analysis
        const faceData = extractFaceRegion(canvas);
        if (faceData) {
          const hasValidFace = detectFacePattern(faceData);
          
          // If face status changes from not detected to detected
          if (!faceDetected && hasValidFace) {
            playSimpleBeep();
          }
          
          setFaceDetected(hasValidFace);
          
          // Calculate face quality based on brightness and contrast
          const quality = calculateImageQuality(faceData);
          setFaceQuality(quality);
          
          // Calculate brightness
          const avgBrightness = calculateBrightness(faceData);
          setBrightness(avgBrightness);
          
          // Provide lighting feedback
          const now = Date.now();
          if (now - lastFeedbackTime > 3000) { // Only provide feedback every 3 seconds
            if (avgBrightness < 70) {
              setLightingFeedback('low');
              playSimpleBeep();
            } else if (avgBrightness > 200) {
              setLightingFeedback('high');
              playSimpleBeep();
            } else {
              setLightingFeedback(null);
            }
            setLastFeedbackTime(now);
          }
          
          // Auto-capture if face is good quality for 3 seconds
          if (hasValidFace && quality >= 10 && captureCountdown === null) {
            setCaptureCountdown(3);
            playSimpleBeep();
          } else if ((!hasValidFace || quality < 5) && captureCountdown !== null) {
            setCaptureCountdown(null);
          }
        } else {
          setFaceDetected(false);
          setFaceQuality(0);
          setBrightness(0);
          if (captureCountdown !== null) {
            setCaptureCountdown(null);
          }
        }
      } catch (error) {
        console.error('Face detection error:', error);
        setFaceDetected(false);
        setFaceQuality(0);
        setBrightness(0);
      }
    }, 200);
  };

  useEffect(() => {
    let timer;
    if (captureCountdown !== null && captureCountdown > 0) {
      timer = setTimeout(() => {
        setCaptureCountdown(prev => prev - 1);
        playSimpleBeep();
      }, 1000);
    } else if (captureCountdown === 0) {
      capturePhoto();
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [captureCountdown]);

  const calculateImageQuality = (imageData) => {
    const { data } = imageData;
    let brightness = 0;
    let contrast = 0;
    const pixelCount = data.length / 4;
    
    // Calculate average brightness
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      brightness += gray;
    }
    brightness /= pixelCount;
    
    // Calculate contrast (standard deviation)
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      contrast += Math.pow(gray - brightness, 2);
    }
    contrast = Math.sqrt(contrast / pixelCount);
    
    // Quality score (0-100)
    const brightnessScore = brightness > 50 && brightness < 200 ? 50 : Math.max(0, 50 - Math.abs(brightness - 125));
    const contrastScore = Math.min(50, contrast);
    
    return Math.round(brightnessScore + contrastScore);
  };

  const calculateBrightness = (imageData) => {
    const { data } = imageData;
    let brightness = 0;
    const pixelCount = data.length / 4;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      brightness += gray;
    }
    
    return Math.round(brightness / pixelCount);
  };

  const playSimpleBeep = () => {
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 800; // frequency in hertz
      
      gainNode.gain.value = 0.1; // volume (0-1)
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
      }, 100); // beep duration in milliseconds
    } catch (e) {
      console.log('Error playing beep:', e);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !faceDetected) {
      setError('Tidak ada wajah yang terdeteksi. Silakan posisikan wajah Anda di kamera.');
      playSimpleBeep();
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setError('Gagal mengambil foto. Silakan coba lagi.');
          playSimpleBeep();
          return;
        }
        
        try {
          // Process the image and generate fingerprint
          const result = await processImageBlob(blob);
          
          if (!result.isValidFace) {
            setError('Wajah tidak terdeteksi dengan baik. Silakan coba lagi dengan posisi yang lebih baik.');
            playSimpleBeep();
            return;
          }
          
          console.log('✅ Face captured successfully with fingerprint');
          playSimpleBeep();
          
          if (onFaceCapture) {
            onFaceCapture(blob, result.fingerprint);
          }
          
          // Reset countdown
          setCaptureCountdown(null);
          
        } catch (err) {
          console.error('Face processing error:', err);
          setError(err.message || 'Gagal memproses foto wajah. Silakan coba lagi.');
          playSimpleBeep();
        }
      }, 'image/jpeg', 0.8);
      
    } catch (err) {
      console.error('Photo capture error:', err);
      setError(err.message || 'Gagal mengambil foto. Silakan coba lagi.');
      playSimpleBeep();
    }
  };

  const getFaceStatusMessage = () => {
    if (captureCountdown !== null) return `Foto dalam ${captureCountdown}...`;
    if (!faceDetected) return 'Posisikan wajah di dalam bingkai';
    if (faceQuality < 10) return `Kualitas kurang baik (${faceQuality}%)`;
    if (faceQuality < 15) return `Kualitas cukup (${faceQuality}%)`;
    return `Wajah terdeteksi - Kualitas: ${faceQuality}%`;
  };

  const getFaceStatusColor = () => {
    if (captureCountdown !== null) return 'bg-blue-600';
    if (!faceDetected) return 'bg-red-600';
    if (faceQuality < 10) return 'bg-red-600';
    if (faceQuality < 15) return 'bg-yellow-600';
    return 'bg-green-600';
  };

  const getFaceStatusIcon = () => {
    if (captureCountdown !== null) return <CheckCircle className="h-4 w-4" />;
    if (!faceDetected) return <XCircle className="h-4 w-4" />;
    if (faceQuality < 10) return <XCircle className="h-4 w-4" />;
    if (faceQuality < 15) return <AlertTriangle className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  const getLightingFeedback = () => {
    if (lightingFeedback === 'low') {
      return (
        <div className="absolute top-16 left-4 right-4 bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm animate-pulse">
          <div className="flex items-center space-x-2">
            <Moon className="h-4 w-4" />
            <span>Pencahayaan terlalu gelap! Tambahkan cahaya.</span>
          </div>
        </div>
      );
    } else if (lightingFeedback === 'high') {
      return (
        <div className="absolute top-16 left-4 right-4 bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm animate-pulse">
          <div className="flex items-center space-x-2">
            <Sun className="h-4 w-4" />
            <span>Pencahayaan terlalu terang! Kurangi cahaya.</span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600 text-center">Memuat kamera...</p>
        <p className="text-sm text-gray-500 mt-2">
          Pastikan izin kamera telah diberikan
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
          onClick={initializeCamera}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Instructions Overlay - shown initially */}
      {showInstructions && (
        <div className="absolute inset-0 z-20 bg-black bg-opacity-70 flex items-center justify-center rounded-lg">
          <div className="bg-white p-6 rounded-lg max-w-md text-center">
            <Camera className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-3">Petunjuk Verifikasi Wajah</h3>
            <div className="space-y-3 text-left mb-6">
              <p className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                <span>Posisikan wajah Anda di tengah bingkai</span>
              </p>
              <p className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                <span>Pastikan pencahayaan cukup terang</span>
              </p>
              <p className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                <span>Hindari menggunakan masker atau kacamata gelap</span>
              </p>
              <p className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                <span>Sistem akan otomatis mengambil foto saat wajah terdeteksi dengan baik</span>
              </p>
            </div>
            <button
              onClick={() => {
                setShowInstructions(false);
                playSimpleBeep();
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Mulai Verifikasi
            </button>
          </div>
        </div>
      )}

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
        
        {/* Lighting feedback */}
        {getLightingFeedback()}
        
        {/* Face detection guide frame */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute inset-4 border-2 rounded-lg transition-colors ${
            faceDetected 
              ? faceQuality >= 15 ? 'border-green-400' : faceQuality >= 10 ? 'border-yellow-400' : 'border-red-400'
              : 'border-white/50'
          }`}>
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white"></div>
          </div>
        </div>
        
        {/* Center guide for face positioning */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-48 h-64 border-2 rounded-lg transition-colors ${
            faceDetected 
              ? faceQuality >= 15 ? 'border-green-400' : faceQuality >= 10 ? 'border-yellow-400' : 'border-red-400'
              : 'border-white/30'
          }`}>
            <div className="flex items-center justify-center h-full">
              <Eye className={`h-8 w-8 ${
                faceDetected 
                  ? faceQuality >= 15 ? 'text-green-400' : faceQuality >= 10 ? 'text-yellow-400' : 'text-red-400'
                  : 'text-white/50'
              }`} />
            </div>
          </div>
        </div>
        
        {/* Countdown overlay */}
        {captureCountdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-4xl font-bold animate-pulse">
              {captureCountdown}
            </div>
          </div>
        )}
        
        {/* Quality indicator */}
        {faceDetected && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-black/50 rounded-lg p-2">
              <div className="flex items-center justify-between text-white text-sm mb-1">
                <span>Kualitas Foto</span>
                <span>{faceQuality}%</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all ${
                    faceQuality >= 15 ? 'bg-green-500' :
                    faceQuality >= 10 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.max(faceQuality, 10)}%` }}
                />
              </div>
              
              {/* Brightness indicator */}
              <div className="flex items-center justify-between text-white text-sm mt-2 mb-1">
                <span>Pencahayaan</span>
                <div className="flex items-center">
                  {brightness < 70 ? <Moon className="h-3 w-3 mr-1 text-blue-300" /> : 
                   brightness > 200 ? <Sun className="h-3 w-3 mr-1 text-yellow-300" /> : 
                   <CheckCircle className="h-3 w-3 mr-1 text-green-300" />}
                  <span>{brightness < 70 ? 'Terlalu Gelap' : 
                         brightness > 200 ? 'Terlalu Terang' : 
                         'Baik'}</span>
                </div>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all ${
                    brightness < 70 ? 'bg-blue-500' :
                    brightness > 200 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(Math.max(brightness / 2.55, 10), 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Capture button */}
      <div className="mt-4 text-center">
        <button
          onClick={capturePhoto}
          disabled={!faceDetected || isCapturing}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            faceDetected && !isCapturing
              ? faceQuality >= 10 
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl'
                : 'bg-yellow-600 text-white hover:bg-yellow-700 shadow-lg hover:shadow-xl'
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
          Posisikan wajah dalam bingkai dan pastikan pencahayaan yang baik
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {faceQuality < 10 
            ? "Kualitas gambar terlalu rendah, perbaiki pencahayaan" 
            : faceQuality < 15
              ? "Kualitas cukup, tapi bisa ditingkatkan" 
              : "Kualitas gambar sangat baik"}
        </p>
      </div>
    </div>
  );
};

export default CustomFaceCapture;