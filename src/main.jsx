import React from 'react'
import ReactDOM from 'react-dom/client'
import EmotionVideoCallWithWebRTC from './components/emotion-video-call-webrtc'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EmotionVideoCallWithWebRTC />
  </React.StrictMode>,
)