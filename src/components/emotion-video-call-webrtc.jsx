import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check, TrendingUp, Clock, BarChart3 } from 'lucide-react';
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
  const [isConnected, setIsConnected] = useState(false);import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check } from 'lucide-react';
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
  
  // Emotion states
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
  
  // Alert states
  const [alerts, setAlerts] = useState([]);
  const [speechSentiment, setSpeechSentiment] = useState({ score: 0, text: '' });
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const localStreamRef = useRef(null); // Store stream in ref for peer connection

  // CRITICAL: Effect to set local video stream whenever it changes
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

  // CRITICAL: Effect to set remote video stream whenever it changes
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

  // STUN servers for NAT traversal (free Google STUN servers)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
    ]
  };

  // ✅ FIXED: Connect to signaling server with proper configuration
  const connectToServer = () => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    console.log('🔧 Connecting to server:', serverUrl);
    console.log('🔧 Environment variable VITE_SERVER_URL:', import.meta.env.VITE_SERVER_URL);
    
    // ✅ Enhanced Socket.IO configuration
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
      autoConnect: true
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to signaling server');
      console.log('✅ Socket ID:', socketRef.current.id);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      console.error('❌ Attempted URL:', serverUrl);
      addAlert('Connection error: ' + error.message, 'alert');
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('⚠️ Disconnected:', reason);
      addAlert('Disconnected from server: ' + reason, 'warning');
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts');
    });

    socketRef.current.on('room-users', async (users) => {
      console.log('Room users:', users);
      if (users.length > 0) {
        console.log('Creating offer for existing user');
        await createOffer(users[0], localStreamRef.current);
      }
    });

    socketRef.current.on('user-joined', async (userId) => {
      console.log('✅ User joined:', userId);
    });

    socketRef.current.on('offer', async (data) => {
      console.log('📨 Received offer');
      await handleOffer(data);
    });

    socketRef.current.on('answer', async (data) => {
      console.log('📨 Received answer');
      await handleAnswer(data);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      console.log('📨 Received ICE candidate');
      await handleIceCandidate(data);
    });

    socketRef.current.on('user-left', () => {
      console.log('❌ User left');
      handleUserLeft();
    });

    socketRef.current.on('room-full', () => {
      alert('Room is full! Maximum 2 participants allowed.');
    });
  };

  // Create peer connection
  const createPeerConnection = (remotePeerId, stream) => {
    const peerConnection = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = peerConnection;

    console.log('Creating peer connection with:', remotePeerId);
    console.log('Stream to add:', stream);

    // Add local stream tracks to peer connection
    if (stream) {
      const tracks = stream.getTracks();
      console.log('📹 Adding tracks to peer connection:', tracks.length, 'tracks');
      tracks.forEach(track => {
        console.log('  - Adding', track.kind, 'track:', track.label, 'enabled:', track.enabled);
        peerConnection.addTrack(track, stream);
      });
      console.log('✅ All tracks added to peer connection');
    } else {
      console.error('❌ No stream to add to peer connection!');
    }

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
      console.log('🎉 ontrack event fired!');
      console.log('  - Track kind:', event.track.kind);
      console.log('  - Track enabled:', event.track.enabled);
      console.log('  - Track readyState:', event.track.readyState);
      console.log('  - Streams:', event.streams.length);
      console.log('  - Stream tracks:', event.streams[0]?.getTracks().length);
      
      // Set remote stream
      const remoteStreamReceived = event.streams[0];
      console.log('Setting remote stream:', remoteStreamReceived);
      setRemoteStream(remoteStreamReceived);
      setIsConnected(true);
      setAnalyzing(true);
      startAnalysis();
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          to: remotePeerId
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed') {
        handleUserLeft();
      }
    };

    // ✅ Enhanced connection state monitoring
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', peerConnection.iceGatheringState);
    };

    return peerConnection;
  };

  // Create and send offer
  const createOffer = async (remotePeerId, stream) => {
    console.log('createOffer called with stream:', stream);
    const peerConnection = createPeerConnection(remotePeerId, stream);
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });
      await peerConnection.setLocalDescription(offer);
      
      console.log('Sending offer to:', remotePeerId);
      socketRef.current.emit('offer', {
        offer,
        to: remotePeerId
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  // Handle received offer
  const handleOffer = async (data) => {
    console.log('handleOffer called with data from:', data.from);
    const peerConnection = createPeerConnection(data.from, localStreamRef.current);
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      console.log('Sending answer to:', data.from);
      socketRef.current.emit('answer', {
        answer,
        to: data.from
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  // Handle received answer
  const handleAnswer = async (data) => {
    console.log('handleAnswer called');
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        console.log('✅ Answer set successfully');
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (data) => {
    console.log('handleIceCandidate called');
    try {
      if (peerConnectionRef.current && data.candidate) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
        console.log('✅ ICE candidate added');
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  // Handle user left
  const handleUserLeft = () => {
    console.log('Handling user left');
    setRemoteStream(null);
    setIsConnected(false);
    stopAnalysis();
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ Media stream obtained:', stream);
      console.log('  - Video tracks:', stream.getVideoTracks().length);
      console.log('  - Audio tracks:', stream.getAudioTracks().length);
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setCallActive(true);
      setCurrentRoomId(roomId);
      
      connectToServer();
      
      setTimeout(() => {
        console.log('Joining room:', roomId);
        socketRef.current.emit('join-room', roomId);
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  // End call
  const endCall = () => {
    console.log('Ending call');
    stopAnalysis();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
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
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Emotion detection simulation
  const detectEmotion = (videoElement, isLocal = false) => {
    if (!videoElement || videoElement.readyState !== 4) {
      return null;
    }

    const emotions = ['happy', 'sad', 'neutral', 'angry', 'surprised'];
    const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
    const confidence = 0.6 + Math.random() * 0.4;

    return {
      primary: randomEmotion,
      confidence: confidence,
      timestamp: Date.now()
    };
  };

  // Start emotion analysis
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
          history: [...prev.history.slice(-19), localEmotion]
        }));
      }

      if (remoteEmotion) {
        setRemoteEmotions(prev => ({
          ...remoteEmotion,
          history: [...prev.history.slice(-19), remoteEmotion]
        }));

        if (remoteEmotion.primary === 'sad' && remoteEmotion.confidence > 0.7) {
          addAlert('Remote user appears distressed', 'alert');
        } else if (remoteEmotion.primary === 'angry' && remoteEmotion.confidence > 0.75) {
          addAlert('Elevated tension detected', 'warning');
        }
      }

      const sentimentScore = Math.random() * 2 - 1;
      setSpeechSentiment({
        score: sentimentScore,
        detectedPhrase: sentimentScore < -0.5 ? 'Negative tone detected' : null
      });
    }, 2000);
  };

  // Stop emotion analysis
  const stopAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
  };

  // Add alert
  const addAlert = (message, type = 'warning') => {
    const newAlert = {
      id: Date.now(),
      message,
      type,
      timestamp: Date.now()
    };
    setAlerts(prev => [...prev.slice(-9), newAlert]);
  };

  // Copy room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get emotion icon
  const getEmotionIcon = (emotion) => {
    switch (emotion) {
      case 'happy':
        return <Smile className="w-4 h-4" />;
      case 'sad':
        return <Frown className="w-4 h-4" />;
      case 'angry':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Meh className="w-4 h-4" />;
    }
  };

  // Get emotion color
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
      default:
        return 'bg-gray-500 bg-opacity-90';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
            <Heart className="w-10 h-10 text-red-500" />
            Emotion Video Call
          </h1>
          <p className="text-gray-600">Real-time emotion detection during video calls</p>
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
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Room ID:</p>
                  <p className="font-mono text-lg font-semibold text-gray-800">{currentRoomId}</p>
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
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold">Remote User</span>
                    {isConnected && analyzing && (
                      <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${getEmotionColor(remoteEmotions.primary)}`}>
                        {getEmotionIcon(remoteEmotions.primary)}
                        <span className="text-sm font-medium capitalize">{remoteEmotions.primary}</span>
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

                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold">You</span>
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
              </div>

              <div className="space-y-4">
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
                    <div className="space-y-2">
                      {alerts.map((alert) => (
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

                {isConnected && analyzing && (
                  <>
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
                            <p className="text-xs text-gray-600 mb-1">Detected phrase:</p>
                            <p className="text-sm italic">"{speechSentiment.detectedPhrase}"</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {remoteEmotions.history.length > 0 && (
                      <div className="bg-white rounded-xl shadow-lg p-6">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                          <Heart className="w-5 h-5 text-pink-600" />
                          Emotion Timeline
                        </h3>
                        <div className="space-y-2">
                          {remoteEmotions.history.slice(-5).reverse().map((emotion, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${
                                emotion.primary === 'happy' ? 'bg-green-500' :
                                emotion.primary === 'sad' ? 'bg-blue-500' :
                                emotion.primary === 'angry' ? 'bg-red-500' :
                                'bg-gray-400'
                              }`} />
                              <span className="text-sm capitalize flex-1">{emotion.primary}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(emotion.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
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

  const [copied, setCopied] = useState(false);
  
  // Emotion states
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
  
  // ✨ NEW: Cumulative statistics for caregiver
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
    moodTrend: 'stable', // 'improving', 'declining', 'stable'
    concernLevel: 'low', // 'low', 'medium', 'high'
    engagementScore: 0 // 0-100
  });
  
  // Alert states
  const [alerts, setAlerts] = useState([]);
  const [speechSentiment, setSpeechSentiment] = useState({ score: 0, text: '' });
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const statisticsIntervalRef = useRef(null);
  const localStreamRef = useRef(null);

  // CRITICAL: Effect to set local video stream whenever it changes
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

  // CRITICAL: Effect to set remote video stream whenever it changes
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

  // STUN servers for NAT traversal
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
    ]
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
      autoConnect: true
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to signaling server');
      console.log('✅ Socket ID:', socketRef.current.id);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Connection error:', error.message);
      console.error('❌ Attempted URL:', serverUrl);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('⚠️ Disconnected:', reason);
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts');
    });

    socketRef.current.on('room-users', async (users) => {
      console.log('Room users:', users);
      if (users.length > 0) {
        console.log('Creating offer for existing user');
        await createOffer(users[0], localStreamRef.current);
      }
    });

    socketRef.current.on('user-joined', async (userId) => {
      console.log('✅ User joined:', userId);
    });

    socketRef.current.on('offer', async (data) => {
      console.log('📨 Received offer');
      await handleOffer(data);
    });

    socketRef.current.on('answer', async (data) => {
      console.log('📨 Received answer');
      await handleAnswer(data);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      console.log('📨 Received ICE candidate');
      await handleIceCandidate(data);
    });

    socketRef.current.on('user-left', () => {
      console.log('❌ User left');
      handleUserLeft();
    });

    socketRef.current.on('room-full', () => {
      alert('Room is full! Maximum 2 participants allowed.');
    });
  };

  // Create peer connection
  const createPeerConnection = (remotePeerId, stream) => {
    const peerConnection = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = peerConnection;

    console.log('Creating peer connection with:', remotePeerId);
    console.log('Stream to add:', stream);

    if (stream) {
      const tracks = stream.getTracks();
      console.log('📹 Adding tracks to peer connection:', tracks.length, 'tracks');
      tracks.forEach(track => {
        console.log('  - Adding', track.kind, 'track:', track.label, 'enabled:', track.enabled);
        peerConnection.addTrack(track, stream);
      });
      console.log('✅ All tracks added to peer connection');
    } else {
      console.error('❌ No stream to add to peer connection!');
    }

    peerConnection.ontrack = (event) => {
      console.log('🎉 ontrack event fired!');
      console.log('  - Track kind:', event.track.kind);
      console.log('  - Track enabled:', event.track.enabled);
      console.log('  - Track readyState:', event.track.readyState);
      console.log('  - Streams:', event.streams.length);
      console.log('  - Stream tracks:', event.streams[0]?.getTracks().length);
      
      const remoteStreamReceived = event.streams[0];
      console.log('Setting remote stream:', remoteStreamReceived);
      setRemoteStream(remoteStreamReceived);
      setIsConnected(true);
      setAnalyzing(true);
      startAnalysis();
      startStatisticsTracking();
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          to: remotePeerId
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed') {
        handleUserLeft();
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', peerConnection.iceGatheringState);
    };

    return peerConnection;
  };

  const createOffer = async (remotePeerId, stream) => {
    console.log('createOffer called with stream:', stream);
    const peerConnection = createPeerConnection(remotePeerId, stream);
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });
      await peerConnection.setLocalDescription(offer);
      
      console.log('Sending offer to:', remotePeerId);
      socketRef.current.emit('offer', {
        offer,
        to: remotePeerId
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleOffer = async (data) => {
    console.log('handleOffer called with data from:', data.from);
    const peerConnection = createPeerConnection(data.from, localStreamRef.current);
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      console.log('Sending answer to:', data.from);
      socketRef.current.emit('answer', {
        answer,
        to: data.from
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (data) => {
    console.log('handleAnswer called');
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        console.log('✅ Answer set successfully');
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    console.log('handleIceCandidate called');
    try {
      if (peerConnectionRef.current && data.candidate) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
        console.log('✅ ICE candidate added');
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const handleUserLeft = () => {
    console.log('Handling user left');
    setRemoteStream(null);
    setIsConnected(false);
    stopAnalysis();
    stopStatisticsTracking();
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ Media stream obtained:', stream);
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setCallActive(true);
      setCurrentRoomId(roomId);
      
      // Initialize statistics
      setCallStatistics(prev => ({
        ...prev,
        startTime: Date.now()
      }));
      
      connectToServer();
      
      setTimeout(() => {
        console.log('Joining room:', roomId);
        socketRef.current.emit('join-room', roomId);
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  // End call
  const endCall = () => {
    console.log('Ending call');
    stopAnalysis();
    stopStatisticsTracking();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
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
    
    // Add slight randomness to confidence
    const baseConfidence = 0.65;
    const variability = 0.25;
    const confidence = baseConfidence + (Math.random() * variability);

    return {
      primary: selectedEmotion,
      confidence: Math.min(0.95, confidence),
      timestamp: Date.now()
    };
  };

  // ✨ NEW: Calculate cumulative statistics
  const calculateStatistics = () => {
    if (remoteEmotions.history.length === 0) return;

    const history = remoteEmotions.history;
    const totalReadings = history.length;
    
    // Count each emotion
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
      const previous = history.slice(-20, -10);
      
      const recentPositive = recent.filter(e => e.primary === 'happy' || e.primary === 'surprised').length;
      const previousPositive = previous.filter(e => e.primary === 'happy' || e.primary === 'surprised').length;
      
      if (recentPositive > previousPositive + 2) {
        moodTrend = 'improving';
      } else if (recentPositive < previousPositive - 2) {
        moodTrend = 'declining';
      }
    }
    
    // Calculate concern level
    const negativePercentage = percentages.sad + percentages.angry + percentages.fearful;
    let concernLevel = 'low';
    if (negativePercentage > 40) {
      concernLevel = 'high';
    } else if (negativePercentage > 25) {
      concernLevel = 'medium';
    }
    
    // Calculate engagement score (0-100)
    const engagementScore = Math.round(
      (percentages.happy * 1.0 + 
       percentages.surprised * 0.8 + 
       percentages.neutral * 0.5 + 
       percentages.sad * 0.2 + 
       percentages.fearful * 0.1 + 
       percentages.angry * 0.1)
    );
    
    // Calculate call duration
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

  // ✨ NEW: Start statistics tracking
  const startStatisticsTracking = () => {
    if (statisticsIntervalRef.current) {
      clearInterval(statisticsIntervalRef.current);
    }

    statisticsIntervalRef.current = setInterval(() => {
      calculateStatistics();
    }, 3000); // Update every 3 seconds
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
    }

    analysisIntervalRef.current = setInterval(() => {
      const localEmotion = detectEmotion(localVideoRef.current, true);
      const remoteEmotion = detectEmotion(remoteVideoRef.current, false);

      if (localEmotion) {
        setLocalEmotions(prev => ({
          ...localEmotion,
          history: [...prev.history.slice(-99), localEmotion] // Keep last 100
        }));
      }

      if (remoteEmotion) {
        setRemoteEmotions(prev => ({
          ...remoteEmotion,
          history: [...prev.history.slice(-99), remoteEmotion] // Keep last 100
        }));

        // Trigger alerts for concerning emotions
        if (remoteEmotion.primary === 'sad' && remoteEmotion.confidence > 0.7) {
          addAlert('Patient appears distressed', 'alert');
        } else if (remoteEmotion.primary === 'angry' && remoteEmotion.confidence > 0.75) {
          addAlert('Elevated tension detected', 'warning');
        } else if (remoteEmotion.primary === 'fearful' && remoteEmotion.confidence > 0.7) {
          addAlert('Patient may be anxious or fearful', 'alert');
        }
      }

      // Simulate speech sentiment
      const sentimentScore = Math.random() * 2 - 1;
      setSpeechSentiment({
        score: sentimentScore,
        detectedPhrase: sentimentScore < -0.5 ? 'Negative tone detected' : null
      });
    }, 2000); // Analyze every 2 seconds
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
        return 'text-green-600 bg-green-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'high':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  // ✨ NEW: Get mood trend icon and color
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
            <Heart className="w-10 h-10 text-red-500" />
            Emotion Video Call with Statistics
          </h1>
          <p className="text-gray-600">Real-time emotion tracking with cumulative caregiver insights</p>
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
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Room ID:</p>
                  <p className="font-mono text-lg font-semibold text-gray-800">{currentRoomId}</p>
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

                {/* ✨ NEW: Cumulative Statistics Dashboard */}
                {isConnected && analyzing && callStatistics.totalReadings > 0 && (
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
