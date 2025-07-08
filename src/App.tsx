import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './utils/supabaseClient';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AttendanceHistory from './pages/AttendanceHistory';
import AdminPanel from './pages/AdminPanel';
import UserManagement from './pages/UserManagement';
import SalaryPaymentManagement from './pages/SalaryPaymentManagement';
import DepartmentManagement from './pages/DepartmentManagement';
import PositionManagement from './pages/PositionManagement';
import ProfileSetup from './pages/ProfileSetup';
import LocationSettings from './pages/LocationSettings';
import BankManagement from './pages/BankManagement';
import AttendanceManagementByDate from './pages/AttendanceManagementByDate';
import { LanguageProvider } from './utils/languageContext';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    // Dapatkan session awal dengan error handling
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Jika ada error (seperti user_not_found), clear session
        console.error('Session error:', error);
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
        
        // Fetch user role if session exists
        if (session) {
          fetchUserRole(session.user.id);
        }
      }
      setLoading(false);
    }).catch((error) => {
      // Handle any unexpected errors
      console.error('Unexpected session error:', error);
      supabase.auth.signOut();
      setSession(null);
      setLoading(false);
    });

    // Dengarkan perubahan auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      // Fetch user role when session changes
      if (session) {
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setUserRole(data.role);
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex space-x-1 text-blue-600">
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-gray-600 mt-4">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  return (
    <LanguageProvider>
      <Router>
        <Routes>
          <Route 
            path="/login" 
            element={!session ? <Login /> : (userRole === 'admin' ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />)} 
          />
          <Route 
            path="/register" 
            element={!session ? <Register /> : (userRole === 'admin' ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />)} 
          />
          <Route 
            path="/dashboard" 
            element={session ? (userRole === 'admin' ? <Navigate to="/admin" replace /> : <Dashboard />) : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/profile-setup" 
            element={session ? <ProfileSetup /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/history" 
            element={session ? <AttendanceHistory /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/admin" 
            element={session && userRole === 'admin' ? <AdminPanel /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/users" 
            element={session && userRole === 'admin' ? <UserManagement /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/departments" 
            element={session && userRole === 'admin' ? <DepartmentManagement /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/positions" 
            element={session && userRole === 'admin' ? <PositionManagement /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/salary-payment" 
            element={session && userRole === 'admin' ? <SalaryPaymentManagement /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/location" 
            element={session && userRole === 'admin' ? <LocationSettings /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/bank" 
            element={session && userRole === 'admin' ? <BankManagement /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/admin/attendance" 
            element={session && userRole === 'admin' ? <AttendanceManagementByDate /> : <Navigate to={session ? "/dashboard" : "/login"} replace />} 
          />
          <Route 
            path="/" 
            element={
              !session ? <Navigate to="/login" replace /> : 
              userRole === 'admin' ? <Navigate to="/admin" replace /> : 
              <Navigate to="/dashboard" replace />
            } 
          />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;