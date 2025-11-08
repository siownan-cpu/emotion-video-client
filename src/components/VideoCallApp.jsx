import React from 'react';
import UserProfileHeader from './UserProfileHeader';
import EmotionVideoCallWithWebRTC from './emotion-video-call-webrtc';

const VideoCallApp = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <UserProfileHeader />
      <EmotionVideoCallWithWebRTC />
    </div>
  );
};

export default VideoCallApp;
