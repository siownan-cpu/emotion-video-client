import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Heart, Smile, Frown, Meh, Clock, BarChart3, Mic, MicOff } from 'lucide-react';

const EnhancedStatisticsPanel = ({ 
  statistics, 
  speechEmotionStats,
  isAnalyzingSpeech,
  demoMode 
}) => {
  
  const getEmotionIcon = (emotion) => {
    const icons = {
      happy: <Smile className="w-5 h-5" />,
      sad: <Frown className="w-5 h-5" />,
      angry: <AlertCircle className="w-5 h-5" />,
      anxious: <AlertCircle className="w-5 h-5" />,
      lonely: <Frown className="w-5 h-5" />,
      neutral: <Meh className="w-5 h-5" />
    };
    return icons[emotion] || <Meh className="w-5 h-5" />;
  };

  const getEmotionColor = (emotion) => {
    const colors = {
      happy: 'text-green-600 bg-green-50',
      sad: 'text-blue-600 bg-blue-50',
      angry: 'text-red-600 bg-red-50',
      anxious: 'text-orange-600 bg-orange-50',
      lonely: 'text-purple-600 bg-purple-50',
      neutral: 'text-gray-600 bg-gray-50'
    };
    return colors[emotion] || 'text-gray-600 bg-gray-50';
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConcernLevel = () => {
    if (!speechEmotionStats || speechEmotionStats.totalReadings === 0) {
      return { level: 'low', color: 'text-green-600', bgColor: 'bg-green-50' };
    }

    const negativeEmotions = ['sad', 'angry', 'anxious', 'lonely'];
    let negativePercentage = 0;

    negativeEmotions.forEach(emotion => {
      negativePercentage += (speechEmotionStats.emotionPercentages[emotion] || 0);
    });

    if (negativePercentage > 60) {
      return { level: 'high', color: 'text-red-600', bgColor: 'bg-red-50' };
    } else if (negativePercentage > 35) {
      return { level: 'medium', color: 'text-orange-600', bgColor: 'bg-orange-50' };
    } else {
      return { level: 'low', color: 'text-green-600', bgColor: 'bg-green-50' };
    }
  };

  const getMoodTrend = () => {
    if (!speechEmotionStats || speechEmotionStats.totalReadings < 10) {
      return { trend: 'stable', icon: <Minus className="w-4 h-4" />, color: 'text-gray-600' };
    }

    // Simple trend analysis based on recent vs older emotions
    const recent = speechEmotionStats.emotionPercentages.happy || 0;
    const negative = (speechEmotionStats.emotionPercentages.sad || 0) + 
                     (speechEmotionStats.emotionPercentages.angry || 0) + 
                     (speechEmotionStats.emotionPercentages.anxious || 0);

    if (recent > negative * 1.5) {
      return { trend: 'improving', icon: <TrendingUp className="w-4 h-4" />, color: 'text-green-600' };
    } else if (negative > recent * 1.5) {
      return { trend: 'declining', icon: <TrendingDown className="w-4 h-4" />, color: 'text-red-600' };
    } else {
      return { trend: 'stable', icon: <Minus className="w-4 h-4" />, color: 'text-gray-600' };
    }
  };

  const concernLevel = getConcernLevel();
  const moodTrend = getMoodTrend();

  return (
    <div className="space-y-4">
      {/* Speech Analysis Status */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            {isAnalyzingSpeech ? (
              <Mic className="w-4 h-4 text-green-600 animate-pulse" />
            ) : (
              <MicOff className="w-4 h-4 text-gray-400" />
            )}
            Speech Emotion Analysis
          </h3>
          {demoMode && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
              Demo Mode
            </span>
          )}
        </div>
        
        <div className="text-xs text-gray-600">
          {isAnalyzingSpeech ? (
            <span className="text-green-600 font-medium">● Active - Analyzing speech patterns</span>
          ) : (
            <span className="text-gray-400">○ Inactive - Start call to begin analysis</span>
          )}
        </div>
      </div>

      {/* Call Duration */}
      {statistics.startTime && (
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm">Call Duration</h3>
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatDuration(statistics.duration)}
          </p>
        </div>
      )}

      {/* Speech Emotion Statistics */}
      {speechEmotionStats && speechEmotionStats.totalReadings > 0 && (
        <>
          {/* Dominant Emotion */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-red-500" />
              <h3 className="font-bold text-sm">Current Emotional State</h3>
            </div>
            
            <div className={`flex items-center gap-3 p-3 rounded-lg ${getEmotionColor(speechEmotionStats.dominantEmotion)}`}>
              {getEmotionIcon(speechEmotionStats.dominantEmotion)}
              <div className="flex-1">
                <p className="font-semibold capitalize">
                  {speechEmotionStats.dominantEmotion}
                </p>
                <p className="text-xs opacity-75">
                  {Math.round(speechEmotionStats.emotionPercentages[speechEmotionStats.dominantEmotion] || 0)}% of conversation
                </p>
              </div>
            </div>
          </div>

          {/* Emotion Breakdown */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm">Emotion Breakdown</h3>
            </div>
            
            <div className="space-y-2">
              {Object.entries(speechEmotionStats.emotionPercentages)
                .sort((a, b) => b[1] - a[1])
                .map(([emotion, percentage]) => (
                  <div key={emotion} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${
                          emotion === 'happy' ? 'bg-green-500' :
                          emotion === 'sad' ? 'bg-blue-500' :
                          emotion === 'angry' ? 'bg-red-500' :
                          emotion === 'anxious' ? 'bg-orange-500' :
                          emotion === 'lonely' ? 'bg-purple-500' :
                          'bg-gray-500'
                        }`}></span>
                        <span className="capitalize font-medium">{emotion}</span>
                      </div>
                      <span className="text-gray-600 font-semibold">
                        {Math.round(percentage)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          emotion === 'happy' ? 'bg-green-500' :
                          emotion === 'sad' ? 'bg-blue-500' :
                          emotion === 'angry' ? 'bg-red-500' :
                          emotion === 'anxious' ? 'bg-orange-500' :
                          emotion === 'lonely' ? 'bg-purple-500' :
                          'bg-gray-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Concern Level */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <h3 className="font-bold text-sm">Concern Level</h3>
            </div>
            
            <div className={`flex items-center gap-3 p-3 rounded-lg ${concernLevel.bgColor}`}>
              <div className={`text-2xl font-bold ${concernLevel.color} capitalize`}>
                {concernLevel.level}
              </div>
              <div className="text-xs text-gray-600 flex-1">
                Based on emotional patterns detected in speech
              </div>
            </div>
          </div>

          {/* Mood Trend */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-sm">Mood Trend</h3>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gray-50 ${moodTrend.color}`}>
                {moodTrend.icon}
              </div>
              <div className="flex-1">
                <p className={`font-semibold capitalize ${moodTrend.color}`}>
                  {moodTrend.trend}
                </p>
                <p className="text-xs text-gray-600">
                  {moodTrend.trend === 'improving' && 'Patient showing positive emotional improvement'}
                  {moodTrend.trend === 'declining' && 'Patient may need additional support'}
                  {moodTrend.trend === 'stable' && 'Patient emotions remain consistent'}
                </p>
              </div>
            </div>
          </div>

          {/* Statistics Summary */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <h3 className="font-bold text-sm mb-3">Analysis Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Readings:</span>
                <span className="font-semibold">{speechEmotionStats.totalReadings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Confidence:</span>
                <span className="font-semibold">
                  {Math.round((speechEmotionStats.averageConfidence || 0) * 100)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Analysis Mode:</span>
                <span className="font-semibold">{demoMode ? 'Demo' : 'Real-time'}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* No Data Message */}
      {(!speechEmotionStats || speechEmotionStats.totalReadings === 0) && isAnalyzingSpeech && (
        <div className="bg-white rounded-xl shadow-lg p-4">
          <div className="text-center text-gray-500 text-sm py-4">
            <Mic className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-pulse" />
            <p>Listening for speech...</p>
            <p className="text-xs mt-1">Speak to begin emotion analysis</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedStatisticsPanel;
