import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, 
  Calendar, 
  MapPin, 
  User, 
  LogOut, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  BarChart3,
  Settings,
  Camera,
  Edit,
  DollarSign,
  TrendingUp,
  Bell
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import AttendanceForm from '../components/AttendanceForm';
import NotificationSystem from '../components/NotificationSystem';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState([]);
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [salaryInfo, setSalaryInfo] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [stats, setStats] = useState({
    thisMonth: 0,
    onTime: 0,
    late: 0,
    totalHours: 0,
    expectedSalary: 0,
    currentMonthSalary: 0,
    dailySalaryEarned: 0
  });
  const [loading, setLoading] = useState(true);
  const [showAttendanceForm, setShowAttendanceForm] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Memoize expensive calculations
  const isAdmin = useMemo(() => profile?.role === 'admin', [profile?.role]);

  const checkUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      setUser(user);
      
      // Update last login
      await supabase
        .from('profiles')
        .update({ 
          last_login: new Date().toISOString(),
          device_info: {
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
        .eq('id', user.id);
      
      // Fetch data in parallel for better performance
      await Promise.all([
        fetchUserProfile(user.id),
        fetchAttendanceData(user.id),
        fetchSalaryInfo(user.id),
        fetchWarnings(user.id)
      ]);
    } catch (error) {
      console.error('Error checking user:', error);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const fetchUserProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          positions(name_id, department, base_salary)
        `)
        .eq('id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Profile fetch error:', error);
        throw error;
      }

      if (data) {
        setProfile(data);
        
        // Redirect admin to admin panel
        if (data.role === 'admin') {
          navigate('/admin');
          return;
        }
      } else {
        // Create default profile if not exists
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          const defaultProfile = {
            id: userId,
            name: authUser.user.email.split('@')[0],
            full_name: authUser.user.email.split('@')[0],
            email: authUser.user.email,
            role: 'karyawan',
            title: 'Karyawan',
            bio: 'Karyawan sistem absensi',
            department: 'General',
            employee_id: `EMP${Date.now().toString().slice(-6)}`,
            status: 'active',
            salary: 3500000,
            join_date: new Date().toISOString().split('T')[0],
            contract_start_date: new Date().toISOString().split('T')[0],
            contract_type: 'permanent',
            is_face_registered: false
          };

          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([defaultProfile])
            .select()
            .maybeSingle();
          
          if (!insertError && newProfile) {
            setProfile(newProfile);
          }
        }
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  }, [navigate]);

  const fetchSalaryInfo = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('employee_salaries')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Salary fetch error:', error);
      } else if (data) {
        setSalaryInfo(data);
      }
    } catch (error) {
      console.error('Error fetching salary info:', error);
    }
  }, []);

  const fetchWarnings = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('attendance_warnings')
        .select('*')
        .eq('user_id', userId)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setWarnings(data || []);
    } catch (error) {
      console.error('Error fetching warnings:', error);
    }
  }, []);

  const fetchAttendanceData = useCallback(async (userId) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if already checked in/out today
      const [todayResult, recentResult] = await Promise.all([
        supabase
          .from('attendance')
          .select('*')
          .eq('user_id', userId)
          .gte('timestamp', `${today}T00:00:00`)
          .lte('timestamp', `${today}T23:59:59`)
          .order('timestamp', { ascending: false }),
        
        supabase
          .from('attendance')
          .select('*')
          .eq('user_id', userId)
          .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('timestamp', { ascending: false })
          .limit(10)
      ]);

      if (todayResult.error) throw todayResult.error;
      if (recentResult.error) throw recentResult.error;

      setTodayAttendance(todayResult.data || []);
      setRecentAttendance(recentResult.data || []);

      // Calculate stats
      calculateStats(recentResult.data || [], todayResult.data || []);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  }, []);

  const calculateStats = useCallback((attendanceData, todayData) => {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    
    const monthlyData = attendanceData.filter(record => 
      new Date(record.timestamp) >= thisMonth && record.status === 'berhasil'
    );

    const onTimeData = monthlyData.filter(record => 
      record.type === 'masuk' && !record.is_late
    );

    const lateData = monthlyData.filter(record => 
      record.type === 'masuk' && record.is_late
    );

    const workDays = monthlyData.filter(r => r.type === 'masuk').length;
    
    // Calculate expected salary
    let expectedSalary = 0;
    if (salaryInfo) {
      expectedSalary = salaryInfo.daily_salary * 22;
    } else if (profile?.salary) {
      expectedSalary = profile.salary;
    }

    // Calculate current month salary based on attendance
    const currentMonthSalary = profile?.salary ? (profile.salary / 22 * workDays) : 0;
    
    // Calculate today's earned salary
    const todayEarned = todayData
      .filter(r => r.type === 'masuk' && r.status === 'berhasil')
      .reduce((sum, r) => sum + (r.daily_salary_earned || 0), 0);

    setStats({
      thisMonth: workDays,
      onTime: onTimeData.length,
      late: lateData.length,
      totalHours: Math.round(monthlyData.length * 8 / 2),
      expectedSalary,
      currentMonthSalary,
      dailySalaryEarned: todayEarned
    });
  }, [salaryInfo, profile?.salary]);

  const handleLogout = useCallback(async () => {
    try {
      // Log activity
      if (user) {
        await supabase.from('activity_logs').insert([{
          user_id: user.id,
          action_type: 'logout',
          action_details: {
            timestamp: new Date().toISOString()
          },
          user_agent: navigator.userAgent
        }]);
      }
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
    
    await supabase.auth.signOut();
    navigate('/login');
  }, [user, navigate]);

  const handleAttendanceSubmitted = useCallback((newRecord) => {
    setTodayAttendance(prev => [newRecord, ...prev]);
    setShowAttendanceForm(false);
    if (user) {
      fetchAttendanceData(user.id);
    }
  }, [user, fetchAttendanceData]);

  const handleAttendanceClick = useCallback(() => {
    if (!profile?.is_face_registered) {
      setShowProfileModal(true);
      return;
    }

    // Check if already checked in/out today
    const hasCheckedIn = todayAttendance.some(r => r.type === 'masuk' && r.status === 'berhasil');
    const hasCheckedOut = todayAttendance.some(r => r.type === 'keluar' && r.status === 'berhasil');

    if (hasCheckedIn && hasCheckedOut) {
      alert('Anda sudah melakukan absensi masuk dan keluar hari ini.');
      return;
    }

    setShowAttendanceForm(true);
  }, [profile?.is_face_registered, todayAttendance]);

  // Memoize utility functions
  const getStatusColor = useCallback((status) => {
    switch (status) {
      case 'berhasil':
        return 'text-green-600 bg-green-100';
      case 'wajah_tidak_valid':
        return 'text-red-600 bg-red-100';
      case 'lokasi_tidak_valid':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  }, []);

  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'berhasil':
        return <CheckCircle className="h-4 w-4" />;
      case 'wajah_tidak_valid':
      case 'lokasi_tidak_valid':
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  }, []);

  const getRoleDisplayName = useCallback((role) => {
    switch (role) {
      case 'karyawan':
        return 'Karyawan';
      case 'admin':
        return 'Administrator';
      default:
        return 'Karyawan';
    }
  }, []);

  const getRoleColor = useCallback((role) => {
    switch (role) {
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  }, []);

  const getWarningColor = useCallback((level) => {
    switch (level) {
      case 1:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 2:
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 3:
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }, []);

  const formatTime = useCallback((timestamp) => {
    return new Date(timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const formatDate = useCallback((timestamp) => {
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }, []);

  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  }, []);

  // Check attendance status for today
  const hasCheckedIn = todayAttendance.some(r => r.type === 'masuk' && r.status === 'berhasil');
  const hasCheckedOut = todayAttendance.some(r => r.type === 'keluar' && r.status === 'berhasil');
  const canAttend = !hasCheckedIn || (hasCheckedIn && !hasCheckedOut);

  // Show loading spinner with better UX
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex space-x-1 text-blue-600">
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-gray-600 mt-4">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Selamat Datang, {profile?.full_name || profile?.name || 'Karyawan'}
                </h1>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(profile?.role)}`}>
                    {getRoleDisplayName(profile?.role)}
                  </span>
                  {profile?.positions?.name_id && (
                    <span className="text-sm text-gray-600">• {profile.positions.name_id}</span>
                  )}
                  {profile?.positions?.department && (
                    <span className="text-sm text-gray-600">• {profile.positions.department}</span>
                  )}
                  {profile?.employee_id && (
                    <span className="text-sm text-gray-500">• ID: {profile.employee_id}</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Notification System */}
              <NotificationSystem userId={user?.id} userRole={profile?.role} />
              
              <button
                onClick={() => navigate('/profile-setup')}
                className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <Edit className="h-4 w-4 inline mr-2" />
                Profil
              </button>
              <button
                onClick={() => navigate('/history')}
                className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <BarChart3 className="h-4 w-4 inline mr-2" />
                Riwayat
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4 inline mr-2" />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Warning */}
        {!profile?.is_face_registered && (
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-yellow-800 font-medium">Profil Belum Lengkap</p>
                <p className="text-yellow-700 text-sm mt-1">
                  Anda perlu menambahkan foto wajah untuk dapat melakukan absensi dengan verifikasi wajah.
                </p>
                <button
                  onClick={() => navigate('/profile-setup')}
                  className="mt-2 text-sm text-yellow-800 underline hover:text-yellow-900"
                >
                  Lengkapi Profil Sekarang
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Warnings Alert */}
        {warnings.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-start space-x-3">
              <Bell className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-800 font-medium">Peringatan Aktif ({warnings.length})</p>
                <div className="mt-2 space-y-1">
                  {warnings.slice(0, 2).map((warning) => (
                    <div key={warning.id} className={`text-sm p-2 rounded border ${getWarningColor(warning.warning_level)}`}>
                      <span className="font-medium">SP {warning.warning_level}:</span> {warning.description}
                      {warning.sp_number && <span className="ml-2 text-xs">({warning.sp_number})</span>}
                    </div>
                  ))}
                </div>
                {warnings.length > 2 && (
                  <p className="text-red-600 text-sm mt-1">
                    +{warnings.length - 2} peringatan lainnya
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Hadir Bulan Ini</p>
                <p className="text-2xl font-bold text-gray-900">{stats.thisMonth} hari</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Tepat Waktu</p>
                <p className="text-2xl font-bold text-gray-900">{stats.onTime}</p>
                <p className="text-xs text-red-600">+{stats.late} terlambat</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Gaji Harian</p>
                <p className="text-lg font-bold text-gray-900">
                  {profile?.positions?.base_salary ? formatCurrency(profile.positions.base_salary / 22) : 
                   profile?.salary ? formatCurrency(profile.salary / 22) : 'Belum diatur'}
                </p>
                <p className="text-xs text-gray-500">per hari kerja</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Jam Kerja</p>
                <p className="text-lg font-bold text-gray-900">
                  {stats.totalHours} jam
                </p>
                <p className="text-xs text-gray-500">bulan ini</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Today's Attendance */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-medium text-gray-900">Absensi Hari Ini</h2>
                </div>
              </div>
              <div className="p-6">
                {todayAttendance.length > 0 ? (
                  <div className="space-y-4">
                    {todayAttendance.map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                            {getStatusIcon(record.status)}
                            <span className="capitalize">
                              {record.type === 'masuk' ? 'Masuk' : 'Keluar'}
                            </span>
                          </div>
                          <div>
                            <span className="text-sm text-gray-600">
                              {formatTime(record.timestamp)}
                            </span>
                            {record.is_late && (
                              <span className="ml-2 text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                                Terlambat {record.late_minutes} menit
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Daily Salary Earned */}
                    {stats.dailySalaryEarned > 0 && (
                      <div className="mt-4 p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-green-700">Gaji Hari Ini:</span>
                          <span className="text-sm font-bold text-green-700">
                            {formatCurrency(stats.dailySalaryEarned)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Attendance Status */}
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <div className="text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span>Status Absensi:</span>
                          <span className={hasCheckedIn ? 'text-green-600' : 'text-gray-600'}>
                            {hasCheckedIn ? '✓ Sudah Masuk' : '○ Belum Masuk'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span></span>
                          <span className={hasCheckedOut ? 'text-green-600' : 'text-gray-600'}>
                            {hasCheckedOut ? '✓ Sudah Keluar' : '○ Belum Keluar'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500">Belum ada absensi hari ini</p>
                  </div>
                )}

                {canAttend && (
                  <button
                    onClick={handleAttendanceClick}
                    className="w-full mt-6 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    {!hasCheckedIn ? 'Absen Masuk' : 'Absen Keluar'}
                  </button>
                )}

                {!canAttend && (
                  <div className="w-full mt-6 bg-gray-100 text-gray-500 py-3 px-4 rounded-lg font-medium text-center">
                    Absensi hari ini sudah selesai
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-medium text-gray-900">Aktivitas Terbaru</h2>
                </div>
              </div>
              <div className="p-6">
                {recentAttendance.length > 0 ? (
                  <div className="space-y-4">
                    {recentAttendance.map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex items-center space-x-4">
                          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(record.status)}`}>
                            {getStatusIcon(record.status)}
                            <span className="capitalize">
                              {record.type === 'masuk' ? 'Masuk' : 'Keluar'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatTime(record.timestamp)}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatDate(record.timestamp)}
                            </p>
                            {record.is_late && (
                              <p className="text-xs text-red-600">
                                Terlambat {record.late_minutes} menit
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-4 w-4 mr-1" />
                          <span>Kantor</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500">Belum ada aktivitas</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Setup Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Lengkapi Profil</h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Camera className="h-8 w-8 text-blue-600" />
                </div>
                <p className="text-gray-600 mb-4">
                  Untuk dapat melakukan absensi dengan verifikasi wajah, Anda perlu menambahkan foto wajah ke profil.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowProfileModal(false);
                    navigate('/profile-setup');
                  }}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <Edit className="h-4 w-4" />
                    <span>Setup Foto Wajah</span>
                  </div>
                </button>
                
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Nanti Saja
                </button>
              </div>

              <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-700">
                  <strong>Catatan:</strong> Tanpa foto wajah, Anda tidak dapat melakukan absensi dengan verifikasi keamanan.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Form Modal */}
      {showAttendanceForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="relative">
              <button
                onClick={() => setShowAttendanceForm(false)}
                className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50"
              >
                <XCircle className="h-6 w-6 text-gray-600" />
              </button>
              <AttendanceForm
                user={{ id: user.id, avatar_url: profile?.avatar_url }}
                onAttendanceSubmitted={handleAttendanceSubmitted}
                todayAttendance={todayAttendance}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;