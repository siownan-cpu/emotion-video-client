import React, { useState, useEffect } from 'react';
import { 
  Clock, TrendingUp, TrendingDown, Calendar, AlertTriangle, 
  Heart, Download, Eye, X, Filter, Search
} from 'lucide-react';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../config/firebase';

const CallHistoryViewer = ({ patientUserId, onClose }) => {
  const [callHistory, setCallHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState(null);
  const [filterLevel, setFilterLevel] = useState('all'); // all, high, medium, low
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (patientUserId) {
      loadCallHistory();
    }
  }, [patientUserId]);

  const loadCallHistory = async () => {
    try {
      setLoading(true);
      
      const historyRef = collection(db, 'users', patientUserId, 'callHistory');
      const q = query(historyRef, orderBy('date', 'desc'));
      
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setCallHistory(history);
      console.log('✅ Loaded', history.length, 'historical calls');
    } catch (error) {
      console.error('❌ Error loading call history:', error);
      alert('Failed to load call history');
    } finally {
      setLoading(false);
    }
  };

  // Filter and search
  const filteredHistory = callHistory.filter(call => {
    const matchesFilter = filterLevel === 'all' || call.distressLevel === filterLevel;
    const matchesSearch = searchTerm === '' || 
      call.caregiverName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.keyConcerns?.some(c => c.type.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesFilter && matchesSearch;
  });

  // Calculate trends
  const calculateTrends = () => {
    if (callHistory.length < 2) return null;

    const recent = callHistory.slice(0, 5);
    const older = callHistory.slice(5, 10);

    const recentAvgWellness = recent.reduce((sum, call) => sum + (call.wellnessScore || 50), 0) / recent.length;
    const olderAvgWellness = older.length > 0 
      ? older.reduce((sum, call) => sum + (call.wellnessScore || 50), 0) / older.length 
      : recentAvgWellness;

    const wellnessTrend = recentAvgWellness > olderAvgWellness ? 'improving' : 
                          recentAvgWellness < olderAvgWellness ? 'declining' : 'stable';

    const highDistressCalls = recent.filter(c => c.distressLevel === 'high').length;

    return {
      wellnessTrend,
      recentAvgWellness: Math.round(recentAvgWellness),
      highDistressCalls,
      totalRecentCalls: recent.length,
    };
  };

  const trends = calculateTrends();

  const getDistressColor = (level) => {
    switch (level) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      case 'low': return 'green';
      default: return 'gray';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-7 h-7" />
              Call History & Trends
            </h2>
            <p className="text-sm text-blue-100 mt-1">
              Review past conversations and emotional wellness trends
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Trends Summary */}
        {trends && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 px-6 py-4 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 mb-3">Recent Trends</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Wellness Trend</span>
                  {trends.wellnessTrend === 'improving' ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : trends.wellnessTrend === 'declining' ? (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  ) : (
                    <div className="w-5 h-5" />
                  )}
                </div>
                <div className={`text-2xl font-bold ${
                  trends.wellnessTrend === 'improving' ? 'text-green-600' : 
                  trends.wellnessTrend === 'declining' ? 'text-red-600' : 
                  'text-gray-600'
                }`}>
                  {trends.wellnessTrend === 'improving' ? '📈 Improving' :
                   trends.wellnessTrend === 'declining' ? '📉 Declining' :
                   '➡️ Stable'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Avg: {trends.recentAvgWellness}/100
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">High Distress Calls</span>
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {trends.highDistressCalls} / {trends.totalRecentCalls}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  In last {trends.totalRecentCalls} calls
                </div>
              </div>

              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Total Calls</span>
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {callHistory.length}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  All time
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by caregiver or concern..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Levels</option>
                <option value="high">High Distress</option>
                <option value="medium">Medium Distress</option>
                <option value="low">Low Distress</option>
              </select>
            </div>
          </div>
        </div>

        {/* Call History List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                {callHistory.length === 0
                  ? 'No call history available'
                  : 'No calls match your filters'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((call) => {
                const distressColor = getDistressColor(call.distressLevel);
                
                return (
                  <div
                    key={call.id}
                    className={`bg-white border-2 border-${distressColor}-200 rounded-xl p-5 hover:shadow-lg transition-shadow`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 bg-${distressColor}-100 text-${distressColor}-800 rounded-full text-sm font-semibold`}>
                            {call.distressLevel} distress
                          </span>
                          <span className="text-sm text-gray-600">
                            {formatDate(call.date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-700">
                          <span>👤 {call.caregiverName}</span>
                          <span>⏱️ {formatDuration(call.duration)}</span>
                          <span>💬 {call.messageCount} messages</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-center px-3 py-2 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-700">
                            {call.wellnessScore}
                          </div>
                          <div className="text-xs text-blue-600">Wellness</div>
                        </div>
                        <button
                          onClick={() => setSelectedCall(call)}
                          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-5 h-5 text-gray-700" />
                        </button>
                      </div>
                    </div>

                    {/* Key Concerns */}
                    {call.keyConcerns && call.keyConcerns.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-gray-600 mb-2">
                          Key Concerns:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {call.keyConcerns.map((concern, idx) => (
                            <span
                              key={idx}
                              className={`text-xs px-2 py-1 rounded-full ${
                                concern.severity === 'high'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {concern.type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Topics */}
                    {call.topicsDiscussed && call.topicsDiscussed.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-2">
                          Topics Discussed:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {call.topicsDiscussed.slice(0, 5).map((topic, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Flagged */}
                    {call.flaggedForReview && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-red-600 text-sm font-semibold">
                          <AlertTriangle className="w-4 h-4" />
                          Flagged for Review
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Call Detail Modal */}
        {selectedCall && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">Call Details</h3>
                <button
                  onClick={() => setSelectedCall(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Date</div>
                    <div className="font-semibold">{formatDate(selectedCall.date)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Duration</div>
                    <div className="font-semibold">{formatDuration(selectedCall.duration)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Caregiver</div>
                    <div className="font-semibold">{selectedCall.caregiverName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Wellness Score</div>
                    <div className="font-semibold">{selectedCall.wellnessScore}/100</div>
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-600 mb-2">Sentiment Distribution</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-green-50 p-2 rounded text-center">
                      <div className="font-bold text-green-700">
                        {selectedCall.sentiment?.distribution?.positive || 0}
                      </div>
                      <div className="text-xs text-green-600">Positive</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded text-center">
                      <div className="font-bold text-gray-700">
                        {selectedCall.sentiment?.distribution?.neutral || 0}
                      </div>
                      <div className="text-xs text-gray-600">Neutral</div>
                    </div>
                    <div className="bg-red-50 p-2 rounded text-center">
                      <div className="font-bold text-red-700">
                        {selectedCall.sentiment?.distribution?.negative || 0}
                      </div>
                      <div className="text-xs text-red-600">Negative</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-600 mb-2">Average Sentiment</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          (selectedCall.sentiment?.average || 0) > 0
                            ? 'bg-green-600'
                            : (selectedCall.sentiment?.average || 0) < 0
                            ? 'bg-red-600'
                            : 'bg-gray-600'
                        }`}
                        style={{
                          width: `${Math.abs(selectedCall.sentiment?.average || 0) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <span className="font-bold">
                      {(selectedCall.sentiment?.average || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {selectedCall.keyConcerns && selectedCall.keyConcerns.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-600 mb-2">Key Concerns</div>
                    <div className="space-y-2">
                      {selectedCall.keyConcerns.map((concern, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg ${
                            concern.severity === 'high'
                              ? 'bg-red-50 border-l-4 border-red-500'
                              : 'bg-orange-50 border-l-4 border-orange-500'
                          }`}
                        >
                          <div className="font-semibold capitalize">{concern.type}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            Keywords: {concern.keywords.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-sm text-gray-600 mb-2">Action Items</div>
                  <div className="font-semibold">{selectedCall.actionItems || 0} identified</div>
                </div>

                <div>
                  <div className="text-sm text-gray-600 mb-2">Questions Asked</div>
                  <div className="font-semibold">{selectedCall.questions || 0} questions</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-gray-600">
            Showing {filteredHistory.length} of {callHistory.length} calls
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallHistoryViewer;
