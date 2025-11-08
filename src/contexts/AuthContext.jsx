import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // User roles
  const USER_ROLES = {
    SUPERADMIN: 'superadmin',
    CAREGIVER: 'caregiver',
    STANDARD: 'standard'
  };

  // Sign up with email and password
  const signup = async (email, password, displayName, role = USER_ROLES.STANDARD) => {
    try {
      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update user profile with display name
      await updateProfile(user, { displayName });

      // Create user profile in Firestore
      const userProfileData = {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        role: role,
        createdAt: new Date().toISOString(),
        photoURL: null,
        bio: '',
        preferences: {
          notifications: true,
          emailUpdates: true
        }
      };

      await setDoc(doc(db, 'users', user.uid), userProfileData);

      console.log('✅ User created successfully:', displayName);
      return { user, profile: userProfileData };
    } catch (error) {
      console.error('❌ Signup error:', error);
      throw error;
    }
  };

  // Sign in with email and password
  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Fetch user profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const profile = userDoc.data();
        setUserProfile(profile);
        console.log('✅ User logged in:', profile.displayName, '| Role:', profile.role);
        return { user, profile };
      } else {
        console.warn('⚠️ User profile not found in Firestore');
        return { user, profile: null };
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  };

  // Sign out
  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      console.log('✅ User logged out');
    } catch (error) {
      console.error('❌ Logout error:', error);
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (updates) => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, updates, { merge: true });
      
      setUserProfile(prev => ({ ...prev, ...updates }));
      console.log('✅ Profile updated');
    } catch (error) {
      console.error('❌ Profile update error:', error);
      throw error;
    }
  };

  // Check if user has specific role
  const hasRole = (role) => {
    return userProfile?.role === role;
  };

  // Check if user is admin (superadmin or caregiver)
  const isAdmin = () => {
    return userProfile?.role === USER_ROLES.SUPERADMIN || 
           userProfile?.role === USER_ROLES.CAREGIVER;
  };

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        // Fetch user profile
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data());
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    signup,
    login,
    logout,
    updateUserProfile,
    hasRole,
    isAdmin,
    USER_ROLES,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
