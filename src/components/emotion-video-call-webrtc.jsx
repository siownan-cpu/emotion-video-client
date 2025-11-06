import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check, TrendingUp, Clock, BarChart3 } from 'lucide-react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check, TrendingUp, Clock, BarChart3, Wifi, WifiOff } from 'lucide-react';
import io from 'socket.io-client';

const EmotionVideoCallWithWebRTC = () => {
@@ -14,7 +14,13 @@ const EmotionVideoCallWithWebRTC = () => {
const [isConnected, setIsConnected] = useState(false);
const [copied, setCopied] = useState(false);

  // Emotion states
  // ✨ NEW: Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState({
    socket: 'disconnected',
    peer: 'disconnected',
    ice: 'new'
  });
  
const [localEmotions, setLocalEmotions] = useState({
primary: 'neutral',
confidence: 0,
@@ -26,7 +32,6 @@ const EmotionVideoCallWithWebRTC = () => {
history: []
});

  // ✨ NEW: Cumulative statistics for caregiver
const [callStatistics, setCallStatistics] = useState({
startTime: null,
duration: 0,
@@ -49,12 +54,11 @@ const EmotionVideoCallWithWebRTC = () => {
alertsTriggered: 0,
avgConfidence: 0,
totalReadings: 0,
    moodTrend: 'stable', // 'improving', 'declining', 'stable'
    concernLevel: 'low', // 'low', 'medium', 'high'
    engagementScore: 0 // 0-100
    moodTrend: 'stable',
    concernLevel: 'low',
    engagementScore: 0
});

  // Alert states
const [alerts, setAlerts] = useState([]);
const [speechSentiment, setSpeechSentiment] = useState({ score: 0, text: '' });

@@ -65,8 +69,9 @@ const EmotionVideoCallWithWebRTC = () => {
const analysisIntervalRef = useRef(null);
const statisticsIntervalRef = useRef(null);
const localStreamRef = useRef(null);
  const remotePeerIdRef = useRef(null); // Track remote peer ID
  const reconnectTimeoutRef = useRef(null); // For reconnection attempts

  // CRITICAL: Effect to set local video stream whenever it changes
useEffect(() => {
console.log('Local stream effect triggered, stream:', localStream);
if (localStream && localVideoRef.current) {
@@ -78,7 +83,6 @@ const EmotionVideoCallWithWebRTC = () => {
}
}, [localStream]);

  // CRITICAL: Effect to set remote video stream whenever it changes
useEffect(() => {
console.log('Remote stream effect triggered, stream:', remoteStream);
if (remoteStream && remoteVideoRef.current) {
@@ -90,208 +94,338 @@ const EmotionVideoCallWithWebRTC = () => {
}
}, [remoteStream]);

  // STUN servers for NAT traversal
  // ✨ ENHANCED: Better ICE servers with more STUN/TURN options
const iceServers = {
iceServers: [
{ urls: 'stun:stun.l.google.com:19302' },
{ urls: 'stun:stun1.l.google.com:19302' },
{ urls: 'stun:stun2.l.google.com:19302' },
{ urls: 'stun:stun3.l.google.com:19302' },
    ]
      { urls: 'stun:stun4.l.google.com:19302' },
      // Additional public STUN servers for better NAT traversal
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.stunprotocol.org:3478' }
    ],
    iceCandidatePoolSize: 10
};

  // Connect to signaling server
const connectToServer = () => {
const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
console.log('🔧 Connecting to server:', serverUrl);
    console.log('🔧 Environment variable VITE_SERVER_URL:', import.meta.env.VITE_SERVER_URL);

socketRef.current = io(serverUrl, {
transports: ['websocket', 'polling'],
reconnection: true,
reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
      reconnectionAttempts: 10, // Increased reconnection attempts
      timeout: 20000, // Increased timeout
autoConnect: true
});

socketRef.current.on('connect', () => {
console.log('✅ Connected to signaling server');
console.log('✅ Socket ID:', socketRef.current.id);
      setConnectionStatus(prev => ({ ...prev, socket: 'connected' }));
});

socketRef.current.on('connect_error', (error) => {
console.error('❌ Connection error:', error.message);
      console.error('❌ Attempted URL:', serverUrl);
      setConnectionStatus(prev => ({ ...prev, socket: 'error' }));
});

socketRef.current.on('disconnect', (reason) => {
console.log('⚠️ Disconnected:', reason);
      setConnectionStatus(prev => ({ ...prev, socket: 'disconnected' }));
      
      // ✨ NEW: Auto-rejoin room on reconnection
      if (reason === 'io server disconnect') {
        socketRef.current.connect();
      }
});

socketRef.current.on('reconnect', (attemptNumber) => {
console.log('🔄 Reconnected after', attemptNumber, 'attempts');
      setConnectionStatus(prev => ({ ...prev, socket: 'connected' }));
      
      // ✨ NEW: Rejoin room after reconnection
      if (currentRoomId) {
        console.log('🔄 Rejoining room:', currentRoomId);
        socketRef.current.emit('join-room', currentRoomId);
      }
});

socketRef.current.on('room-users', async (users) => {
      console.log('Room users:', users);
      if (users.length > 0) {
        console.log('Creating offer for existing user');
      console.log('📋 Room users:', users);
      if (users.length > 0 && users[0] !== socketRef.current.id) {
        console.log('🤝 Creating offer for existing user:', users[0]);
        remotePeerIdRef.current = users[0];
await createOffer(users[0], localStreamRef.current);
}
});

socketRef.current.on('user-joined', async (userId) => {
console.log('✅ User joined:', userId);
      remotePeerIdRef.current = userId;
});

socketRef.current.on('offer', async (data) => {
      console.log('📨 Received offer');
      console.log('📨 Received offer from:', data.from);
      remotePeerIdRef.current = data.from;
await handleOffer(data);
});

socketRef.current.on('answer', async (data) => {
      console.log('📨 Received answer');
      console.log('📨 Received answer from:', data.from);
await handleAnswer(data);
});

socketRef.current.on('ice-candidate', async (data) => {
      console.log('📨 Received ICE candidate');
      console.log('📨 Received ICE candidate from:', data.from);
await handleIceCandidate(data);
});

    socketRef.current.on('user-left', () => {
      console.log('❌ User left');
      handleUserLeft();
    socketRef.current.on('user-left', (data) => {
      console.log('❌ User left:', data.userId);
      if (data.userId === remotePeerIdRef.current) {
        handleUserLeft();
      }
});

socketRef.current.on('room-full', () => {
alert('Room is full! Maximum 2 participants allowed.');
});
};

  // Create peer connection
  // ✨ ENHANCED: Better peer connection with connection state monitoring
const createPeerConnection = (remotePeerId, stream) => {
    console.log('🔗 Creating peer connection for:', remotePeerId);
    
    // Close existing connection if any
    if (peerConnectionRef.current) {
      console.log('🔄 Closing existing peer connection');
      peerConnectionRef.current.close();
    }

const peerConnection = new RTCPeerConnection(iceServers);
peerConnectionRef.current = peerConnection;

    console.log('Creating peer connection with:', remotePeerId);
    console.log('Stream to add:', stream);

    // ✨ ENHANCED: Better track handling
if (stream) {
const tracks = stream.getTracks();
      console.log('📹 Adding tracks to peer connection:', tracks.length, 'tracks');
      console.log('📹 Adding', tracks.length, 'tracks to peer connection');
tracks.forEach(track => {
        console.log('  - Adding', track.kind, 'track:', track.label, 'enabled:', track.enabled);
        peerConnection.addTrack(track, stream);
        console.log('  ➕', track.kind, 'track:', track.label);
        const sender = peerConnection.addTrack(track, stream);
        console.log('  ✅ Track added with sender:', sender);
});
      console.log('✅ All tracks added to peer connection');
    } else {
      console.error('❌ No stream to add to peer connection!');
}

    // ✨ CRITICAL: Better ontrack handling with error recovery
peerConnection.ontrack = (event) => {
      console.log('🎉 ontrack event fired!');
      console.log('  - Track kind:', event.track.kind);
      console.log('  - Track enabled:', event.track.enabled);
      console.log('  - Track readyState:', event.track.readyState);
      console.log('  - Streams:', event.streams.length);
      console.log('  - Stream tracks:', event.streams[0]?.getTracks().length);
      console.log('🎉 ontrack event!');
      console.log('  📹 Track:', event.track.kind, '| Enabled:', event.track.enabled, '| ReadyState:', event.track.readyState);
      console.log('  📺 Streams:', event.streams.length);

      const remoteStreamReceived = event.streams[0];
      console.log('Setting remote stream:', remoteStreamReceived);
      setRemoteStream(remoteStreamReceived);
      setIsConnected(true);
      setAnalyzing(true);
      startAnalysis();
      startStatisticsTracking();
      if (event.streams && event.streams[0]) {
        const remoteStreamReceived = event.streams[0];
        console.log('✅ Setting remote stream with', remoteStreamReceived.getTracks().length, 'tracks');
        setRemoteStream(remoteStreamReceived);
        setIsConnected(true);
        setAnalyzing(true);
        startAnalysis();
        startStatisticsTracking();
        
        // ✨ NEW: Monitor track events
        event.track.onended = () => {
          console.log('⚠️ Track ended:', event.track.kind);
        };
        
        event.track.onmute = () => {
          console.log('⚠️ Track muted:', event.track.kind);
        };
        
        event.track.onunmute = () => {
          console.log('✅ Track unmuted:', event.track.kind);
        };
      }
};

    // ✨ ENHANCED: ICE candidate handling with error recovery
peerConnection.onicecandidate = (event) => {
if (event.candidate) {
        console.log('Sending ICE candidate');
        console.log('🧊 Sending ICE candidate');
socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          candidate: event.candidate.toJSON(),
to: remotePeerId
});
      } else {
        console.log('✅ All ICE candidates sent');
}
};

    // ✨ CRITICAL: Enhanced connection state monitoring
peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed') {
        handleUserLeft();
      const state = peerConnection.connectionState;
      console.log('🔄 Connection state changed:', state);
      setConnectionStatus(prev => ({ ...prev, peer: state }));
      
      if (state === 'connected') {
        console.log('✅✅✅ Peer connection ESTABLISHED!');
        setIsConnected(true);
      } else if (state === 'disconnected') {
        console.log('⚠️ Peer connection DISCONNECTED - attempting recovery...');
        setIsConnected(false);
        attemptReconnection();
      } else if (state === 'failed') {
        console.log('❌ Peer connection FAILED - will restart');
        setIsConnected(false);
        handleConnectionFailure();
      } else if (state === 'closed') {
        console.log('🔒 Peer connection CLOSED');
        setIsConnected(false);
}
};

    // ✨ ENHANCED: ICE connection state monitoring
peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
      const state = peerConnection.iceConnectionState;
      console.log('❄️ ICE connection state:', state);
      setConnectionStatus(prev => ({ ...prev, ice: state }));
      
      if (state === 'disconnected' || state === 'failed') {
        console.log('⚠️ ICE connection issue:', state);
        // Don't immediately close - give it time to recover
        reconnectTimeoutRef.current = setTimeout(() => {
          if (peerConnection.iceConnectionState === 'disconnected' || 
              peerConnection.iceConnectionState === 'failed') {
            console.log('❌ ICE connection timeout - restarting');
            attemptReconnection();
          }
        }, 5000); // Wait 5 seconds before attempting recovery
      } else if (state === 'connected' || state === 'completed') {
        console.log('✅ ICE connection established!');
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      }
};

peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', peerConnection.iceGatheringState);
      console.log('📡 ICE gathering state:', peerConnection.iceGatheringState);
    };

    // ✨ NEW: Handle negotiation needed
    peerConnection.onnegotiationneeded = async () => {
      console.log('🔄 Negotiation needed');
      // Don't automatically renegotiate to avoid loops
};

return peerConnection;
};

  // ✨ NEW: Attempt to reconnect peer connection
  const attemptReconnection = async () => {
    console.log('🔄 Attempting peer connection recovery...');
    
    if (!remotePeerIdRef.current || !localStreamRef.current) {
      console.log('⚠️ Cannot reconnect - missing peer ID or local stream');
      return;
    }
    
    // Create new offer to re-establish connection
    await createOffer(remotePeerIdRef.current, localStreamRef.current);
  };

  // ✨ NEW: Handle complete connection failure
  const handleConnectionFailure = () => {
    console.log('❌ Handling connection failure');
    addAlert('Connection lost - attempting to reconnect...', 'warning');
    
    // Clean up failed connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    setRemoteStream(null);
    setIsConnected(false);
    stopAnalysis();
    stopStatisticsTracking();
    
    // Attempt to reconnect after delay
    setTimeout(() => {
      if (remotePeerIdRef.current && localStreamRef.current && currentRoomId) {
        console.log('🔄 Retrying connection...');
        createOffer(remotePeerIdRef.current, localStreamRef.current);
      }
    }, 2000);
  };

const createOffer = async (remotePeerId, stream) => {
    console.log('createOffer called with stream:', stream);
    console.log('📤 Creating offer for:', remotePeerId);
const peerConnection = createPeerConnection(remotePeerId, stream);

try {
const offer = await peerConnection.createOffer({
offerToReceiveVideo: true,
        offerToReceiveAudio: true
        offerToReceiveAudio: true,
        iceRestart: true // ✨ NEW: Allow ICE restart
});
      
await peerConnection.setLocalDescription(offer);
      console.log('📤 Sending offer');

      console.log('Sending offer to:', remotePeerId);
socketRef.current.emit('offer', {
offer,
        to: remotePeerId
        to: remotePeerId,
        from: socketRef.current.id
});
} catch (error) {
      console.error('Error creating offer:', error);
      console.error('❌ Error creating offer:', error);
      addAlert('Failed to create connection offer', 'alert');
}
};

const handleOffer = async (data) => {
    console.log('handleOffer called with data from:', data.from);
    console.log('📥 Handling offer from:', data.from);
const peerConnection = createPeerConnection(data.from, localStreamRef.current);

try {
await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      console.log('✅ Remote description set');
      
const answer = await peerConnection.createAnswer();
await peerConnection.setLocalDescription(answer);
      console.log('📤 Sending answer');

      console.log('Sending answer to:', data.from);
socketRef.current.emit('answer', {
answer,
        to: data.from
        to: data.from,
        from: socketRef.current.id
});
} catch (error) {
      console.error('Error handling offer:', error);
      console.error('❌ Error handling offer:', error);
      addAlert('Failed to handle connection offer', 'alert');
}
};

const handleAnswer = async (data) => {
    console.log('handleAnswer called');
    console.log('📥 Handling answer');
try {
      if (peerConnectionRef.current) {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
await peerConnectionRef.current.setRemoteDescription(
new RTCSessionDescription(data.answer)
);
        console.log('✅ Answer set successfully');
        console.log('✅ Answer processed');
      } else {
        console.log('⚠️ Cannot set answer - connection not in right state');
}
} catch (error) {
      console.error('Error handling answer:', error);
      console.error('❌ Error handling answer:', error);
}
};

const handleIceCandidate = async (data) => {
    console.log('handleIceCandidate called');
try {
if (peerConnectionRef.current && data.candidate) {
await peerConnectionRef.current.addIceCandidate(
@@ -300,12 +434,17 @@ const EmotionVideoCallWithWebRTC = () => {
console.log('✅ ICE candidate added');
}
} catch (error) {
      console.error('Error adding ICE candidate:', error);
      console.error('❌ Error adding ICE candidate:', error);
}
};

const handleUserLeft = () => {
    console.log('Handling user left');
    console.log('👋 Remote user left');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
setRemoteStream(null);
setIsConnected(false);
stopAnalysis();
@@ -316,22 +455,23 @@ const EmotionVideoCallWithWebRTC = () => {
peerConnectionRef.current = null;
}

    remotePeerIdRef.current = null;
addAlert('Remote user disconnected', 'warning');
};

  // Start call
const startCall = async () => {
if (!roomId.trim()) {
alert('Please enter a room ID');
return;
}

try {
      console.log('🎥 Starting call, requesting media...');
      console.log('🎥 Starting call...');
const stream = await navigator.mediaDevices.getUserMedia({
video: {
width: { ideal: 1280 },
          height: { ideal: 720 }
          height: { ideal: 720 },
          facingMode: 'user'
},
audio: {
echoCancellation: true,
@@ -340,14 +480,13 @@ const EmotionVideoCallWithWebRTC = () => {
}
});

      console.log('✅ Media stream obtained:', stream);
      console.log('✅ Media stream obtained');

setLocalStream(stream);
localStreamRef.current = stream;
setCallActive(true);
setCurrentRoomId(roomId);

      // Initialize statistics
setCallStatistics(prev => ({
...prev,
startTime: Date.now()
@@ -356,24 +495,31 @@ const EmotionVideoCallWithWebRTC = () => {
connectToServer();

setTimeout(() => {
        console.log('Joining room:', roomId);
        console.log('🚪 Joining room:', roomId);
socketRef.current.emit('join-room', roomId);
}, 1000);

} catch (error) {
      console.error('❌ Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
      console.error('❌ Error accessing media:', error);
      alert('Could not access camera/microphone: ' + error.message);
}
};

  // End call
const endCall = () => {
    console.log('Ending call');
    console.log('📞 Ending call');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
stopAnalysis();
stopStatisticsTracking();

if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Stopped track:', track.kind);
      });
}

if (peerConnectionRef.current) {
@@ -395,6 +541,13 @@ const EmotionVideoCallWithWebRTC = () => {
localStreamRef.current = null;
peerConnectionRef.current = null;
socketRef.current = null;
    remotePeerIdRef.current = null;
    
    setConnectionStatus({
      socket: 'disconnected',
      peer: 'disconnected',
      ice: 'new'
    });
};

const toggleVideo = () => {
@@ -417,18 +570,13 @@ const EmotionVideoCallWithWebRTC = () => {
}
};

  // ✨ ENHANCED: More realistic emotion detection (still simulated but more believable)
const detectEmotion = (videoElement, isLocal = false) => {
if (!videoElement || videoElement.readyState !== 4) {
return null;
}

    // Simulated emotion detection with more realistic patterns
    // In production, this would use TensorFlow.js with face-api.js or similar
const emotions = ['happy', 'sad', 'neutral', 'angry', 'surprised', 'fearful'];
    
    // Weight emotions more realistically (neutral and happy are more common)
    const weights = [0.30, 0.15, 0.35, 0.05, 0.10, 0.05]; // Adds up to 1.0
    const weights = [0.30, 0.15, 0.35, 0.05, 0.10, 0.05];
const random = Math.random();
let cumulative = 0;
let selectedEmotion = 'neutral';
@@ -441,7 +589,6 @@ const EmotionVideoCallWithWebRTC = () => {
}
}

    // Add slight randomness to confidence
const baseConfidence = 0.65;
const variability = 0.25;
const confidence = baseConfidence + (Math.random() * variability);
@@ -453,7 +600,6 @@ const EmotionVideoCallWithWebRTC = () => {
};
};

  // ✨ NEW: Calculate cumulative statistics
const calculateStatistics = () => {
if (remoteEmotions.history.length === 0) {
console.log('📊 No emotion history yet');
@@ -464,7 +610,6 @@ const EmotionVideoCallWithWebRTC = () => {
const totalReadings = history.length;
console.log('📊 Calculating statistics for', totalReadings, 'readings');

    // Count each emotion
const counts = {
happy: 0,
sad: 0,
@@ -481,16 +626,13 @@ const EmotionVideoCallWithWebRTC = () => {
totalConfidence += emotion.confidence;
});

    // Calculate percentages
const percentages = {};
Object.keys(counts).forEach(emotion => {
percentages[emotion] = (counts[emotion] / totalReadings) * 100;
});

    // Calculate average confidence
const avgConfidence = totalConfidence / totalReadings;

    // Determine mood trend (last 10 readings vs previous 10)
let moodTrend = 'stable';
if (history.length >= 20) {
const recent = history.slice(-10);
@@ -506,7 +648,6 @@ const EmotionVideoCallWithWebRTC = () => {
}
}

    // Calculate concern level
const negativePercentage = percentages.sad + percentages.angry + percentages.fearful;
let concernLevel = 'low';
if (negativePercentage > 40) {
@@ -515,7 +656,6 @@ const EmotionVideoCallWithWebRTC = () => {
concernLevel = 'medium';
}

    // Calculate engagement score (0-100)
const engagementScore = Math.round(
(percentages.happy * 1.0 + 
percentages.surprised * 0.8 + 
@@ -525,7 +665,6 @@ const EmotionVideoCallWithWebRTC = () => {
percentages.angry * 0.1)
);

    // Calculate call duration
const duration = callStatistics.startTime 
? Math.floor((Date.now() - callStatistics.startTime) / 1000) 
: 0;
@@ -544,26 +683,23 @@ const EmotionVideoCallWithWebRTC = () => {
});
};

  // ✨ NEW: Start statistics tracking
const startStatisticsTracking = () => {
if (statisticsIntervalRef.current) {
clearInterval(statisticsIntervalRef.current);
}

statisticsIntervalRef.current = setInterval(() => {
calculateStatistics();
    }, 3000); // Update every 3 seconds
    }, 3000);
};

  // ✨ NEW: Stop statistics tracking
const stopStatisticsTracking = () => {
if (statisticsIntervalRef.current) {
clearInterval(statisticsIntervalRef.current);
statisticsIntervalRef.current = null;
}
};

  // Start emotion analysis
const startAnalysis = () => {
if (analysisIntervalRef.current) {
clearInterval(analysisIntervalRef.current);
@@ -576,17 +712,16 @@ const EmotionVideoCallWithWebRTC = () => {
if (localEmotion) {
setLocalEmotions(prev => ({
...localEmotion,
          history: [...prev.history.slice(-99), localEmotion] // Keep last 100
          history: [...prev.history.slice(-99), localEmotion]
}));
}

if (remoteEmotion) {
setRemoteEmotions(prev => ({
...remoteEmotion,
          history: [...prev.history.slice(-99), remoteEmotion] // Keep last 100
          history: [...prev.history.slice(-99), remoteEmotion]
}));

        // Trigger alerts for concerning emotions
if (remoteEmotion.primary === 'sad' && remoteEmotion.confidence > 0.7) {
addAlert('Patient appears distressed', 'alert');
} else if (remoteEmotion.primary === 'angry' && remoteEmotion.confidence > 0.75) {
@@ -596,13 +731,12 @@ const EmotionVideoCallWithWebRTC = () => {
}
}

      // Simulate speech sentiment
const sentimentScore = Math.random() * 2 - 1;
setSpeechSentiment({
score: sentimentScore,
detectedPhrase: sentimentScore < -0.5 ? 'Negative tone detected' : null
});
    }, 2000); // Analyze every 2 seconds
    }, 2000);
};

const stopAnalysis = () => {
@@ -660,14 +794,12 @@ const EmotionVideoCallWithWebRTC = () => {
}
};

  // ✨ NEW: Format duration helper
const formatDuration = (seconds) => {
const mins = Math.floor(seconds / 60);
const secs = seconds % 60;
return `${mins}:${secs.toString().padStart(2, '0')}`;
};

  // ✨ NEW: Get concern level color
const getConcernLevelColor = (level) => {
switch (level) {
case 'low':
@@ -681,7 +813,6 @@ const EmotionVideoCallWithWebRTC = () => {
}
};

  // ✨ NEW: Get mood trend icon and color
const getMoodTrendDisplay = (trend) => {
switch (trend) {
case 'improving':
@@ -693,6 +824,24 @@ const EmotionVideoCallWithWebRTC = () => {
}
};

  // ✨ NEW: Get connection status color
  const getConnectionStatusColor = (status) => {
    switch (status) {
      case 'connected':
      case 'completed':
        return 'text-green-600';
      case 'connecting':
      case 'checking':
        return 'text-yellow-600';
      case 'disconnected':
      case 'failed':
      case 'closed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

return (
<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
<div className="container mx-auto px-4 py-8">
@@ -701,7 +850,7 @@ const EmotionVideoCallWithWebRTC = () => {
<Heart className="w-10 h-10 text-red-500" />
Emotion Video Call with Statistics
</h1>
          <p className="text-gray-600">Real-time emotion tracking with cumulative caregiver insights</p>
          <p className="text-gray-600">Real-time emotion tracking with stable connection</p>
</div>

{!callActive ? (
@@ -734,12 +883,42 @@ const EmotionVideoCallWithWebRTC = () => {
</div>
) : (
<>
            {/* ✨ NEW: Connection Status Bar */}
<div className="bg-white rounded-xl shadow-lg p-4 mb-6">
              <div className="flex items-center justify-between">
              <div className="flex items-center justify-between flex-wrap gap-4">
<div>
<p className="text-sm text-gray-600">Room ID:</p>
<p className="font-mono text-lg font-semibold text-gray-800">{currentRoomId}</p>
</div>
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    {connectionStatus.socket === 'connected' ? (
                      <Wifi className="w-4 h-4 text-green-600" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-red-600" />
                    )}
                    <span className={getConnectionStatusColor(connectionStatus.socket)}>
                      Server: {connectionStatus.socket}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      isConnected ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                      Peer: {connectionStatus.peer}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={getConnectionStatusColor(connectionStatus.ice)}>
                      ICE: {connectionStatus.ice}
                    </span>
                  </div>
                </div>
                
<button
onClick={copyRoomId}
className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
@@ -788,6 +967,9 @@ const EmotionVideoCallWithWebRTC = () => {
<div className="text-center">
<Camera className="w-16 h-16 text-gray-600 mx-auto mb-2" />
<p className="text-gray-400">Waiting for connection...</p>
                          <p className="text-xs text-gray-500 mt-2">
                            Status: {connectionStatus.peer} | ICE: {connectionStatus.ice}
                          </p>
</div>
</div>
)}
@@ -857,7 +1039,7 @@ const EmotionVideoCallWithWebRTC = () => {
</div>
</div>

                {/* ✨ NEW: Cumulative Statistics Dashboard */}
                {/* Statistics Dashboard */}
{isConnected && analyzing && (
<div className="bg-white rounded-xl shadow-lg p-6">
<h3 className="font-bold text-lg mb-4 flex items-center gap-2">
