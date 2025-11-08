import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import VideoCallApp from './components/VideoCallApp';

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <VideoCallApp />
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
