import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Save,
  X,
  Shield,
  Building,
  Users,
  User,
  Mail,
  Phone,
  Camera,
  CheckCircle,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { supabase, uploadFile, getFileUrl } from '../utils/supabaseClient';
import CustomFaceCapture from '../components/CustomFaceCapture';
import AdminSidebar from '../components/AdminSidebar';

const UserManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    location: '',
    title: '',
    bio: '',
    role: 'karyawan',
    position_id: '',
    employee_id: '',
    department: '',
    salary: 0,
    bank_id: '',
    bank_account_number: '',
    bank_account_name: ''
  });
  const [facePhoto, setFacePhoto] = useState(null);
  const [faceFingerprint, setFaceFingerprint] = useState(null);
  const [step, setStep] = useState(1); // 1: Basic Info, 2: Face Photo
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'admin') {
        navigate('/dashboard');
        return;
      }

      setCurrentUser(user);
      setProfile(profile);
      await Promise.all([fetchUsers(), fetchPositions(), fetchBanks()]);
    } catch (error) {
      console.error('Error checking access:', error);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setContentLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          positions(name_id, department, base_salary),
          bank_info(bank_name, bank_logo)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setContentLoading(false);
    }
  };

  const fetchPositions = async () => {
    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('is_active', true)
        .order('name_id');

      if (error) throw error;
      setPositions(data || []);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const fetchBanks = async () => {
    try {
      const { data, error } = await supabase
        .from('bank_info')
        .select('*')
        .eq('is_active', true)
        .order('bank_name');

      if (error) throw error;
      setBanks(data || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'position_id') {
      // Ketika posisi dipilih, otomatis set data terkait
      const selectedPosition = positions.find(p => p.id === value);
      if (selectedPosition) {
        // Generate employee ID based on position
        const positionCode = selectedPosition.name_id.substring(0, 3).toUpperCase();
        const timestamp = Date.now().toString().slice(-4);
        const employeeId = `${positionCode}${timestamp}`;
        
        setFormData(prev => ({
          ...prev,
          position_id: value,
          title: selectedPosition.name_id,
          department: selectedPosition.department || '',
          salary: selectedPosition.base_salary || 0,
          employee_id: employeeId
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          position_id: value,
          title: '',
          department: '',
          salary: 0,
          employee_id: ''
        }));
      }
    } else if (name === 'name' || name === 'full_name') {
      // Auto-update bank account name when name changes
      setFormData(prev => ({
        ...prev,
        [name]: value,
        bank_account_name: value
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const generateEmployeeId = (positionName) => {
    const positionCode = positionName ? positionName.substring(0, 3).toUpperCase() : 'EMP';
    const timestamp = Date.now().toString().slice(-4);
    return `${positionCode}${timestamp}`;
  };

  const handleFaceCapture = (photoBlob, fingerprint) => {
    setFacePhoto(photoBlob);
    setFaceFingerprint(fingerprint);
    console.log('✅ Face captured for new user with custom fingerprint');
  };

  const handleBasicInfoSubmit = (e) => {
    e.preventDefault();
    setError(null);

    // Validasi
    if (formData.password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    if (!formData.position_id) {
      setError('Silakan pilih jabatan');
      return;
    }

    // Admin langsung ke registrasi, karyawan ke verifikasi wajah
    if (formData.role === 'admin') {
      handleCreateUser();
    } else {
      setStep(2); // Pindah ke langkah foto wajah untuk non-admin
    }
  };

  const handleCreateUser = async () => {
    // Untuk non-admin, wajib ada foto wajah
    if (formData.role !== 'admin' && (!facePhoto || !faceFingerprint)) {
      setError('Silakan ambil foto wajah terlebih dahulu');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Register user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            role: formData.role
          }
        }
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Pendaftaran gagal');
      }

      const userId = authData.user.id;
      let photoUrl = null;

      // 2. Upload foto wajah hanya untuk non-admin
      if (formData.role !== 'admin' && facePhoto) {
        const fileName = `${userId}-face-${Date.now()}.jpg`;
        await uploadFile(facePhoto, 'face-photos', fileName);
        photoUrl = getFileUrl('face-photos', fileName);
      }

      // 3. Wait a moment for auth to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. Create user profile dengan data jabatan
      const profileData = {
        id: userId,
        name: formData.name,
        full_name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        title: formData.title,
        bio: formData.bio || `${getRoleDisplayName(formData.role)} di sistem absensi`,
        avatar_url: photoUrl, // null untuk admin, ada untuk karyawan
        role: formData.role,
        position_id: formData.position_id,
        employee_id: formData.employee_id,
        department: formData.department,
        salary: formData.salary,
        bank_id: formData.bank_id || null,
        bank_account_number: formData.bank_account_number || null,
        bank_account_name: formData.bank_account_name || formData.name,
        is_face_registered: formData.role === 'admin' ? true : !!photoUrl, // Admin otomatis true
        status: 'active',
        join_date: new Date().toISOString().split('T')[0],
        contract_start_date: new Date().toISOString().split('T')[0],
        contract_type: 'permanent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([profileData]);

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // If profile creation fails, try to update existing profile
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', userId);

        if (updateError) {
          throw new Error('Gagal membuat profil user');
        }
      }

      // 5. Create employee salary record
      const salaryData = {
        user_id: userId,
        daily_salary: formData.salary / 22, // Convert monthly to daily
        overtime_rate: 1.5,
        bonus: 0,
        deduction: 0,
        effective_date: new Date().toISOString().split('T')[0],
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: salaryError } = await supabase
        .from('employee_salaries')
        .insert([salaryData]);

      if (salaryError) {
        console.error('Salary creation error:', salaryError);
        // Continue even if salary creation fails
      }

      setSuccess(`${getRoleDisplayName(formData.role)} berhasil ditambahkan dengan jabatan ${formData.title} dan gaji ${formatCurrency(formData.salary)}!`);
      resetForm();
      await fetchUsers();

    } catch (err) {
      console.error('Error creating user:', err);
      setError(err.message || 'Terjadi kesalahan saat membuat user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      location: '',
      title: '',
      bio: '',
      role: 'karyawan',
      position_id: '',
      employee_id: '',
      department: '',
      salary: 0,
      bank_id: '',
      bank_account_number: '',
      bank_account_name: ''
    });
    setFacePhoto(null);
    setFaceFingerprint(null);
    setStep(1);
    setShowAddUser(false);
    setError(null);
    setSuccess(null);
  };

  const handleDeleteUser = async (userId, userRole) => {
    if (!confirm('Apakah Anda yakin ingin menghapus user ini?')) {
      return;
    }

    setContentLoading(true);
    try {
      // Hapus dari profiles (auth akan terhapus otomatis karena CASCADE)
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      await fetchUsers();
      setSuccess('User berhasil dihapus');
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Gagal menghapus user');
    } finally {
      setContentLoading(false);
    }
  };

  const getRoleDisplayName = (role) => {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'karyawan':
        return 'Karyawan';
      default:
        return 'Karyawan';
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const canManageUser = (userRole) => {
    if (currentUser?.id === userRole) return false; // Can't delete yourself
    return true;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const getDepartments = () => {
    const departments = [...new Set(users.map(u => u.department || u.positions?.department).filter(Boolean))];
    return departments;
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.employee_id && user.employee_id.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDepartment = filterDepartment === '' || 
                             user.department === filterDepartment || 
                             user.positions?.department === filterDepartment;
    const matchesRole = filterRole === '' || user.role === filterRole;
    
    return matchesSearch && matchesDepartment && matchesRole;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex space-x-1 text-blue-600">
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-gray-600 mt-4">Memuat data pengguna...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <AdminSidebar user={currentUser} profile={profile} />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 transition-all duration-300 ease-in-out">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Kelola Pengguna</h1>
                <p className="text-sm text-gray-600">
                  Tambah dan kelola semua pengguna sistem (Admin tanpa verifikasi wajah)
                </p>
              </div>
              <button
                onClick={() => setShowAddUser(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah User</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Notifications */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-green-700">{success}</p>
              <button 
                onClick={() => setSuccess(null)}
                className="ml-auto text-green-500 hover:text-green-700"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Filter dan Pencarian */}
          <div className="bg-white rounded-lg shadow-md mb-6">
            <div className="p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Cari berdasarkan nama, email, atau ID karyawan..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="sm:w-48">
                  <select
                    value={filterDepartment}
                    onChange={(e) => setFilterDepartment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Semua Departemen</option>
                    {getDepartments().map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:w-48">
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Semua Role</option>
                    <option value="karyawan">Karyawan</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Daftar User */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-medium text-gray-900">
                  Daftar Pengguna ({filteredUsers.length})
                </h2>
              </div>
            </div>
            
            {contentLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="inline-flex space-x-1 text-blue-600">
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            ) : filteredUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pengguna
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Jabatan & Departemen
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gaji
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kontak
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role & Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                              {user.avatar_url ? (
                                <img 
                                  src={user.avatar_url} 
                                  alt={user.name}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                  user.role === 'admin' ? 'bg-blue-100' : 'bg-green-100'
                                }`}>
                                  {getRoleIcon(user.role)}
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                ID: {user.employee_id || 'Belum diatur'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {user.positions?.name_id || user.title || getRoleDisplayName(user.role)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {user.positions?.department || user.department || 'Belum diatur'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(user.positions?.base_salary || user.salary || 0)}
                          </div>
                          <div className="text-sm text-gray-500">
                            per bulan
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center">
                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                            {user.email}
                          </div>
                          {user.phone && (
                            <div className="text-sm text-gray-500 flex items-center mt-1">
                              <Phone className="h-4 w-4 mr-2 text-gray-400" />
                              {user.phone}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                              {user.role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
                              {getRoleDisplayName(user.role)}
                            </span>
                            <div className="text-xs text-gray-500">
                              {user.role === 'admin' ? (
                                <span className="text-blue-600">Tanpa verifikasi wajah</span>
                              ) : user.is_face_registered ? (
                                <span className="text-green-600">Wajah terdaftar</span>
                              ) : (
                                <span className="text-yellow-600">Wajah belum terdaftar</span>
                              )}
                            </div>
                            {user.bank_info && (
                              <div className="text-xs text-gray-500">
                                <span className="text-blue-600">Bank: {user.bank_info.bank_name}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            {canManageUser(user.id) ? (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.role)}
                                className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"
                                title="Hapus User"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className="text-gray-400 text-xs">Akun Anda</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-500 text-lg mb-2">Tidak ada pengguna ditemukan</p>
                <p className="text-gray-400">Coba sesuaikan pencarian atau filter Anda</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Tambah User */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-lg">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  {step === 1 ? 'Tambah Pengguna Baru' : 'Setup Foto Wajah'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Progress Steps */}
              <div className="flex items-center justify-center mb-6">
                {[1, 2].map((stepNum) => (
                  <div key={stepNum} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step >= stepNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {stepNum < step ? <CheckCircle className="h-4 w-4" /> : stepNum}
                    </div>
                    {stepNum < 2 && (
                      <div className={`w-12 h-1 mx-2 ${
                        step > stepNum ? 'bg-blue-600' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                ))}
              </div>

              {step === 1 ? (
                <form onSubmit={handleBasicInfoSubmit} className="space-y-6">
                  {/* Jabatan Selection - UTAMA */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-medium text-blue-900 mb-3">Pilih Jabatan</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Jabatan *
                      </label>
                      <select
                        name="position_id"
                        value={formData.position_id}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Pilih Jabatan...</option>
                        {positions.map(position => (
                          <option key={position.id} value={position.id}>
                            {position.name_id} - {position.department} ({formatCurrency(position.base_salary || 0)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-filled fields */}
                    {formData.position_id && (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ID Karyawan (Auto)
                          </label>
                          <input
                            type="text"
                            value={formData.employee_id}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Gaji Bulanan (Auto)
                          </label>
                          <input
                            type="text"
                            value={formatCurrency(formData.salary)}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nama Lengkap *
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Masukkan nama lengkap"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Masukkan email"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Password *
                      </label>
                      <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Minimal 6 karakter"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Role
                      </label>
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="karyawan">Karyawan</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        No. Telepon
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Contoh: +62-21-1234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Lokasi
                      </label>
                      <input
                        type="text"
                        name="location"
                        value={formData.location}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Contoh: Jakarta, Indonesia"
                      />
                    </div>
                  </div>

                  {/* Bank Information */}
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="font-medium text-green-900 mb-3">Informasi Bank (Opsional)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Pilih Bank
                        </label>
                        <select
                          name="bank_id"
                          value={formData.bank_id}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Pilih Bank...</option>
                          {banks.map(bank => (
                            <option key={bank.id} value={bank.id}>
                              {bank.bank_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nomor Rekening
                        </label>
                        <input
                          type="text"
                          name="bank_account_number"
                          value={formData.bank_account_number}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Nomor rekening"
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nama Pemilik Rekening (Auto)
                      </label>
                      <input
                        type="text"
                        value={formData.bank_account_name}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        placeholder="Otomatis sesuai nama lengkap"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bio
                    </label>
                    <textarea
                      name="bio"
                      value={formData.bio}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Deskripsi singkat tentang pengguna"
                    />
                  </div>

                  {/* Admin Notice */}
                  {formData.role === 'admin' && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start space-x-3">
                        <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-blue-800 font-medium">Administrator</p>
                          <p className="text-blue-700 text-sm mt-1">
                            Administrator tidak memerlukan verifikasi wajah dan dapat langsung mengakses semua fitur sistem.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {formData.role === 'admin' ? 'Buat Administrator' : 'Lanjut ke Foto Wajah'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <Camera className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                    <p className="text-gray-600">
                      Ambil foto wajah yang jelas untuk verifikasi absensi. 
                      Sistem kami menggunakan teknologi pengenalan wajah yang aman dan cepat.
                    </p>
                  </div>

                  <CustomFaceCapture onFaceCapture={handleFaceCapture} isCapturing={isSubmitting} />

                  {facePhoto && (
                    <div className="text-center">
                      <div className="inline-flex items-center space-x-2 text-green-600 mb-4">
                        <CheckCircle className="h-5 w-5" />
                        <span>Foto wajah berhasil diambil dan diverifikasi!</span>
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Kembali
                    </button>
                    <button
                      onClick={handleCreateUser}
                      disabled={!facePhoto || isSubmitting}
                      className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="inline-flex space-x-1">
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                          <span>Membuat Akun...</span>
                        </div>
                      ) : (
                        'Buat Pengguna'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;