import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle, Building2, CheckCircle, Eye, EyeOff } from 'lucide-react';
import ReCAPTCHA from 'react-google-recaptcha';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';
import RecaptchaInfo from '../components/RecaptchaInfo';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const recaptchaRef = React.createRef();

  useEffect(() => {
    // Check for success message from registration
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      if (location.state?.email) {
        setFormData(prev => ({ ...prev, email: location.state.email }));
      }
      // Clear the state to prevent showing message on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    // Validate reCAPTCHA
    if (!captchaToken) {
      setError('Silakan verifikasi bahwa Anda bukan robot dengan mencentang reCAPTCHA');
      setIsLoading(false);
      return;
    }

    try {
      console.log('Mencoba login untuk:', formData.email);

      
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        throw new Error('Sistem belum dikonfigurasi. Silakan hubungi administrator untuk mengatur koneksi database.');
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
        throw signInError;
      }

      if (data.user) {
        console.log('User berhasil login:', data.user.email);
        console.log('User metadata:', data.user.user_metadata);
        
        // Fetch user profile to get role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, name, is_face_registered, status')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error:', profileError);
          // Continue without profile for now
        } else {
          console.log('User profile:', profile);
          
          // Check if user is active
          if (profile.status !== 'active') {
            await supabase.auth.signOut();
            throw new Error('Akun Anda tidak aktif. Silakan hubungi administrator.');
          }
        }
        
        // Log activity
        try {
          await supabase.from('activity_logs').insert([{
            user_id: data.user.id,
            action_type: 'login',
            action_details: {
              email: data.user.email,
              role: profile?.role || 'unknown',
              timestamp: new Date().toISOString()
            },
            ip_address: 'unknown',
            user_agent: navigator.userAgent
          }]);
        } catch (logError) {
          console.error('Failed to log activity:', logError);
        }
        
        // Update last login
        try {
          await supabase
            .from('profiles')
            .update({ 
              last_login: new Date().toISOString(),
              device_info: {
                user_agent: navigator.userAgent,
                timestamp: new Date().toISOString()
              }
            })
            .eq('id', data.user.id);
        } catch (updateError) {
          console.error('Failed to update last login:', updateError);
        }
        
        // Navigate to dashboard
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Login error:', err);
      let errorMessage = 'Terjadi kesalahan saat login';
      
      if (err.message === 'Invalid login credentials') {
        errorMessage = 'Email atau password salah';
      } else if (err.message.includes('Email not confirmed')) {
        errorMessage = 'Email belum dikonfirmasi. Silakan cek email Anda.';
      } else if (err.message.includes('Too many requests')) {
        errorMessage = 'Terlalu banyak percobaan login. Silakan coba lagi nanti.';
      } else if (err.message.includes('Sistem belum dikonfigurasi')) {
        errorMessage = 'Sistem belum dikonfigurasi. Silakan hubungi administrator untuk mengatur koneksi database.';
      } else if (err.message.includes('Akun Anda tidak aktif')) {
        errorMessage = err.message;
      } else {
        errorMessage = err.message || 'Terjadi kesalahan saat login';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  const handleCaptchaChange = (token) => {
    setCaptchaToken(token);
  };

  const handleCaptchaExpired = () => {
    setCaptchaToken(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-6 shadow-lg">
            <Building2 className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Portal Karyawan</h1>
          <p className="text-blue-100">Masuk untuk mengakses sistem absensi</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-2xl p-8 backdrop-blur-sm">
          <div className="flex items-center space-x-2 mb-6">
            <LogIn className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Masuk</h2>
          </div>

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-700 font-medium">Berhasil!</p>
                <p className="text-green-600 text-sm mt-1">{successMessage}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-700 font-medium">Login Gagal</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Supabase Configuration Warning */}
          {!isSupabaseConfigured() && (
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-800 font-medium">Sistem Belum Dikonfigurasi</p>
                <p className="text-yellow-700 text-sm mt-1">
                  Database belum terhubung. Silakan hubungi administrator untuk mengatur koneksi Supabase.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Masukkan email Anda"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Masukkan password Anda"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex justify-center">
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"} // Fallback to test key if not configured
                  onChange={handleCaptchaChange}
                  onExpired={handleCaptchaExpired}
                  theme="light"
                />
              </div>
            </div>
            
            <RecaptchaInfo />

            <button
              type="submit"
              disabled={isLoading || !isSupabaseConfigured() || !captchaToken}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="inline-flex space-x-1">
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span>Sedang Masuk...</span>
                </div>
              ) : (
                'Masuk'
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              Belum punya akun? <Link to="/register" className="text-blue-600 hover:underline font-medium">Daftar di sini</Link>
            </p>
          </div>

         
        </div>

        {/* Database Export Info */}
     
      </div>
    </div>
  );
};

export default Login;