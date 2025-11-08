import React, { useState, useEffect } from 'react';
import { 
  X, Download, AlertTriangle, Heart, TrendingUp, TrendingDown, 
  Clock, MessageCircle, Target, CheckCircle, HelpCircle, 
  BarChart3, User, Users, FileText, Mail, Calendar
} from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const PostCallDashboard = ({ 
  conversationData, 
  userProfile, 
  patientUserId,
  onClose, 
  onAssignCaregiver 
}) => {
  const [loading, setLoading] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [savingToHistory, setSavingToHistory] = useState(false);

  if (!conversationData) return null;

  const {
    conversationId,
    messages = [],
    topics = [],
    actionItems = [],
    questions = [],
    analytics = {},
    sentiment = {},
    duration = 0,
  } = conversationData;

  // Calculate distress level
  const calculateDistressLevel = () => {
    const { averageSentiment, distressIndicators } = sentiment;
    const negativeRatio = sentiment.sentimentDistribution?.negative || 0;
    const totalMessages = messages.length || 1;

    const distressScore = 
      (averageSentiment < -0.5 ? 30 : 0) +
      (distressIndicators / totalMessages) * 100 * 0.4 +
      (negativeRatio / totalMessages) * 100 * 0.3;

    if (distressScore > 60) return { level: 'high', color: 'red', text: 'High Distress' };
    if (distressScore > 30) return { level: 'medium', color: 'orange', text: 'Moderate Distress' };
    return { level: 'low', color: 'green', text: 'Low Distress' };
  };

  // Calculate emotional wellness score
  const calculateWellnessScore = () => {
    const { averageSentiment } = sentiment;
    const positiveRatio = (sentiment.sentimentDistribution?.positive || 0) / (messages.length || 1);
    
    const score = Math.round(
      50 + (averageSentiment * 25) + (positiveRatio * 25)
    );

    return Math.max(0, Math.min(100, score));
  };

  // Detect key concerns
  const detectKeyConcerns = () => {
    const concerns = [];
    const concernKeywords = {
      pain: ['pain', 'hurt', 'ache', 'sore', 'discomfort'],
      loneliness: ['alone', 'lonely', 'isolated', 'miss', 'nobody'],
      anxiety: ['anxious', 'worried', 'scared', 'nervous', 'afraid'],
      depression: ['sad', 'depressed', 'hopeless', 'empty', 'worthless'],
      health: ['sick', 'ill', 'medication', 'doctor', 'hospital'],
    };

    const allText = messages.map(m => m.text?.toLowerCase() || '').join(' ');

    Object.entries(concernKeywords).forEach(([concern, keywords]) => {
      const matches = keywords.filter(kw => allText.includes(kw));
      if (matches.length > 0) {
        concerns.push({
          type: concern,
          keywords: matches,
          severity: matches.length > 2 ? 'high' : 'medium',
        });
      }
    });

    return concerns;
  };

  // Save conversation to history
  const saveToHistory = async () => {
    if (!patientUserId) {
      alert('Patient user ID not available');
      return;
    }

    setSavingToHistory(true);

    try {
      const distressLevel = calculateDistressLevel();
      const wellnessScore = calculateWellnessScore();
      const keyConcerns = detectKeyConcerns();

      const conversationRecord = {
        conversationId,
        date: new Date().toISOString(),
        duration,
        caregiverId: userProfile?.uid,
        caregiverName: userProfile?.displayName || 'Unknown',
        distressLevel: distressLevel.level,
        wellnessScore,
        keyConcerns,
        sentiment: {
          average: sentiment.averageSentiment,
          distribution: sentiment.sentimentDistribution,
        },
        topicsDiscussed: topics.slice(0, 5).map(t => t.text),
        actionItems: actionItems.length,
        questions: questions.length,
        messageCount: messages.length,
        flaggedForReview: distressLevel.level === 'high',
      };

      // Save to patient's history
      const historyRef = doc(
        db,
        'users',
        patientUserId,
        'callHistory',
        conversationId
      );

      await setDoc(historyRef, conversationRecord);

      console.log('✅ Conversation saved to history');
      alert('Conversation saved to patient history');
    } catch (error) {
      console.error('❌ Error saving to history:', error);
      alert('Failed to save conversation to history');
    } finally {
      setSavingToHistory(false);
    }
  };

  // Download report as JSON
  const downloadReport = () => {
    setDownloadingReport(true);

    try {
      const distressLevel = calculateDistressLevel();
      const wellnessScore = calculateWellnessScore();
      const keyConcerns = detectKeyConcerns();

      const report = {
        conversationId,
        date: new Date().toISOString(),
        duration,
        patient: {
          userId: patientUserId,
        },
        caregiver: {
          userId: userProfile?.uid,
          name: userProfile?.displayName,
        },
        assessment: {
          distressLevel: distressLevel.level,
          wellnessScore,
          keyConcerns,
        },
        sentiment,
        topics,
        actionItems,
        questions,
        messages,
        analytics,
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `call-report-${conversationId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ Report downloaded');
    } catch (error) {
      console.error('❌ Error downloading report:', error);
      alert('Failed to download report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const distressLevel = calculateDistressLevel();
  const wellnessScore = calculateWellnessScore();
  const keyConcerns = detectKeyConcerns();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Heart className="w-7 h-7" />
              Post-Call Analysis Dashboard
            </h2>
            <p className="text-sm text-purple-100 mt-1">
              Comprehensive emotional and conversation insights
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Alert Banner for High Distress */}
          {distressLevel.level === 'high' && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-bold text-red-800 mb-1">
                    High Distress Level Detected
                  </h3>
                  <p className="text-sm text-red-700 mb-3">
                    This patient shows significant signs of distress. Immediate caregiver assignment recommended.
                  </p>
                  <button
                    onClick={() => onAssignCaregiver && onAssignCaregiver()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    Assign Caregiver Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Distress Level */}
            <div className={`bg-${distressLevel.color}-50 border-2 border-${distressLevel.color}-200 rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Distress Level</span>
                <AlertTriangle className={`w-5 h-5 text-${distressLevel.color}-600`} />
              </div>
              <div className={`text-3xl font-bold text-${distressLevel.color}-700`}>
                {distressLevel.text}
              </div>
              <div className={`text-xs text-${distressLevel.color}-600 mt-1`}>
                {sentiment.distressIndicators || 0} distress indicators found
              </div>
            </div>

            {/* Wellness Score */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Wellness Score</span>
                <Heart className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-blue-700">
                {wellnessScore}/100
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${wellnessScore}%` }}
                ></div>
              </div>
            </div>

            {/* Call Duration */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Call Duration</span>
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-green-700">
                {Math.floor(duration / 60)}m {duration % 60}s
              </div>
              <div className="text-xs text-green-600 mt-1">
                {messages.length} messages exchanged
              </div>
            </div>
          </div>

          {/* Key Concerns */}
          {keyConcerns.length > 0 && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-red-600" />
                Key Concerns Detected
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {keyConcerns.map((concern, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border-l-4 ${
                      concern.severity === 'high'
                        ? 'bg-red-50 border-red-500'
                        : 'bg-orange-50 border-orange-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold capitalize text-gray-800">
                        {concern.type}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          concern.severity === 'high'
                            ? 'bg-red-200 text-red-800'
                            : 'bg-orange-200 text-orange-800'
                        }`}
                      >
                        {concern.severity} priority
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      Keywords: {concern.keywords.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sentiment Analysis */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-5 mb-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Sentiment Analysis
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {sentiment.sentimentDistribution?.positive || 0}
                </div>
                <div className="text-sm text-gray-600">Positive</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-600">
                  {sentiment.sentimentDistribution?.neutral || 0}
                </div>
                <div className="text-sm text-gray-600">Neutral</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">
                  {sentiment.sentimentDistribution?.negative || 0}
                </div>
                <div className="text-sm text-gray-600">Negative</div>
              </div>
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="text-sm text-gray-700 mb-1">Average Sentiment</div>
              <div className="flex items-center gap-2">
                {sentiment.averageSentiment > 0 ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : sentiment.averageSentiment < 0 ? (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                ) : (
                  <div className="w-5 h-5" />
                )}
                <div className="flex-1 bg-gray-300 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      sentiment.averageSentiment > 0
                        ? 'bg-green-600'
                        : sentiment.averageSentiment < 0
                        ? 'bg-red-600'
                        : 'bg-gray-600'
                    }`}
                    style={{
                      width: `${Math.abs(sentiment.averageSentiment) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="font-bold text-gray-800">
                  {(sentiment.averageSentiment || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Topics Discussed */}
          {topics.length > 0 && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-blue-600" />
                Topics Discussed
              </h3>
              <div className="space-y-2">
                {topics.slice(0, 10).map((topic, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <span className="font-medium text-gray-800">{topic.text}</span>
                      {topic.sentiment && (
                        <span
                          className={`ml-2 text-xs px-2 py-1 rounded-full ${
                            topic.sentiment.suggested === 'positive'
                              ? 'bg-green-100 text-green-800'
                              : topic.sentiment.suggested === 'negative'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {topic.sentiment.suggested}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      Score: {(topic.score * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {actionItems.length > 0 && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Action Items ({actionItems.length})
              </h3>
              <div className="space-y-2">
                {actionItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-gray-800">{item.text}</p>
                      {item.assignee && (
                        <p className="text-sm text-gray-600 mt-1">
                          Assigned to: {item.assignee.name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Questions Asked */}
          {questions.length > 0 && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-orange-600" />
                Questions Asked ({questions.length})
              </h3>
              <div className="space-y-2">
                {questions.map((question, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <HelpCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <p className="text-gray-800 flex-1">{question.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-gray-600">
            Conversation ID: <span className="font-mono">{conversationId}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveToHistory}
              disabled={savingToHistory}
              className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Calendar className="w-4 h-4" />
              {savingToHistory ? 'Saving...' : 'Save to History'}
            </button>
            <button
              onClick={downloadReport}
              disabled={downloadingReport}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloadingReport ? 'Downloading...' : 'Download Report'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostCallDashboard;
