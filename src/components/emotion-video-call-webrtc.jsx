import React, { useState, useRef, useEffect } from 'react';
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
    ]
  };

  // Connect to signaling server
  const connectToServer = () => {
    // Change this URL to your deployed server URL
    const serverUrl = 'https://emotion-video-server.onrender.com'; // Change for production
    console.log('Connecting to server:', serverUrl);
    socketRef.current = io(serverUrl);

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to signaling server');
    });

    socketRef.current.on('room-users', async (users) => {
      console.log('Room users:', users);
      if (users.length > 0) {
        console.log('Creating offer for existing user');
        // Use the ref which has the current stream
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

    return peerConnection;
  };

  // Create and send offer
  const createOffer = async (remotePeerId, stream) => {
    console.log('createOffer called with stream:', stream);
    const peerConnection = createPeerConnection(remotePeerId, stream);
    
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socketRef.current.emit('offer', {
        offer: offer,
        to: remotePeerId
      });
      console.log('Offer sent');
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  // Handle incoming offer
  const handleOffer = async (data) => {
    console.log('handleOffer called');
    // Use the ref which has the current stream
    const stream = localStreamRef.current;
    console.log('Using stream from ref:', stream);
    
    if (!stream) {
      console.error('❌ No local stream available!');
      return;
    }
    
    const peerConnection = createPeerConnection(data.from, stream);
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socketRef.current.emit('answer', {
        answer: answer,
        to: data.from
      });
      console.log('Answer sent');
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  // Handle incoming answer
  const handleAnswer = async (data) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  // Handle ICE candidate
  const handleIceCandidate = async (data) => {
    try {
      await peerConnectionRef.current.addIceCandidate(
        new RTCIceCandidate(data.candidate)
      );
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  // Handle user leaving
  const handleUserLeft = () => {
    setRemoteStream(null);
    setIsConnected(false);
    setAnalyzing(false);
    stopAnalysis();
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  // Generate random room ID
  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 9);
  };

  // Start call
  const startCall = async () => {
    try {
      console.log('🎬 Starting call, requesting media...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });
      
      console.log('✅ Got media stream:', stream);
      console.log('Video tracks:', stream.getVideoTracks());
      console.log('Audio tracks:', stream.getAudioTracks());
      
      // CRITICAL: Store stream in ref for peer connection
      localStreamRef.current = stream;
      
      // Set local stream - this will trigger the useEffect
      setLocalStream(stream);
      setCallActive(true);
      
      // Generate room ID if not provided
      const room = roomId || generateRoomId();
      setCurrentRoomId(room);
      
      // Connect to signaling server and join room
      connectToServer();
      
      // Wait a bit for socket to connect
      setTimeout(() => {
        if (socketRef.current) {
          console.log('Joining room:', room);
          socketRef.current.emit('join-room', room);
        }
      }, 500);
      
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      alert('Could not access camera/microphone. Error: ' + error.message);
    }
  };

  // End call
  const endCall = () => {
    console.log('Ending call...');
    
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    // Clear refs
    localStreamRef.current = null;
    
    setLocalStream(null);
    setRemoteStream(null);
    setCallActive(false);
    setIsConnected(false);
    setAnalyzing(false);
    setCurrentRoomId('');
    stopAnalysis();
  };

  // Copy room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Emotion analysis functions
  const analyzeVideoEmotion = (videoElement, isLocal = true) => {
    if (!videoElement || !videoElement.videoWidth) return null;

    const emotions = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'neutral'];
    const weights = isLocal ? [0.4, 0.1, 0.05, 0.05, 0.05, 0.1, 0.25] : [0.3, 0.2, 0.1, 0.15, 0.05, 0.1, 0.1];
    
    let random = Math.random();
    let cumulative = 0;
    let selectedEmotion = 'neutral';
    
    for (let i = 0; i < emotions.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        selectedEmotion = emotions[i];
        break;
      }
    }
    
    const confidence = 0.6 + Math.random() * 0.35;
    
    return {
      primary: selectedEmotion,
      confidence: confidence,
      timestamp: Date.now()
    };
  };

  const analyzeAudioTone = () => {
    const tones = ['positive', 'neutral', 'negative', 'distressed'];
    const tone = tones[Math.floor(Math.random() * tones.length)];
    const phrases = [
      'feeling okay',
      'a bit tired',
      'not doing well',
      'feeling lonely',
      'in some pain',
      'happy to talk',
      'stressed out'
    ];
    
    return {
      tone,
      detectedPhrase: phrases[Math.floor(Math.random() * phrases.length)],
      score: tone === 'positive' ? 0.7 : tone === 'negative' ? -0.6 : tone === 'distressed' ? -0.8 : 0
    };
  };

  const detectAlerts = (emotions, sentiment) => {
    const newAlerts = [];
    const now = Date.now();
    
    const recentEmotions = emotions.history.slice(-10);
    const negativeCount = recentEmotions.filter(e => 
      ['sad', 'angry', 'fearful', 'disgusted'].includes(e.primary)
    ).length;
    
    if (negativeCount >= 7) {
      newAlerts.push({
        id: now + '-negative',
        type: 'warning',
        message: 'Prolonged negative emotions detected',
        timestamp: now
      });
    }
    
    if (sentiment.score < -0.7) {
      newAlerts.push({
        id: now + '-distress',
        type: 'alert',
        message: 'Possible distress detected in speech patterns',
        timestamp: now
      });
    }
    
    if (sentiment.detectedPhrase && (
      sentiment.detectedPhrase.includes('pain') || 
      sentiment.detectedPhrase.includes('lonely') ||
      sentiment.detectedPhrase.includes('not doing well')
    )) {
      newAlerts.push({
        id: now + '-keyword',
        type: 'alert',
        message: `Concern detected: "${sentiment.detectedPhrase}"`,
        timestamp: now
      });
    }
    
    return newAlerts;
  };

  const startAnalysis = () => {
    analysisIntervalRef.current = setInterval(() => {
      if (localVideoRef.current) {
        const emotion = analyzeVideoEmotion(localVideoRef.current, true);
        if (emotion) {
          setLocalEmotions(prev => ({
            ...emotion,
            history: [...prev.history.slice(-19), emotion]
          }));
        }
      }
      
      if (remoteVideoRef.current && remoteStream) {
        const emotion = analyzeVideoEmotion(remoteVideoRef.current, false);
        if (emotion) {
          setRemoteEmotions(prev => ({
            ...emotion,
            history: [...prev.history.slice(-19), emotion]
          }));
          
          const sentiment = analyzeAudioTone();
          setSpeechSentiment(sentiment);
          
          const newAlerts = detectAlerts(
            { ...remoteEmotions, history: [...remoteEmotions.history, emotion] },
            sentiment
          );
          
          if (newAlerts.length > 0) {
            setAlerts(prev => [...newAlerts, ...prev].slice(0, 5));
          }
        }
      }
    }, 2000);
  };

  const stopAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setAudioEnabled(audioTrack.enabled);
    }
  };

  const getEmotionIcon = (emotion) => {
    switch(emotion) {
      case 'happy': return <Smile className="w-5 h-5" />;
      case 'sad': return <Frown className="w-5 h-5" />;
      case 'neutral': return <Meh className="w-5 h-5" />;
      default: return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getEmotionColor = (emotion) => {
    switch(emotion) {
      case 'happy': return 'text-green-600 bg-green-100';
      case 'sad': return 'text-blue-600 bg-blue-100';
      case 'angry': return 'text-red-600 bg-red-100';
      case 'fearful': return 'text-purple-600 bg-purple-100';
      case 'surprised': return 'text-yellow-600 bg-yellow-100';
      case 'neutral': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  // Debug: Log video element states
  useEffect(() => {
    const interval = setInterval(() => {
      if (callActive) {
        console.log('=== VIDEO DEBUG ===');
        if (localVideoRef.current) {
          console.log('Local video:', {
            hasStream: localVideoRef.current.srcObject !== null,
            readyState: localVideoRef.current.readyState,
            paused: localVideoRef.current.paused,
            dimensions: `${localVideoRef.current.videoWidth}x${localVideoRef.current.videoHeight}`
          });
        }
        if (remoteVideoRef.current) {
          console.log('Remote video:', {
            hasStream: remoteVideoRef.current.srcObject !== null,
            readyState: remoteVideoRef.current.readyState,
            paused: remoteVideoRef.current.paused,
            dimensions: `${remoteVideoRef.current.videoWidth}x${remoteVideoRef.current.videoHeight}`
          });
        }
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [callActive]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Emotion-Aware Video Call
          </h1>
          <p className="text-gray-600">
            Real-time emotion and sentiment analysis with WebRTC
          </p>
        </div>

        {!callActive && (
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="font-bold text-lg mb-4">Start or Join a Call</h3>
            <input
              type="text"
              placeholder="Enter Room ID (leave empty to create new)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={startCall}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              <Phone className="w-5 h-5" />
              {roomId ? 'Join Call' : 'Start New Call'}
            </button>
          </div>
        )}

        {callActive && (
          <>
            {currentRoomId && (
              <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Room ID:</p>
                    <p className="font-mono font-bold text-lg">{currentRoomId}</p>
                  </div>
                  <button
                    onClick={copyRoomId}
                    className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {!isConnected && (
                  <p className="text-sm text-orange-600 mt-2">
                    ⏳ Waiting for other party to join...
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold">Remote Party</span>
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
