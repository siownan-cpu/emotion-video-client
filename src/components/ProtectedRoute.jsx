import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import AuthPage from './AuthPage';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { currentUser, userProfile } = useAuth();

  // Not authenticated - show login page
  if (!currentUser) {
    return <AuthPage />;
  }

  // Check role requirement
  if (requiredRole && userProfile?.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-gray-500">
            Required role: <span className="font-semibold capitalize">{requiredRole}</span>
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Your role: <span className="font-semibold capitalize">{userProfile?.role || 'none'}</span>
          </p>
        </div>
      </div>
    );
  }

  // Authenticated and authorized
  return children;
};

export default ProtectedRoute;
