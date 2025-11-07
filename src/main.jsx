import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

import EmotionVideoCallWithWebRTC from './components/emotion-video-call-webrtc';
import Login from './components/Login';
import Registration from './components/Registration';
import Dashboard from './components/Dashboard';
import PrivateRoute from './components/PrivateRoute';
import UserManagement from './components/UserManagement';
import './index.css';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={!user ? <Registration /> : <Navigate to="/dashboard" />} />
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Protected Routes */}
        <Route element={<PrivateRoute isAuthenticated={!!user} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/video-call" element={<EmotionVideoCallWithWebRTC />} />
          <Route path="/user-management" element={<UserManagement />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
