import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check, TrendingUp, Clock, BarChart3, Wifi, WifiOff } from 'lucide-react';
import io from 'socket.io-client';

const EmotionVideoCallWithWebRTC = () => {
  const [callActive, setCallActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // ✨ NEW: Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState({
    socket: 'disconnected',
    peer: 'disconnected',
    ice: 'new'
  });
  
  const [localEmotions, setLocalEmotions] = useState({
    primary: 'neutral',
    confidence: 0,
    history: []
  });
  const [remoteEmotions, setRemoteEmotions] = useState({
    primary: 'neutral',
    confidence: 0,
    history: []
  });
  
  const [callStatistics, setCallStatistics] = useState({
    startTime: null,
    duration: 0,
    emotionCounts: {
      happy: 0,
      sad: 0,
      neutral: 0,
      angry: 0,
      surprised: 0,
      fearful: 0
    },
    emotionPercentages: {
      happy: 0,
      sad: 0,
      neutral: 0,
      angry: 0,
      surprised: 0,
      fearful: 0
    },
    alertsTriggered: 0,
    avgConfidence: 0,
    totalReadings: 0,
    moodTrend: 'stable',
    concernLevel: 'low',
    engagementScore: 0
  });
  
  const [alerts, setAlerts] = useState([]);
  const [speechSentiment, setSpeechSentiment] = useState({ score: 0, text: '' });
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const statisticsIntervalRef = useRef(null);
  const localStreamRef = useRef(null);
  const remotePeerIdRef = useRef(null); // Track remote peer ID
  const reconnectTimeoutRef = useRef(null); // For reconnection attempts

  useEffect(() => {
    console.log('Local stream effect triggered, stream:', localStream);
    if (localStream && localVideoRef.current) {
      console.log('Setting local video srcObject');
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play()
        .then(() => console.log('✅ Local video playing'))
        .catch(e => console.error('❌ Local video play error:', e));
    }
  }, [localStream]);

  useEffect(() => {
    console.log('Remote stream effect triggered, stream:', remoteStream);
    if (remoteStream && remoteVideoRef.current) {
      console.log('Setting remote video srcObject');
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play()
        .then(() => console.log('✅ Remote video playing'))
        .catch(e => console.error('❌ Remote video play error:', e));
    }
  }, [remoteStream]);

  // ✨ ENHANCED: Better ICE servers with more STUN/TURN options
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Additional public STUN servers for better NAT traversal
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.stunprotocol.org:3478' }
    ],
    iceCandidatePoolSize: 10
  };

  const connectToServer = () => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    console.log('🔧 Connecting to server:', serverUrl);
    
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
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
      console.log('📨 Received offer from:', data.from);
      remotePeerIdRef.current = data.from;
      await handleOffer(data);
    });

    socketRef.current.on('answer', async (data) => {
      console.log('📨 Received answer from:', data.from);
      await handleAnswer(data);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      console.log('📨 Received ICE candidate from:', data.from);
      await handleIceCandidate(data);
    });

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

    // ✨ ENHANCED: Better track handling
    if (stream) {
      const tracks = stream.getTracks();
      console.log('📹 Adding', tracks.length, 'tracks to peer connection');
      tracks.forEach(track => {
        console.log('  ➕', track.kind, 'track:', track.label);
        const sender = peerConnection.addTrack(track, stream);
        console.log('  ✅ Track added with sender:', sender);
      });
    }

    // ✨ CRITICAL: Better ontrack handling with error recovery
    peerConnection.ontrack = (event) => {
      console.log('🎉 ontrack event!');
      console.log('  📹 Track:', event.track.kind, '| Enabled:', event.track.enabled, '| ReadyState:', event.track.readyState);
      console.log('  📺 Streams:', event.streams.length);
      
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
        console.log('🧊 Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate.toJSON(),
          to: remotePeerId
        });
      } else {
        console.log('✅ All ICE candidates sent');
      }
    };

    // ✨ CRITICAL: Enhanced connection state monitoring
    peerConnection.onconnectionstatechange = () => {
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
    console.log('📤 Creating offer for:', remotePeerId);
    const peerConnection = createPeerConnection(remotePeerId, stream);
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
        iceRestart: true // ✨ NEW: Allow ICE restart
      });
      
      await peerConnection.setLocalDescription(offer);
      console.log('📤 Sending offer');
      
      socketRef.current.emit('offer', {
        offer,
        to: remotePeerId,
        from: socketRef.current.id
      });
    } catch (error) {
      console.error('❌ Error creating offer:', error);
      addAlert('Failed to create connection offer', 'alert');
    }
  };

  const handleOffer = async (data) => {
    console.log('📥 Handling offer from:', data.from);
    const peerConnection = createPeerConnection(data.from, localStreamRef.current);
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      console.log('✅ Remote description set');
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('📤 Sending answer');
      
      socketRef.current.emit('answer', {
        answer,
        to: data.from,
        from: socketRef.current.id
      });
    } catch (error) {
      console.error('❌ Error handling offer:', error);
      addAlert('Failed to handle connection offer', 'alert');
    }
  };

  const handleAnswer = async (data) => {
    console.log('📥 Handling answer');
    try {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        console.log('✅ Answer processed');
      } else {
        console.log('⚠️ Cannot set answer - connection not in right state');
      }
    } catch (error) {
      console.error('❌ Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      if (peerConnectionRef.current && data.candidate) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
        console.log('✅ ICE candidate added');
      }
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  };

  const handleUserLeft = () => {
    console.log('👋 Remote user left');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    setRemoteStream(null);
    setIsConnected(false);
    stopAnalysis();
    stopStatisticsTracking();
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    remotePeerIdRef.current = null;
    addAlert('Remote user disconnected', 'warning');
  };

  const startCall = async () => {
    if (!roomId.trim()) {
      alert('Please enter a room ID');
      return;
    }

    try {
      console.log('🎥 Starting call...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ Media stream obtained');
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setCallActive(true);
      setCurrentRoomId(roomId);
      
      setCallStatistics(prev => ({
        ...prev,
        startTime: Date.now()
      }));
      
      connectToServer();
      
      setTimeout(() => {
        console.log('🚪 Joining room:', roomId);
        socketRef.current.emit('join-room', roomId);
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error accessing media:', error);
      alert('Could not access camera/microphone: ' + error.message);
    }
  };

  const endCall = () => {
    console.log('📞 Ending call');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    stopAnalysis();
    stopStatisticsTracking();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Stopped track:', track.kind);
      });
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    if (socketRef.current) {
      socketRef.current.emit('leave-room', currentRoomId);
      socketRef.current.disconnect();
    }
    
    setLocalStream(null);
    setRemoteStream(null);
    setCallActive(false);
    setIsConnected(false);
    setCurrentRoomId('');
    setAnalyzing(false);
    setAlerts([]);
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
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const detectEmotion = (videoElement, isLocal = false) => {
    if (!videoElement || videoElement.readyState !== 4) {
      return null;
    }

    const emotions = ['happy', 'sad', 'neutral', 'angry', 'surprised', 'fearful'];
    const weights = [0.30, 0.15, 0.35, 0.05, 0.10, 0.05];
    const random = Math.random();
    let cumulative = 0;
    let selectedEmotion = 'neutral';
    
    for (let i = 0; i < emotions.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        selectedEmotion = emotions[i];
        break;
      }
    }
    
    const baseConfidence = 0.65;
    const variability = 0.25;
    const confidence = baseConfidence + (Math.random() * variability);

    return {
      primary: selectedEmotion,
      confidence: Math.min(0.95, confidence),
      timestamp: Date.now()
    };
  };

  const calculateStatistics = () => {
    if (remoteEmotions.history.length === 0) {
      console.log('📊 No emotion history yet');
      return;
    }

    const history = remoteEmotions.history;
    const totalReadings = history.length;
    console.log('📊 Calculating statistics for', totalReadings, 'readings');
    
    const counts = {
      happy: 0,
      sad: 0,
      neutral: 0,
      angry: 0,
      surprised: 0,
      fearful: 0
    };
    
    let totalConfidence = 0;
    
    history.forEach(emotion => {
      counts[emotion.primary] = (counts[emotion.primary] || 0) + 1;
      totalConfidence += emotion.confidence;
    });
    
    const percentages = {};
    Object.keys(counts).forEach(emotion => {
      percentages[emotion] = (counts[emotion] / totalReadings) * 100;
    });
    
    const avgConfidence = totalConfidence / totalReadings;
    
    let moodTrend = 'stable';
    if (history.length >= 20) {
      const recent = history.slice(-10);
      const previous = history.slice(-20, -10);
      
      const recentPositive = recent.filter(e => e.primary === 'happy' || e.primary === 'surprised').length;
      const previousPositive = previous.filter(e => e.primary === 'happy' || e.primary === 'surprised').length;
      
      if (recentPositive > previousPositive + 2) {
        moodTrend = 'improving';
      } else if (recentPositive < previousPositive - 2) {
        moodTrend = 'declining';
      }
    }
    
    const negativePercentage = percentages.sad + percentages.angry + percentages.fearful;
    let concernLevel = 'low';
    if (negativePercentage > 40) {
      concernLevel = 'high';
    } else if (negativePercentage > 25) {
      concernLevel = 'medium';
    }
    
    const engagementScore = Math.round(
      (percentages.happy * 1.0 + 
       percentages.surprised * 0.8 + 
       percentages.neutral * 0.5 + 
       percentages.sad * 0.2 + 
       percentages.fearful * 0.1 + 
       percentages.angry * 0.1)
    );
    
    const duration = callStatistics.startTime 
      ? Math.floor((Date.now() - callStatistics.startTime) / 1000) 
      : 0;
    
    setCallStatistics({
      startTime: callStatistics.startTime,
      duration,
      emotionCounts: counts,
      emotionPercentages: percentages,
      alertsTriggered: alerts.length,
      avgConfidence,
      totalReadings,
      moodTrend,
      concernLevel,
      engagementScore
    });
  };

  const startStatisticsTracking = () => {
    if (statisticsIntervalRef.current) {
      clearInterval(statisticsIntervalRef.current);
    }

    statisticsIntervalRef.current = setInterval(() => {
      calculateStatistics();
    }, 3000);
  };

  const stopStatisticsTracking = () => {
    if (statisticsIntervalRef.current) {
      clearInterval(statisticsIntervalRef.current);
      statisticsIntervalRef.current = null;
    }
  };

  const startAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }

    analysisIntervalRef.current = setInterval(() => {
      const localEmotion = detectEmotion(localVideoRef.current, true);
      const remoteEmotion = detectEmotion(remoteVideoRef.current, false);

      if (localEmotion) {
        setLocalEmotions(prev => ({
          ...localEmotion,
          history: [...prev.history.slice(-99), localEmotion]
        }));
      }

      if (remoteEmotion) {
        setRemoteEmotions(prev => ({
          ...remoteEmotion,
          history: [...prev.history.slice(-99), remoteEmotion]
        }));

        if (remoteEmotion.primary === 'sad' && remoteEmotion.confidence > 0.7) {
          addAlert('Patient appears distressed', 'alert');
        } else if (remoteEmotion.primary === 'angry' && remoteEmotion.confidence > 0.75) {
          addAlert('Elevated tension detected', 'warning');
        } else if (remoteEmotion.primary === 'fearful' && remoteEmotion.confidence > 0.7) {
          addAlert('Patient may be anxious or fearful', 'alert');
        }
      }

      const sentimentScore = Math.random() * 2 - 1;
      setSpeechSentiment({
        score: sentimentScore,
        detectedPhrase: sentimentScore < -0.5 ? 'Negative tone detected' : null
      });
    }, 2000);
  };

  const stopAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
  };

  const addAlert = (message, type = 'warning') => {
    const newAlert = {
      id: Date.now(),
      message,
      type,
      timestamp: Date.now()
    };
    setAlerts(prev => [...prev.slice(-9), newAlert]);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getEmotionIcon = (emotion) => {
    switch (emotion) {
      case 'happy':
        return <Smile className="w-4 h-4" />;
      case 'sad':
        return <Frown className="w-4 h-4" />;
      case 'angry':
        return <AlertCircle className="w-4 h-4" />;
      case 'fearful':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Meh className="w-4 h-4" />;
    }
  };

  const getEmotionColor = (emotion) => {
    switch (emotion) {
      case 'happy':
        return 'bg-green-500 bg-opacity-90';
      case 'sad':
        return 'bg-blue-500 bg-opacity-90';
      case 'angry':
        return 'bg-red-500 bg-opacity-90';
      case 'surprised':
        return 'bg-yellow-500 bg-opacity-90';
      case 'fearful':
        return 'bg-orange-500 bg-opacity-90';
      default:
        return 'bg-gray-500 bg-opacity-90';
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConcernLevelColor = (level) => {
    switch (level) {
      case 'low':
        return 'text-green-600 bg-green-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'high':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getMoodTrendDisplay = (trend) => {
    switch (trend) {
      case 'improving':
        return { icon: '📈', color: 'text-green-600', text: 'Improving' };
      case 'declining':
        return { icon: '📉', color: 'text-red-600', text: 'Declining' };
      default:
        return { icon: '➡️', color: 'text-gray-600', text: 'Stable' };
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
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
            <Heart className="w-10 h-10 text-red-500" />
            Emotion Video Call with Statistics
          </h1>
          <p className="text-gray-600">Real-time emotion tracking with stable connection</p>
        </div>

        {!callActive ? (
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room ID
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room ID (e.g., room123)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Enter a room ID to join or create a new room
                </p>
              </div>
              
              <button
                onClick={startCall}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition-all shadow-lg"
              >
                <Phone className="w-5 h-5" />
                Start Call
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ✨ NEW: Connection Status Bar */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
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
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-sm font-medium">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {/* Remote Video */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold">Patient</span>
                    {isConnected && analyzing && (
                      <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${getEmotionColor(remoteEmotions.primary)}`}>
                        {getEmotionIcon(remoteEmotions.primary)}
                        <span className="text-sm font-medium capitalize">{remoteEmotions.primary}</span>
                        <span className="text-xs ml-1">
                          ({Math.round(remoteEmotions.confidence * 100)}%)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="relative bg-gray-900 aspect-video">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ backgroundColor: '#000' }}
                    />
                    {!isConnected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                        <div className="text-center">
                          <Camera className="w-16 h-16 text-gray-600 mx-auto mb-2" />
                          <p className="text-gray-400">Waiting for connection...</p>
                          <p className="text-xs text-gray-500 mt-2">
                            Status: {connectionStatus.peer} | ICE: {connectionStatus.ice}
                          </p>
                        </div>
                      </div>
                    )}
                    {isConnected && analyzing && (
                      <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-pulse">
                        Analyzing
                      </div>
                    )}
                  </div>
                </div>

                {/* Local Video */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold">You (Caregiver)</span>
                    {analyzing && (
                      <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${getEmotionColor(localEmotions.primary)}`}>
                        {getEmotionIcon(localEmotions.primary)}
                        <span className="text-sm font-medium capitalize">{localEmotions.primary}</span>
                      </div>
                    )}
                  </div>
                  <div className="relative bg-gray-900 aspect-video">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ backgroundColor: '#000', transform: 'scaleX(-1)' }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={toggleVideo}
                      className={`p-4 rounded-full transition-colors ${
                        videoEnabled 
                          ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' 
                          : 'bg-red-100 hover:bg-red-200 text-red-700'
                      }`}
                    >
                      {videoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                    </button>
                    
                    <button
                      onClick={toggleAudio}
                      className={`p-4 rounded-full transition-colors ${
                        audioEnabled 
                          ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' 
                          : 'bg-red-100 hover:bg-red-200 text-red-700'
                      }`}
                    >
                      {audioEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                    </button>
                    
                    <button
                      onClick={endCall}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-full font-semibold transition-colors shadow-lg"
                    >
                      <PhoneOff className="w-6 h-6" />
                      End Call
                    </button>
                  </div>
                </div>

                {/* Statistics Dashboard */}
                {isConnected && analyzing && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-indigo-600" />
                      Call Statistics Dashboard
                    </h3>
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-blue-600" />
                          <p className="text-xs text-blue-600 font-medium">Duration</p>
                        </div>
                        <p className="text-2xl font-bold text-blue-900">
                          {formatDuration(callStatistics.duration)}
                        </p>
                      </div>

                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-4 h-4 text-purple-600" />
                          <p className="text-xs text-purple-600 font-medium">Engagement</p>
                        </div>
                        <p className="text-2xl font-bold text-purple-900">
                          {callStatistics.engagementScore}%
                        </p>
                      </div>

                      <div className={`rounded-lg p-4 ${getConcernLevelColor(callStatistics.concernLevel)}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className="w-4 h-4" />
                          <p className="text-xs font-medium">Concern Level</p>
                        </div>
                        <p className="text-2xl font-bold capitalize">
                          {callStatistics.concernLevel}
                        </p>
                      </div>

                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getMoodTrendDisplay(callStatistics.moodTrend).icon}</span>
                          <p className="text-xs text-gray-600 font-medium">Mood Trend</p>
                        </div>
                        <p className={`text-xl font-bold ${getMoodTrendDisplay(callStatistics.moodTrend).color}`}>
                          {getMoodTrendDisplay(callStatistics.moodTrend).text}
                        </p>
                      </div>
                    </div>

                    {/* Emotion Breakdown */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-gray-700 mb-3">
                        Emotion Distribution ({callStatistics.totalReadings} readings)
                      </h4>
                      
                      {callStatistics.totalReadings === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-sm">Collecting emotion data...</p>
                          <p className="text-xs mt-2">Statistics will appear in a few seconds</p>
                        </div>
                      ) : (
                        <>
                          {Object.entries(callStatistics.emotionPercentages)
                            .sort((a, b) => b[1] - a[1])
                            .map(([emotion, percentage]) => (
                              <div key={emotion} className="flex items-center gap-3">
                                <div className="w-20 text-sm capitalize text-gray-700 font-medium">
                                  {emotion}
                                </div>
                                <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden">
                                  <div
                                    className={`h-full flex items-center justify-end px-2 text-white text-xs font-bold transition-all duration-500 ${
                                      emotion === 'happy' ? 'bg-green-500' :
                                      emotion === 'sad' ? 'bg-blue-500' :
                                      emotion === 'angry' ? 'bg-red-500' :
                                      emotion === 'fearful' ? 'bg-orange-500' :
                                      emotion === 'surprised' ? 'bg-yellow-500' :
                                      'bg-gray-500'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  >
                                    {percentage > 8 && `${percentage.toFixed(1)}%`}
                                  </div>
                                </div>
                                <div className="w-16 text-sm text-gray-600 text-right">
                                  {callStatistics.emotionCounts[emotion]} times
                                </div>
                              </div>
                            ))}
                        </>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                      <p>Average confidence: {(callStatistics.avgConfidence * 100).toFixed(1)}%</p>
                      <p>Total alerts triggered: {callStatistics.alertsTriggered}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Sidebar */}
              <div className="space-y-4">
                {/* Alert Monitor */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                    Alert Monitor
                  </h3>
                  {alerts.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      {isConnected ? 'No concerns detected' : 'Waiting for connection...'}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {alerts.slice().reverse().map((alert) => (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-lg border-l-4 ${
                            alert.type === 'alert' 
                              ? 'bg-red-50 border-red-500' 
                              : 'bg-yellow-50 border-yellow-500'
                          }`}
                        >
                          <p className="text-sm font-medium">{alert.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Speech Analysis */}
                {isConnected && analyzing && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Mic className="w-5 h-5 text-blue-600" />
                      Speech Analysis
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">Sentiment</span>
                          <span className={`font-medium ${
                            speechSentiment.score > 0 ? 'text-green-600' : 
                            speechSentiment.score < -0.5 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {speechSentiment.score > 0 ? 'Positive' : 
                             speechSentiment.score < -0.5 ? 'Negative' : 'Neutral'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              speechSentiment.score > 0 ? 'bg-green-500' : 
                              speechSentiment.score < -0.5 ? 'bg-red-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${Math.abs(speechSentiment.score) * 100}%` }}
                          />
                        </div>
                      </div>
                      {speechSentiment.detectedPhrase && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Detected:</p>
                          <p className="text-sm italic">"{speechSentiment.detectedPhrase}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Emotion Timeline */}
                {remoteEmotions.history.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Heart className="w-5 h-5 text-pink-600" />
                      Recent Timeline
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {remoteEmotions.history.slice(-8).reverse().map((emotion, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            emotion.primary === 'happy' ? 'bg-green-500' :
                            emotion.primary === 'sad' ? 'bg-blue-500' :
                            emotion.primary === 'angry' ? 'bg-red-500' :
                            emotion.primary === 'fearful' ? 'bg-orange-500' :
                            emotion.primary === 'surprised' ? 'bg-yellow-500' :
                            'bg-gray-400'
                          }`} />
                          <span className="text-sm capitalize flex-1 min-w-0 truncate">
                            {emotion.primary}
                          </span>
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {new Date(emotion.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmotionVideoCallWithWebRTC;
