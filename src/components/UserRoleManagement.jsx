import React, { useState, useEffect } from 'react';
import { Users, Shield, UserCheck, User, X, Loader } from 'lucide-react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const UserRoleManagement = ({ currentUserRole, onClose }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const userData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(userData);
      console.log('✅ Fetched', userData.length, 'users');
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      alert('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      setEditingUser(null);
      return;
    }

    try {
      setUpdating(true);
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));
      
      setEditingUser(null);
      console.log('✅ Role updated successfully:', userId, 'to', newRole);
      alert('Role updated successfully!');
    } catch (error) {
      console.error('❌ Error updating role:', error);
      alert('Failed to update user role. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'superadmin':
        return <Shield className="w-4 h-4 text-purple-600" />;
      case 'caregiver':
        return <UserCheck className="w-4 h-4 text-blue-600" />;
      case 'standard':
        return <User className="w-4 h-4 text-gray-600" />;
      default:
        return <User className="w-4 h-4 text-gray-600" />;
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'superadmin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'caregiver':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'standard':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleDisplayName = (role) => {
    switch (role) {
      case 'superadmin':
        return 'Superadmin';
      case 'caregiver':
        return 'Caregiver';
      case 'standard':
        return 'Standard User';
      default:
        return role;
    }
  };

  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (currentUserRole !== 'superadmin') {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="text-center py-8">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Access Denied</h3>
          <p className="text-gray-500">Only superadmins can manage user roles.</p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6" />
          <div>
            <h2 className="text-xl font-bold">User Role Management</h2>
            <p className="text-sm text-purple-100">Manage user permissions and access levels</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          disabled={updating}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="p-6 border-b border-gray-200 flex-shrink-0">
        <input
          type="text"
          placeholder="Search users by email or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          disabled={loading || updating}
        />
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <div key={user.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getRoleIcon(user.role)}
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {user.displayName || 'No name'}
                        </h3>
                        <p className="text-sm text-gray-500">{user.email}</p>
                        {user.createdAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Joined {new Date(user.createdAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {editingUser === user.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        disabled={updating}
                      >
                        <option value="superadmin">Superadmin</option>
                        <option value="caregiver">Caregiver</option>
                        <option value="standard">Standard User</option>
                      </select>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                        disabled={updating}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                        {getRoleDisplayName(user.role)}
                      </span>
                      <button
                        onClick={() => setEditingUser(user.id)}
                        className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors"
                        disabled={updating}
                      >
                        Change Role
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            <span className="font-semibold">{users.length}</span> total users
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <span className="text-gray-600">
                {users.filter(u => u.role === 'superadmin').length} Superadmins
              </span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span className="text-gray-600">
                {users.filter(u => u.role === 'caregiver').length} Caregivers
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-600" />
              <span className="text-gray-600">
                {users.filter(u => u.role === 'standard').length} Users
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserRoleManagement;
