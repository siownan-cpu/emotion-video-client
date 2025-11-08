import React from 'react';
import { Smile, Frown, Meh, AlertCircle, Heart, TrendingUp } from 'lucide-react';

const SpeechEmotionIndicator = ({ currentEmotion, confidence, transcript, isDemo }) => {
  if (!currentEmotion) return null;

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
      happy: 'bg-green-500',
      sad: 'bg-blue-500',
      angry: 'bg-red-500',
      anxious: 'bg-orange-500',
      lonely: 'bg-purple-500',
      neutral: 'bg-gray-500'
    };
    return colors[emotion] || 'bg-gray-500';
  };

  const getBorderColor = (emotion) => {
    const colors = {
      happy: 'border-green-500',
      sad: 'border-blue-500',
      angry: 'border-red-500',
      anxious: 'border-orange-500',
      lonely: 'border-purple-500',
      neutral: 'border-gray-500'
    };
    return colors[emotion] || 'border-gray-500';
  };

  const getBackgroundColor = (emotion) => {
    const colors = {
      happy: 'bg-green-50 bg-opacity-95',
      sad: 'bg-blue-50 bg-opacity-95',
      angry: 'bg-red-50 bg-opacity-95',
      anxious: 'bg-orange-50 bg-opacity-95',
      lonely: 'bg-purple-50 bg-opacity-95',
      neutral: 'bg-gray-50 bg-opacity-95'
    };
    return colors[emotion] || 'bg-gray-50 bg-opacity-95';
  };

  const getTextColor = (emotion) => {
    const colors = {
      happy: 'text-green-700',
      sad: 'text-blue-700',
      angry: 'text-red-700',
      anxious: 'text-orange-700',
      lonely: 'text-purple-700',
      neutral: 'text-gray-700'
    };
    return colors[emotion] || 'text-gray-700';
  };

  return (
    <div className={`absolute bottom-4 left-4 right-4 ${getBackgroundColor(currentEmotion)} backdrop-blur-sm border-2 ${getBorderColor(currentEmotion)} rounded-lg p-3 shadow-lg animate-fade-in`}>
      <div className="flex items-start gap-3">
        {/* Emotion Icon */}
        <div className={`${getEmotionColor(currentEmotion)} text-white p-2 rounded-lg flex-shrink-0`}>
          {getEmotionIcon(currentEmotion)}
        </div>

        {/* Emotion Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-bold capitalize text-sm ${getTextColor(currentEmotion)}`}>
              {currentEmotion}
            </h4>
            {isDemo && (
              <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
                Demo
              </span>
            )}
          </div>

          {/* Confidence Bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Confidence</span>
              <span className="font-semibold">{Math.round(confidence * 100)}%</span>
            </div>
            <div className="w-full bg-white bg-opacity-50 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${getEmotionColor(currentEmotion)} transition-all duration-300`}
                style={{ width: `${confidence * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Transcript */}
          {transcript && (
            <p className="text-xs text-gray-700 italic truncate">
              "{transcript}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeechEmotionIndicator;
