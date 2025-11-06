import React, { useState, useRef, useEffect } from 'react';
import { Camera, Mic, MicOff, Video, VideoOff, Phone, PhoneOff, AlertCircle, Heart, Frown, Smile, Meh, Copy, Check, Settings, Wifi, WifiOff } from 'lucide-react';
import io from 'socket.io-client';

const EmotionVideoCall = () => {
  const [callActive, setCallActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  
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
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const remotePeerIdRef = useRef(null);

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
      
      setAvailableDevices({ videoInputs, audioInputs, audioOutputs });
      
      if (videoInputs.length > 0 && !selectedDevices.videoDeviceId) {
        setSelectedDevices(prev => ({ ...prev, videoDeviceId: videoInputs[0].deviceId }));
      }
      if (audioInputs.length > 0 && !selectedDevices.audioDeviceId) {
        setSelectedDevices(prev => ({ ...prev, audioDeviceId: audioInputs[0].deviceId }));
      }
      if (audioOutputs.length > 0 && !selectedDevices.audioOutputDeviceId) {
        setSelectedDevices(prev => ({ ...prev, audioOutputDeviceId: audioOutputs[0].deviceId }));
      }
      
      tempStream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  const changeVideoDevice = async (deviceId) => {
    setSelectedDevices(prev => ({ ...prev, videoDeviceId: deviceId }));
    
    if (localStreamRef.current && callActive) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: { deviceId: { exact: selectedDevices.audioDeviceId } }
        });
        
        if (peerConnectionRef.current) {
          const videoTrack = newStream.getVideoTracks()[0];
          const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) await sender.replaceTrack(videoTrack);
        }
        
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) oldVideoTrack.stop();
        
        localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
        localStreamRef.current.addTrack(videoTrack);
        
        setLocalStream(newStream);
        localStreamRef.current = newStream;
      } catch (error) {
        console.error('Error changing video device:', error);
      }
    }
  };

  const changeAudioDevice = async (deviceId) => {
    setSelectedDevices(prev => ({ ...prev, audioDeviceId: deviceId }));
    
    if (localStreamRef.current && callActive) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedDevices.videoDeviceId } },
          audio: { deviceId: { exact: deviceId } }
        });
        
        if (peerConnectionRef.current) {
          const audioTrack = newStream.getAudioTracks()[0];
          const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) await sender.replaceTrack(audioTrack);
        }
        
        const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
        if (oldAudioTrack) oldAudioTrack.stop();
        
        localStreamRef.current.removeTrack(localStreamRef.current.getAudioTracks()[0]);
        localStreamRef.current.addTrack(audioTrack);
        
        setLocalStream(newStream);
        localStreamRef.current = newStream;
      } catch (error) {
        console.error('Error changing audio device:', error);
      }
    }
  };

  const changeAudioOutput = async (deviceId) => {
    setSelectedDevices(prev => ({ ...prev, audioOutputDeviceId: deviceId }));
    
    if (remoteVideoRef.current && typeof remoteVideoRef.current.setSinkId === 'function') {
      try {
        await remoteVideoRef.current.setSinkId(deviceId);
      } catch (error) {
        console.error('Error changing audio output:', error);
      }
    }
  };

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error('Local video play error:', e));
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      
      if (selectedDevices.audioOutputDeviceId && typeof remoteVideoRef.current.setSinkId === 'function') {
        remoteVideoRef.current.setSinkId(selectedDevices.audioOutputDeviceId).catch(e => console.error('Error setting audio output:', e));
      }
      
      remoteVideoRef.current.play().catch(e => console.error('Remote video play error:', e));
    }
  }, [remoteStream, selectedDevices.audioOutputDeviceId]);

  // Simple ICE configuration - works on mobile hotspot
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  };

  const connectToServer = () => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      setConnectionStatus(prev => ({ ...prev, socket: 'connected' }));
    });

    socketRef.current.on('disconnect', () => {
      setConnectionStatus(prev => ({ ...prev, socket: 'disconnected' }));
    });

    socketRef.current.on('room-users', async (users) => {
      if (users.length > 0 && users[0] !== socketRef.current.id) {
        remotePeerIdRef.current = users[0];
        await createOffer(users[0], localStreamRef.current);
      }
    });

    socketRef.current.on('user-joined', async (userId) => {
      remotePeerIdRef.current = userId;
    });

    socketRef.current.on('offer', async (data) => {
      remotePeerIdRef.current = data.from;
      await handleOffer(data);
    });

    socketRef.current.on('answer', async (data) => {
      await handleAnswer(data);
    });

    socketRef.current.on('ice-candidate', async (data) => {
      await handleIceCandidate(data);
    });

    socketRef.current.on('user-left', () => {
      handleUserLeft();
    });
  };

  const createPeerConnection = (remotePeerId, stream) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const peerConnection = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = peerConnection;

    if (stream) {
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });
    }

    peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setIsConnected(true);
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate.toJSON(),
          to: remotePeerId
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      setConnectionStatus(prev => ({ ...prev, peer: state }));
      
      if (state === 'connected') {
        setIsConnected(true);
      } else if (state === 'disconnected' || state === 'failed') {
        setIsConnected(false);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      setConnectionStatus(prev => ({ ...prev, ice: state }));
    };

    return peerConnection;
  };

  const createOffer = async (remotePeerId, stream) => {
    const peerConnection = createPeerConnection(remotePeerId, stream);
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true
      });
      
      await peerConnection.setLocalDescription(offer);
      
      socketRef.current.emit('offer', {
        offer,
        to: remotePeerId,
        from: socketRef.current.id
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleOffer = async (data) => {
    const peerConnection = createPeerConnection(data.from, localStreamRef.current);
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      socketRef.current.emit('answer', {
        answer,
        to: data.from,
        from: socketRef.current.id
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (data) => {
    try {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      if (peerConnectionRef.current && data.candidate) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  };

  const handleUserLeft = () => {
    setRemoteStream(null);
    setIsConnected(false);
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    remotePeerIdRef.current = null;
  };

  const startCall = async () => {
    if (!roomId.trim()) {
      alert('Please enter a room ID');
      return;
    }

    try {
      const constraints = {
        video: selectedDevices.videoDeviceId 
          ? { deviceId: { exact: selectedDevices.videoDeviceId } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: selectedDevices.audioDeviceId
          ? { deviceId: { exact: selectedDevices.audioDeviceId } }
          : { echoCancellation: true, noiseSuppression: true }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setCallActive(true);
      setCurrentRoomId(roomId);
      
      connectToServer();
      
      setTimeout(() => {
        socketRef.current.emit('join-room', roomId);
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing media:', error);
      alert('Could not access camera/microphone: ' + error.message);
    }
  };

  const endCall = () => {
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
    setShowDeviceSettings(false);
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

  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
            <Heart className="w-10 h-10 text-red-500" />
            Emotion Video Call
          </h1>
          <p className="text-gray-600">Real-time video calling</p>
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
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    {connectionStatus.socket === 'connected' ? (
                      <Wifi className="w-4 h-4 text-green-600" />
                    ) : (
                      <Wifi className="w-4 h-4 text-red-600" />
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
                      {isConnected ? 'Connected' : 'Connecting...'}
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2">
                  <span className="font-semibold">Remote User</span>
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
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2">
                  <span className="font-semibold">You</span>
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
          </>
        )}
      </div>
    </div>
  );
};

export default EmotionVideoCall;
