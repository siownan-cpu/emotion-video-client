// CRITICAL FIX for WebRTC ICE Connection Issues
// This patch improves the getIceServers function with better fallback options

// Replace the getIceServers function (around line 425) with this improved version:

const getIceServers = async () => {
  // Try Metered.ca first if API key is available
  if (meteredApiKey) {
    try {
      console.log('🔄 Fetching ICE servers from Metered API...');
      const response = await fetch(
        `https://emotion-video-call.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`,
        { timeout: 5000 }  // 5 second timeout
      );
      
      if (response.ok) {
        const servers = await response.json();
        console.log('✅ Fetched', servers.length, 'ICE servers from Metered');
        console.log('   Server types:', servers.map(s => s.urls).flat());
        return { iceServers: servers };
      } else {
        console.warn('⚠️ Metered API returned status:', response.status);
      }
    } catch (error) {
      console.error('❌ Metered API error:', error.message);
    }
  }

  // Comprehensive fallback configuration with multiple free TURN servers
  console.log('📡 Using fallback ICE server configuration');
  
  const fallbackServers = {
    iceServers: [
      // Google's public STUN servers (high reliability)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // Twilio's STUN server
      { urls: 'stun:global.stun.twilio.com:3478' },
      
      // Mozilla's STUN server
      { urls: 'stun:stun.services.mozilla.com' },
      
      // Free public TURN servers (Open Relay Project)
      // These provide relay functionality when direct P2P fails
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      
      // Alternative free TURN servers
      {
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'muazkh'
      },
      {
        urls: 'turn:numb.viagenie.ca:3478?transport=tcp',
        username: 'webrtc@live.com',
        credential: 'muazkh'
      }
    ],
    
    // Additional configuration for better connectivity
    iceCandidatePoolSize: 10,  // Pre-gather ICE candidates
    iceTransportPolicy: 'all', // Use all available methods (relay + direct)
  };

  console.log('✅ Configured with', fallbackServers.iceServers.length, 'ICE servers');
  console.log('   Including', fallbackServers.iceServers.filter(s => s.urls.includes('turn')).length, 'TURN servers');
  
  if (!meteredApiKey) {
    addAlert("Using free TURN servers - may have limitations", "info");
  } else {
    addAlert("Metered API unavailable, using fallback servers", "warning");
  }
  
  return fallbackServers;
};


// ALSO UPDATE: Add better ICE debugging in the createPeerConnection function
// Find the section around line 560 and enhance the ICE candidate handler:

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    localCandidateCount++;
    const candidate = event.candidate;
    
    // Determine candidate type for better debugging
    let candidateType = 'unknown';
    if (candidate.candidate) {
      if (candidate.candidate.includes('typ host')) candidateType = 'host';
      else if (candidate.candidate.includes('typ srflx')) candidateType = 'srflx (STUN)';
      else if (candidate.candidate.includes('typ relay')) candidateType = 'relay (TURN)';
      else if (candidate.candidate.includes('typ prflx')) candidateType = 'prflx';
    }
    
    // Extract protocol (udp/tcp)
    let protocol = 'unknown';
    if (candidate.candidate) {
      if (candidate.candidate.includes('udp')) protocol = 'udp';
      else if (candidate.candidate.includes('tcp')) protocol = 'tcp';
    }
    
    console.log(`🧊 Local ICE candidate #${localCandidateCount}: ${candidateType} ${protocol}`);
    console.log(`   Address: ${candidate.address || 'N/A'}`);
    console.log(`   Port: ${candidate.port || 'N/A'}`);
    console.log(`   Priority: ${candidate.priority || 'N/A'}`);
    
    // Log full candidate for debugging
    if (candidateType === 'relay (TURN)') {
      console.log('✅ TURN candidate available - good for NAT traversal!');
    }
    
    setIceStats(prev => ({ ...prev, localCandidates: localCandidateCount }));
    
    socketRef.current.emit('ice-candidate', {
      to: remotePeerId,
      candidate: event.candidate
    });
    
    console.log('📤 Sent ICE candidate to:', remotePeerId);
  } else {
    console.log('📡 ICE gathering state:', peerConnection.iceGatheringState);
    if (peerConnection.iceGatheringState === 'complete') {
      console.log('✅ ICE candidate gathering completed');
      console.log(`   Total local candidates: ${localCandidateCount}`);
    }
  }
};


// ADD: Better ICE connection state monitoring
peerConnection.oniceconnectionstatechange = () => {
  const state = peerConnection.iceConnectionState;
  console.log('❄️ ICE connection state:', state);
  
  setConnectionStatus(prev => ({ ...prev, ice: state }));
  
  switch (state) {
    case 'checking':
      console.log('🔍 Checking ICE candidates for best connection...');
      addAlert('Establishing connection...', 'info');
      break;
      
    case 'connected':
      console.log('✅ ICE connected successfully!');
      addAlert('Connected successfully!', 'success');
      setIsConnected(true);
      break;
      
    case 'completed':
      console.log('✅ ICE connection completed and optimal path selected');
      setIsConnected(true);
      
      // Log selected candidate pair for debugging
      peerConnection.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.selected) {
            console.log('🎯 Selected candidate pair:');
            console.log('   Local:', report.localCandidateId);
            console.log('   Remote:', report.remoteCandidateId);
            console.log('   State:', report.state);
            setIceStats(prev => ({ ...prev, selectedPair: report }));
          }
        });
      });
      break;
      
    case 'failed':
      console.error('❌ ICE connection failed!');
      console.log('📊 Connection diagnostics:');
      console.log('   Local candidates:', localCandidateCount);
      console.log('   Metered API key:', meteredApiKey ? 'SET' : 'NOT SET');
      addAlert('Connection failed. Check your network settings.', 'alert');
      
      // Attempt to restart ICE
      console.log('🔄 Attempting ICE restart...');
      if (peerConnection.restartIce) {
        peerConnection.restartIce();
      }
      break;
      
    case 'disconnected':
      console.warn('⚠️ ICE connection disconnected');
      addAlert('Connection interrupted, attempting to reconnect...', 'warning');
      setIsConnected(false);
      
      // Set reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (peerConnection.iceConnectionState === 'disconnected') {
          console.log('🔄 Triggering ICE restart after disconnection timeout');
          if (peerConnection.restartIce) {
            peerConnection.restartIce();
          }
        }
      }, 5000);
      break;
      
    case 'closed':
      console.log('🔒 ICE connection closed');
      setIsConnected(false);
      break;
      
    default:
      console.log('ℹ️ ICE state:', state);
  }
};


// ADDITIONAL: Add ICE gathering state monitoring
peerConnection.onicegatheringstatechange = () => {
  const state = peerConnection.iceGatheringState;
  console.log('📡 ICE gathering state:', state);
  
  if (state === 'gathering') {
    console.log('🔄 Gathering ICE candidates...');
  } else if (state === 'complete') {
    console.log(`✅ ICE gathering complete. Collected ${localCandidateCount} candidates`);
    
    // Log summary of candidate types
    peerConnection.getStats().then(stats => {
      const candidateTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      stats.forEach(report => {
        if (report.type === 'local-candidate') {
          if (report.candidateType) {
            candidateTypes[report.candidateType] = (candidateTypes[report.candidateType] || 0) + 1;
          }
        }
      });
      
      console.log('📊 ICE candidate summary:');
      console.log('   Host (local):', candidateTypes.host);
      console.log('   Srflx (STUN):', candidateTypes.srflx);
      console.log('   Relay (TURN):', candidateTypes.relay);
      console.log('   Prflx (peer reflexive):', candidateTypes.prflx);
      
      if (candidateTypes.relay === 0) {
        console.warn('⚠️ No TURN (relay) candidates! Connection may fail behind symmetric NAT');
        if (!meteredApiKey) {
          console.warn('💡 Consider setting VITE_METERED_API_KEY for better connectivity');
        }
      }
    });
  }
};
