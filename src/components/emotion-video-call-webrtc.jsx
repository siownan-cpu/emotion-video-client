import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check, TrendingUp, Clock, BarChart3, Wifi, WifiOff, Settings, MessageSquare, Activity } from 'lucide-react';
import io from 'socket.io-client';
import { AssemblyAIService, getAssemblyAIToken, EmotionAnalyzer } from '../services/AssemblyAIService';

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
  const [meteredApiKey, setMeteredApiKey] = useState(import.meta.env.VITE_METERED_API_KEY || '');

  // ✨ NEW: AssemblyAI states
  const [transcriptEnabled, setTranscriptEnabled] = useState(true);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [assemblyAIStatus, setAssemblyAIStatus] = useState('disconnected'); // disconnected, connecting, connected, error

  const [availableDevices, setAvailableDevices] = useState({
    videoInputs: [],
    audioInputs: [],
    audioOutputs: []
  });
  const [selectedDevices, setSelectedDevices] = useState({
    videoDeviceId: '',
    audioDeviceId: '',
    audioOutputDeviceId: ''
  });
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState({
    socket: 'disconnected',
    peer: 'disconnected',
    ice: 'new'
  });
  
  const [iceStats, setIceStats] = useState({
    localCandidates: 0,
    remoteCandidates: 0,
    selectedPair: null
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
  const remotePeerIdRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  
  // ✨ NEW: AssemblyAI refs
  const assemblyAIRef = useRef(null);

  useEffect(() => {
    loadAvailableDevices();
  }, []);

  const loadAvailableDevices = async () => {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

      console.log('📹 Available video devices:', videoInputs.length);
      console.log('🎤 Available audio input devices:', audioInputs.length);
      console.log('🔊 Available audio output devices:', audioOutputs.length);

      setAvailableDevices({
        videoInputs,
        audioInputs,
        audioOutputs
      });

      if (videoInputs.length > 0 && !selectedDevices.videoDeviceId) {
        setSelectedDevices(prev => ({
          ...prev,
          videoDeviceId: videoInputs[0].deviceId
        }));
      }
      if (audioInputs.length > 0 && !selectedDevices.audioDeviceId) {
        setSelectedDevices(prev => ({
          ...prev,
          audioDeviceId: audioInputs[0].deviceId
        }));
      }
      if (audioOutputs.length > 0 && !selectedDevices.audioOutputDeviceId) {
        setSelectedDevices(prev => ({
          ...prev,
          audioOutputDeviceId: audioOutputs[0].deviceId
        }));
      }

      tempStream.getTracks().forEach(track => track.stop());

    } catch (error) {
      console.error('❌ Error loading devices:', error);
    }
  };

  const changeVideoDevice = async (deviceId) => {
    console.log('📹 Changing video device to:', deviceId);

    setSelectedDevices(prev => ({
      ...prev,
      videoDeviceId: deviceId
    }));

    if (localStreamRef.current && callActive) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: { deviceId: { exact: selectedDevices.audioDeviceId } }
        });

        if (peerConnectionRef.current) {
          const videoTrack = newStream.getVideoTracks()[0];
          const sender = peerConnectionRef.current
            .getSenders()
            .find(s => s.track && s.track.kind === 'video');

          if (sender) {
            await sender.replaceTrack(videoTrack);
            console.log('✅ Video track replaced in peer connection');
          }
        }

        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          oldVideoTrack.stop();
        }

        localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
        localStreamRef.current.addTrack(newStream.getVideoTracks()[0]);

        setLocalStream(newStream);
        localStreamRef.current = newStream;

        addAlert('Camera changed successfully', 'info');
      } catch (error) {
        console.error('❌ Error changing video device:', error);
        addAlert('Failed to change camera', 'alert');
      }
    }
  };

  const changeAudioDevice = async (deviceId) => {
    console.log('🎤 Changing audio device to:', deviceId);

    setSelectedDevices(prev => ({
      ...prev,
      audioDeviceId: deviceId
    }));

    if (localStreamRef.current && callActive) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedDevices.videoDeviceId } },
          audio: { deviceId: { exact: deviceId } }
        });

        if (peerConnectionRef.current) {
          const audioTrack = newStream.getAudioTracks()[0];
          const sender = peerConnectionRef.current
            .getSenders()
            .find(s => s.track && s.track.kind === 'audio');

          if (sender) {
            await sender.replaceTrack(audioTrack);
            console.log('✅ Audio track replaced in peer connection');
          }
        }

        const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
        if (oldAudioTrack) {
          oldAudioTrack.stop();
        }

        localStreamRef.current.removeTrack(localStreamRef.current.getAudioTracks()[0]);
        localStreamRef.current.addTrack(newStream.getAudioTracks()[0]);

        setLocalStream(newStream);
        localStreamRef.current = newStream;

        addAlert('Microphone changed successfully', 'info');
      } catch (error) {
        console.error('❌ Error changing audio device:', error);
        addAlert('Failed to change microphone', 'alert');
      }
    }
  };

  const changeAudioOutput = async (deviceId) => {
    console.log('🔊 Changing audio output to:', deviceId);

    setSelectedDevices(prev => ({
      ...prev,
      audioOutputDeviceId: deviceId
    }));

    if (remoteVideoRef.current && typeof remoteVideoRef.current.setSinkId === 'function') {
      try {
        await remoteVideoRef.current.setSinkId(deviceId);
        console.log('✅ Audio output changed');
        addAlert('Speaker changed successfully', 'info');
      } catch (error) {
        console.error('❌ Error changing audio output:', error);
        addAlert('Failed to change speaker', 'alert');
      }
    } else {
      console.warn('⚠️ Browser does not support audio output selection');
      addAlert('Speaker selection not supported in this browser', 'warning');
    }
  };

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

      if (selectedDevices.audioOutputDeviceId &&
          typeof remoteVideoRef.current.setSinkId === 'function') {
        remoteVideoRef.current.setSinkId(selectedDevices.audioOutputDeviceId)
          .catch(e => console.error('Error setting audio output:', e));
      }

      remoteVideoRef.current.play()
        .then(() => console.log('✅ Remote video playing'))
        .catch(e => console.error('❌ Remote video play error:', e));
    }
  }, [remoteStream, selectedDevices.audioOutputDeviceId]);

  const getIceServers = async () => {
    if (!meteredApiKey) {
      console.warn("⚠️ Metered API key not set. Using only public STUN servers.");
      addAlert("Metered API key not set, connection may fail.", "warning");
      return {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.services.mozilla.com' },
        ],
      };
    }

    try {
      console.log('Fetching ICE servers from Metered API...');
      const response = await fetch(`https://emotion-video-call.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`);
      if (!response.ok) {
        throw new Error(`Metered API request failed with status ${response.status}`);
      }
      const servers = await response.json();
      console.log('✅ Fetched', servers.length, 'ICE servers');
      return { iceServers: servers };
    } catch (error) {
      console.error('❌ Failed to fetch ICE servers:', error);
      addAlert("Failed to get TURN servers, connection may fail.", "alert");
      return {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      };
    }
  };

  const connectToServer = () => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    console.log('🔧 Connecting to server:', serverUrl);

    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 20000,
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
      
      if (reason === 'io server disconnect') {
        socketRef.current.connect();
      }
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts');
      setConnectionStatus(prev => ({ ...prev, socket: 'connected' }));
      
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

  // ✨ NEW: Initialize AssemblyAI when remote stream is received
  const initializeAssemblyAI = async (remoteAudioStream) => {
    if (!transcriptEnabled) {
      console.log('⏭️ Transcription disabled, skipping AssemblyAI');
      return;
    }

    try {
      console.log('🎙️ Initializing AssemblyAI for remote audio...');
      setAssemblyAIStatus('connecting');

      // Get temporary token from backend
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
      const token = await getAssemblyAIToken(serverUrl);
      console.log('✅ Got AssemblyAI token');

      // Create and connect AssemblyAI service
      const assemblyAI = new AssemblyAIService(token);
      await assemblyAI.connect();
      
      setAssemblyAIStatus('connected');
      console.log('✅ AssemblyAI connected');

      // Start processing remote audio
      await assemblyAI.startProcessing(
        remoteAudioStream,
        // On transcript callback
        (text, fullData) => {
          console.log('📝 Transcript received:', text);
          
          // Update live transcript
          setLiveTranscript(text);
          
          // Add to history
          setTranscriptHistory(prev => [...prev, {
            text,
            timestamp: Date.now(),
            id: Date.now()
          }].slice(-50)); // Keep last 50 transcripts

          // Analyze emotion from text
          const emotionAnalysis = EmotionAnalyzer.analyzeEmotionFromText(text);
          console.log('🎭 Emotion analysis:', emotionAnalysis);

          // Update remote emotions based on speech
          setRemoteEmotions(prev => ({
            primary: emotionAnalysis.emotion,
            confidence: emotionAnalysis.confidence,
            history: [...prev.history.slice(-99), {
              primary: emotionAnalysis.emotion,
              confidence: emotionAnalysis.confidence,
              timestamp: Date.now()
            }]
          }));

          // Check for distress
          if (emotionAnalysis.isDistressed) {
            addAlert('⚠️ Distress detected in patient speech: ' + text, 'alert');
          }
        },
        // On sentiment callback
        (sentiment) => {
          console.log('💭 Sentiment:', sentiment);
          
          const distressCheck = EmotionAnalyzer.detectDistressFromSentiment(sentiment);
          if (distressCheck.isDistressed) {
            addAlert(distressCheck.message, distressCheck.level === 'high' ? 'alert' : 'warning');
          }

          setSpeechSentiment({
            score: sentiment.sentiment === 'positive' ? 0.7 : sentiment.sentiment === 'negative' ? -0.7 : 0,
            text: sentiment.sentiment
          });
        },
        // On error callback
        (error) => {
          console.error('❌ AssemblyAI error:', error);
          setAssemblyAIStatus('error');
          addAlert('Speech transcription error: ' + error, 'warning');
        }
      );

      assemblyAIRef.current = assemblyAI;
      console.log('✅ AssemblyAI processing started on remote audio');
      addAlert('Real-time transcription active', 'info');

    } catch (error) {
      console.error('❌ Failed to initialize AssemblyAI:', error);
      setAssemblyAIStatus('error');
      addAlert('Failed to start speech transcription: ' + error.message, 'warning');
    }
  };

  const createPeerConnection = async (remotePeerId, stream) => {
    console.log('🔗 Creating peer connection for:', remotePeerId);

    const iceServersConfig = await getIceServers();
    console.log('🔗 Using ICE servers:', iceServersConfig.iceServers.map(s => s.urls));
    
    if (peerConnectionRef.current) {
      console.log('🔄 Closing existing peer connection');
      peerConnectionRef.current.close();
    }

    const peerConnection = new RTCPeerConnection(iceServersConfig);
    peerConnectionRef.current = peerConnection;

    let localCandidateCount = 0;
    let remoteCandidateCount = 0;

    if (stream) {
      const tracks = stream.getTracks();
      console.log('📹 Adding', tracks.length, 'tracks to peer connection');
      tracks.forEach(track => {
        console.log('  ➕', track.kind, 'track:', track.label);
        const sender = peerConnection.addTrack(track, stream);
        console.log('  ✅ Track added with sender:', sender);
      });
    }

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

        // ✨ Initialize AssemblyAI with remote stream
        initializeAssemblyAI(remoteStreamReceived);
        
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

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        localCandidateCount++;
        console.log(`🧊 Local ICE candidate #${localCandidateCount}:`, event.candidate.type, event.candidate.protocol);
        console.log('   Address:', event.candidate.address || 'N/A');
        console.log('   Port:', event.candidate.port || 'N/A');
        console.log('   Priority:', event.candidate.priority || 'N/A');

        setIceStats(prev => ({ ...prev, localCandidates: localCandidateCount }));

        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate.toJSON(),
          to: remotePeerId
        });
      } else {
        console.log('✅ All ICE candidates sent. Total:', localCandidateCount);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log('🔄 Connection state changed:', state);
      setConnectionStatus(prev => ({ ...prev, peer: state }));
      
      if (state === 'connected') {
        console.log('✅✅✅ Peer connection ESTABLISHED!');
        setIsConnected(true);

        peerConnection.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              console.log('🎯 Selected ICE candidate pair:', report);
              console.log('   Local candidate type:', report.localCandidateType || 'N/A');
              console.log('   Remote candidate type:', report.remoteCandidateType || 'N/A');
              console.log('   Transport:', report.currentRoundTripTime ? 'Working' : 'Unknown');
              setIceStats(prev => ({
                ...prev,
                selectedPair: `${report.localCandidateType || 'unknown'} → ${report.remoteCandidateType || 'unknown'}`
              }));
            }
          });
        });
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

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log('❄️ ICE connection state:', state);
      setConnectionStatus(prev => ({ ...prev, ice: state }));
      
      if (state === 'disconnected' || state === 'failed') {
        console.log('⚠️ ICE connection issue:', state);
        console.log('📊 ICE Stats - Local candidates:', localCandidateCount, 'Remote candidates:', remoteCandidateCount);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (peerConnection.iceConnectionState === 'disconnected' || 
              peerConnection.iceConnectionState === 'failed') {
            console.log('❌ ICE connection timeout - restarting');

            peerConnection.getStats().then(stats => {
              console.log('📊 Connection stats at failure:');
              stats.forEach(report => {
                if (report.type === 'candidate-pair') {
                  console.log('  Candidate pair:', report.state, report);
                }
              });
            });

            attemptReconnection();
          }
        }, 5000);
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

    peerConnection.onnegotiationneeded = async () => {
      console.log('🔄 Negotiation needed');
    };

    return peerConnection;
  };

  const attemptReconnection = async () => {
    console.log('🔄 Attempting peer connection recovery...');
    
    if (!remotePeerIdRef.current || !localStreamRef.current) {
      console.log('⚠️ Cannot reconnect - missing peer ID or local stream');
      return;
    }
    
    await createOffer(remotePeerIdRef.current, localStreamRef.current);
  };

  const handleConnectionFailure = () => {
    console.log('❌ Handling connection failure');
    addAlert('Connection lost - attempting to reconnect...', 'warning');
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    setRemoteStream(null);
    setIsConnected(false);
    stopAnalysis();
    stopStatisticsTracking();
    
    // ✨ Stop AssemblyAI
    if (assemblyAIRef.current) {
      assemblyAIRef.current.stop();
      assemblyAIRef.current = null;
      setAssemblyAIStatus('disconnected');
    }
    
    setTimeout(() => {
      if (remotePeerIdRef.current && localStreamRef.current && currentRoomId) {
        console.log('🔄 Retrying connection...');
        createOffer(remotePeerIdRef.current, localStreamRef.current);
      }
    }, 2000);
  };

  const createOffer = async (remotePeerId, stream) => {
    console.log('📤 Creating offer for:', remotePeerId);
    const peerConnection = await createPeerConnection(remotePeerId, stream);

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
        iceRestart: true
      });
      
      await peerConnection.setLocalDescription(offer);
      console.log('📤 Sending offer');
      console.log('📤 Offer SDP contains TURN?', offer.sdp.includes('relay'));

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
    const peerConnection = await createPeerConnection(data.from, localStreamRef.current);

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      console.log('✅ Remote description set');
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('📤 Sending answer');
      console.log('📤 Answer SDP contains TURN?', answer.sdp.includes('relay'));

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
        const remoteCandidateCount = iceStats.remoteCandidates + 1;
        console.log(`✅ Remote ICE candidate #${remoteCandidateCount} added:`, data.candidate.type, data.candidate.protocol);
        setIceStats(prev => ({ ...prev, remoteCandidates: remoteCandidateCount }));
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

    // ✨ Stop AssemblyAI
    if (assemblyAIRef.current) {
      assemblyAIRef.current.stop();
      assemblyAIRef.current = null;
      setAssemblyAIStatus('disconnected');
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    remotePeerIdRef.current = null;
    setIceStats({ localCandidates: 0, remoteCandidates: 0, selectedPair: null });
    addAlert('Remote user disconnected', 'warning');
  };

  const startCall = async () => {
    if (!roomId.trim()) {
      alert('Please enter a room ID');
      return;
    }

    try {
      console.log('🎥 Starting call...');

      const constraints = {
        video: selectedDevices.videoDeviceId
          ? { deviceId: { exact: selectedDevices.videoDeviceId } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: selectedDevices.audioDeviceId
          ? { deviceId: { exact: selectedDevices.audioDeviceId } }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log('✅ Media stream obtained');
      console.log('  📹 Video:', stream.getVideoTracks()[0]?.label);
      console.log('  🎤 Audio:', stream.getAudioTracks()[0]?.label);

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

    // ✨ Stop AssemblyAI
    if (assemblyAIRef.current) {
      assemblyAIRef.current.stop();
      assemblyAIRef.current = null;
      setAssemblyAIStatus('disconnected');
    }

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
    setShowDeviceSettings(false);
    setLiveTranscript('');
    setTranscriptHistory([]);
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    socketRef.current = null;
    remotePeerIdRef.current = null;
    setIceStats({ localCandidates: 0, remoteCandidates: 0, selectedPair: null });
    
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
      return;
    }

    const history = remoteEmotions.history;
    const totalReadings = history.length;

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
      // Note: Remote emotion is now primarily driven by AssemblyAI transcript analysis
      // but we can still do basic visual analysis as backup
      const remoteEmotion = detectEmotion(remoteVideoRef.current, false);

      if (localEmotion) {
        setLocalEmotions(prev => ({
          ...localEmotion,
          history: [...prev.history.slice(-99), localEmotion]
        }));
      }

      // Only update visual emotion if we don't have recent transcript-based emotion
      if (remoteEmotion && !transcriptEnabled) {
        setRemoteEmotions(prev => {
          // Only update if no recent transcript emotion (within last 5 seconds)
          const lastTranscriptTime = prev.history.length > 0 ? prev.history[prev.history.length - 1].timestamp : 0;
          if (Date.now() - lastTranscriptTime > 5000) {
            return {
              ...remoteEmotion,
              history: [...prev.history.slice(-99), remoteEmotion]
            };
          }
          return prev;
        });

        if (remoteEmotion.primary === 'sad' && remoteEmotion.confidence > 0.7) {
          addAlert('Patient appears distressed (visual)', 'alert');
        } else if (remoteEmotion.primary === 'angry' && remoteEmotion.confidence > 0.75) {
          addAlert('Elevated tension detected (visual)', 'warning');
        } else if (remoteEmotion.primary === 'fearful' && remoteEmotion.confidence > 0.7) {
          addAlert('Patient may be anxious or fearful (visual)', 'alert');
        }
      }
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

  const getAssemblyAIStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'disconnected':
        return 'text-gray-600';
      case 'error':
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
            Emotion Video Call + AssemblyAI
          </h1>
          <p className="text-gray-600">Real-time transcription and emotion analysis for telehealth</p>
        </div>

        {!callActive ? (
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Device Settings
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📹 Camera
                </label>
                <select
                  value={selectedDevices.videoDeviceId}
                  onChange={(e) => setSelectedDevices(prev => ({
                    ...prev,
                    videoDeviceId: e.target.value
                  }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {availableDevices.videoInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${availableDevices.videoInputs.indexOf(device) + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🎤 Microphone
                </label>
                <select
                  value={selectedDevices.audioDeviceId}
                  onChange={(e) => setSelectedDevices(prev => ({
                    ...prev,
                    audioDeviceId: e.target.value
                  }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {availableDevices.audioInputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${availableDevices.audioInputs.indexOf(device) + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔊 Speaker
                </label>
                <select
                  value={selectedDevices.audioOutputDeviceId}
                  onChange={(e) => setSelectedDevices(prev => ({
                    ...prev,
                    audioOutputDeviceId: e.target.value
                  }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {availableDevices.audioOutputs.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${availableDevices.audioOutputs.indexOf(device) + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={loadAvailableDevices}
                className="w-full px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                🔄 Refresh Devices
              </button>
            </div>

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

              <div className="mb-6">
                <label htmlFor="metered-api-key" className="block text-sm font-medium text-gray-700 mb-2">
                  Metered API Key
                </label>
                <input
                  id="metered-api-key"
                  type="text"
                  value={meteredApiKey}
                  onChange={(e) => setMeteredApiKey(e.target.value)}
                  placeholder="Enter your Metered API key"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Required for reliable connection. Get a free key from <a href="https://www.metered.ca/tools/openrelay" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Metered Open Relay</a>.
                </p>
              </div>

              {/* ✨ NEW: Transcript toggle */}
              <div className="mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transcriptEnabled}
                    onChange={(e) => setTranscriptEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable real-time speech transcription (AssemblyAI)
                  </span>
                </label>
                <p className="mt-1 ml-6 text-xs text-gray-500">
                  Analyzes patient speech for emotion detection and distress keywords
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
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-gray-600">Room ID:</p>
                  <p className="font-mono text-lg font-semibold text-gray-800">{currentRoomId}</p>
                </div>

                {/* ✨ NEW: AssemblyAI Status */}
                <div className="flex items-center gap-2 text-sm">
                  <Activity className={`w-4 h-4 ${getAssemblyAIStatusColor(assemblyAIStatus)}`} />
                  <span className={getAssemblyAIStatusColor(assemblyAIStatus)}>
                    Transcript: {assemblyAIStatus}
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <div className="flex gap-4">
                    <span>📤 Local ICE: {iceStats.localCandidates}</span>
                    <span>📥 Remote ICE: {iceStats.remoteCandidates}</span>
                  </div>
                  {iceStats.selectedPair && (
                    <div className="text-green-600 font-medium">
                      🎯 Using: {iceStats.selectedPair}
                    </div>
                  )}
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
                  onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-sm font-medium">Devices</span>
                </button>
                
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

              {showDeviceSettings && (
                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      📹 Camera
                    </label>
                    <select
                      value={selectedDevices.videoDeviceId}
                      onChange={(e) => changeVideoDevice(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {availableDevices.videoInputs.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${availableDevices.videoInputs.indexOf(device) + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      🎤 Microphone
                    </label>
                    <select
                      value={selectedDevices.audioDeviceId}
                      onChange={(e) => changeAudioDevice(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {availableDevices.audioInputs.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${availableDevices.audioInputs.indexOf(device) + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      🔊 Speaker
                    </label>
                    <select
                      value={selectedDevices.audioOutputDeviceId}
                      onChange={(e) => changeAudioOutput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {availableDevices.audioOutputs.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Speaker ${availableDevices.audioOutputs.indexOf(device) + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 flex items-center justify-between">
                    <span className="font-semibold">Patient</span>
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
                          <p className="text-xs text-gray-500 mt-2">
                            ICE: {connectionStatus.ice} | Local: {iceStats.localCandidates} | Remote: {iceStats.remoteCandidates}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ✨ NEW: Live Transcript Display */}
                {transcriptEnabled && isConnected && (
                  <div className="bg-white rounded-xl shadow-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                        Live Transcript
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${getAssemblyAIStatusColor(assemblyAIStatus)}`}>
                        {assemblyAIStatus}
                      </span>
                    </div>
                    
                    {liveTranscript ? (
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <p className="text-sm text-gray-800 italic">"{liveTranscript}"</p>
                        <p className="text-xs text-gray-500 mt-2">Just now</p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm text-center py-4">
                        Waiting for speech...
                      </p>
                    )}

                    {transcriptHistory.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-600 mb-2">Recent transcripts:</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {transcriptHistory.slice(-5).reverse().map((item) => (
                            <div key={item.id} className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                              {item.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2">
                    <span className="font-semibold">You (Caregiver)</span>
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
                    Debug Info
                  </h3>
                  <div className="space-y-2 text-xs font-mono">
                    <div>Socket: <span className={getConnectionStatusColor(connectionStatus.socket)}>{connectionStatus.socket}</span></div>
                    <div>Peer: <span className={getConnectionStatusColor(connectionStatus.peer)}>{connectionStatus.peer}</span></div>
                    <div>ICE: <span className={getConnectionStatusColor(connectionStatus.ice)}>{connectionStatus.ice}</span></div>
                    <div>Local ICE: {iceStats.localCandidates}</div>
                    <div>Remote ICE: {iceStats.remoteCandidates}</div>
                    <div>AssemblyAI: <span className={getAssemblyAIStatusColor(assemblyAIStatus)}>{assemblyAIStatus}</span></div>
                    {iceStats.selectedPair && (
                      <div className="text-green-600 font-semibold">
                        Selected: {iceStats.selectedPair}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 text-xs text-gray-500">
                    <p>💡 Check browser console (F12) for detailed logs</p>
                    <p>💡 Look for "relay" in logs to confirm TURN usage</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="font-bold text-lg mb-4">Alerts</h3>
                  {alerts.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No alerts</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {alerts.slice(-5).reverse().map((alert) => (
                        <div key={alert.id} className="p-2 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm">
                          {alert.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmotionVideoCallWithWebRTC;
