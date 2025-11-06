const [isConnected, setIsConnected] = useState(false);
const [copied, setCopied] = useState(false);

  // ✨ NEW: Device selection states
const [availableDevices, setAvailableDevices] = useState({
videoInputs: [],
audioInputs: [],
@@ -33,6 +32,13 @@ const EmotionVideoCallWithWebRTC = () => {
ice: 'new'
});

  // ✨ NEW: ICE candidate tracking
  const [iceStats, setIceStats] = useState({
    localCandidates: 0,
    remoteCandidates: 0,
    selectedPair: null
  });
  
const [localEmotions, setLocalEmotions] = useState({
primary: 'neutral',
confidence: 0,
@@ -84,15 +90,12 @@ const EmotionVideoCallWithWebRTC = () => {
const remotePeerIdRef = useRef(null);
const reconnectTimeoutRef = useRef(null);

  // ✨ NEW: Load available devices on component mount
useEffect(() => {
loadAvailableDevices();
}, []);

  // ✨ NEW: Function to load available media devices
const loadAvailableDevices = async () => {
try {
      // Request permission first to get device labels
const tempStream = await navigator.mediaDevices.getUserMedia({ 
video: true, 
audio: true 
@@ -114,7 +117,6 @@ const EmotionVideoCallWithWebRTC = () => {
audioOutputs
});

      // Set default devices (first one in each category)
if (videoInputs.length > 0 && !selectedDevices.videoDeviceId) {
setSelectedDevices(prev => ({
...prev,
@@ -134,15 +136,13 @@ const EmotionVideoCallWithWebRTC = () => {
}));
}

      // Stop temp stream
tempStream.getTracks().forEach(track => track.stop());

} catch (error) {
console.error('❌ Error loading devices:', error);
}
};

  // ✨ NEW: Function to change video device
const changeVideoDevice = async (deviceId) => {
console.log('📹 Changing video device to:', deviceId);

@@ -153,13 +153,11 @@ const EmotionVideoCallWithWebRTC = () => {

if (localStreamRef.current && callActive) {
try {
        // Get new stream with selected video device
const newStream = await navigator.mediaDevices.getUserMedia({
video: { deviceId: { exact: deviceId } },
audio: { deviceId: { exact: selectedDevices.audioDeviceId } }
});

        // Replace video track in peer connection
if (peerConnectionRef.current) {
const videoTrack = newStream.getVideoTracks()[0];
const sender = peerConnectionRef.current
@@ -172,17 +170,14 @@ const EmotionVideoCallWithWebRTC = () => {
}
}

        // Stop old video track
const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
if (oldVideoTrack) {
oldVideoTrack.stop();
}

        // Remove old video track and add new one
localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
localStreamRef.current.addTrack(videoTrack);

        // Update local video display
setLocalStream(newStream);
localStreamRef.current = newStream;

@@ -194,7 +189,6 @@ const EmotionVideoCallWithWebRTC = () => {
}
};

  // ✨ NEW: Function to change audio device
const changeAudioDevice = async (deviceId) => {
console.log('🎤 Changing audio device to:', deviceId);

@@ -205,13 +199,11 @@ const EmotionVideoCallWithWebRTC = () => {

if (localStreamRef.current && callActive) {
try {
        // Get new stream with selected audio device
const newStream = await navigator.mediaDevices.getUserMedia({
video: { deviceId: { exact: selectedDevices.videoDeviceId } },
audio: { deviceId: { exact: deviceId } }
});

        // Replace audio track in peer connection
if (peerConnectionRef.current) {
const audioTrack = newStream.getAudioTracks()[0];
const sender = peerConnectionRef.current
@@ -224,17 +216,14 @@ const EmotionVideoCallWithWebRTC = () => {
}
}

        // Stop old audio track
const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
if (oldAudioTrack) {
oldAudioTrack.stop();
}

        // Remove old audio track and add new one
localStreamRef.current.removeTrack(localStreamRef.current.getAudioTracks()[0]);
localStreamRef.current.addTrack(audioTrack);

        // Update local stream
setLocalStream(newStream);
localStreamRef.current = newStream;

@@ -246,7 +235,6 @@ const EmotionVideoCallWithWebRTC = () => {
}
};

  // ✨ NEW: Function to change audio output (speaker)
const changeAudioOutput = async (deviceId) => {
console.log('🔊 Changing audio output to:', deviceId);

@@ -255,7 +243,6 @@ const EmotionVideoCallWithWebRTC = () => {
audioOutputDeviceId: deviceId
}));

    // Set audio output for remote video
if (remoteVideoRef.current && typeof remoteVideoRef.current.setSinkId === 'function') {
try {
await remoteVideoRef.current.setSinkId(deviceId);
@@ -288,7 +275,6 @@ const EmotionVideoCallWithWebRTC = () => {
console.log('Setting remote video srcObject');
remoteVideoRef.current.srcObject = remoteStream;

      // Apply selected audio output
if (selectedDevices.audioOutputDeviceId && 
typeof remoteVideoRef.current.setSinkId === 'function') {
remoteVideoRef.current.setSinkId(selectedDevices.audioOutputDeviceId)
@@ -301,19 +287,18 @@ const EmotionVideoCallWithWebRTC = () => {
}
}, [remoteStream, selectedDevices.audioOutputDeviceId]);

  // ✨ ENHANCED: Added FREE TURN servers for better NAT traversal
  // ✨ ENHANCED: Multiple TURN server options with better configuration
const iceServers = {
iceServers: [
      // STUN servers (for NAT discovery)
      // Google STUN servers
{ urls: 'stun:stun.l.google.com:19302' },
{ urls: 'stun:stun1.l.google.com:19302' },
{ urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // Mozilla STUN
{ urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.stunprotocol.org:3478' },

      // ✨ TURN servers (for strict firewalls) - Open Relay Project (FREE)
      // ✨ Open Relay TURN servers (FREE - No signup required)
{
urls: 'turn:openrelay.metered.ca:80',
username: 'openrelayproject',
@@ -328,14 +313,21 @@ const EmotionVideoCallWithWebRTC = () => {
urls: 'turn:openrelay.metered.ca:443?transport=tcp',
username: 'openrelayproject',
credential: 'openrelayproject'
      }
      },
      
      // ✨ Additional public STUN servers for redundancy
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.voip.blackberry.com:3478' }
],
    iceCandidatePoolSize: 10
    iceCandidatePoolSize: 10,
    // ✨ NEW: Force TURN relay for testing (remove in production)
    // iceTransportPolicy: 'relay' // Uncomment to test TURN servers
};

const connectToServer = () => {
const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
console.log('🔧 Connecting to server:', serverUrl);
    console.log('🔧 ICE Servers configured:', iceServers.iceServers.length);

socketRef.current = io(serverUrl, {
transports: ['websocket', 'polling'],
@@ -420,6 +412,7 @@ const EmotionVideoCallWithWebRTC = () => {

const createPeerConnection = (remotePeerId, stream) => {
console.log('🔗 Creating peer connection for:', remotePeerId);
    console.log('🔗 Using ICE servers:', iceServers.iceServers.map(s => s.urls));

if (peerConnectionRef.current) {
console.log('🔄 Closing existing peer connection');
@@ -429,6 +422,10 @@ const EmotionVideoCallWithWebRTC = () => {
const peerConnection = new RTCPeerConnection(iceServers);
peerConnectionRef.current = peerConnection;

    // ✨ NEW: Monitor ICE candidate statistics
    let localCandidateCount = 0;
    let remoteCandidateCount = 0;

if (stream) {
const tracks = stream.getTracks();
console.log('📹 Adding', tracks.length, 'tracks to peer connection');
@@ -469,13 +466,20 @@ const EmotionVideoCallWithWebRTC = () => {

peerConnection.onicecandidate = (event) => {
if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
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
        console.log('✅ All ICE candidates sent');
        console.log('✅ All ICE candidates sent. Total:', localCandidateCount);
}
};

@@ -487,6 +491,22 @@ const EmotionVideoCallWithWebRTC = () => {
if (state === 'connected') {
console.log('✅✅✅ Peer connection ESTABLISHED!');
setIsConnected(true);
        
        // ✨ Log selected ICE candidate pair
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
@@ -508,10 +528,23 @@ const EmotionVideoCallWithWebRTC = () => {

if (state === 'disconnected' || state === 'failed') {
console.log('⚠️ ICE connection issue:', state);
        console.log('📊 ICE Stats - Local candidates:', localCandidateCount, 'Remote candidates:', remoteCandidateCount);
        
reconnectTimeoutRef.current = setTimeout(() => {
if (peerConnection.iceConnectionState === 'disconnected' || 
peerConnection.iceConnectionState === 'failed') {
console.log('❌ ICE connection timeout - restarting');
            
            // ✨ Log why connection failed
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
@@ -580,6 +613,7 @@ const EmotionVideoCallWithWebRTC = () => {

await peerConnection.setLocalDescription(offer);
console.log('📤 Sending offer');
      console.log('📤 Offer SDP contains TURN?', offer.sdp.includes('relay'));

socketRef.current.emit('offer', {
offer,
@@ -603,6 +637,7 @@ const EmotionVideoCallWithWebRTC = () => {
const answer = await peerConnection.createAnswer();
await peerConnection.setLocalDescription(answer);
console.log('📤 Sending answer');
      console.log('📤 Answer SDP contains TURN?', answer.sdp.includes('relay'));

socketRef.current.emit('answer', {
answer,
@@ -637,7 +672,9 @@ const EmotionVideoCallWithWebRTC = () => {
await peerConnectionRef.current.addIceCandidate(
new RTCIceCandidate(data.candidate)
);
        console.log('✅ ICE candidate added');
        const remoteCandidateCount = iceStats.remoteCandidates + 1;
        console.log(`✅ Remote ICE candidate #${remoteCandidateCount} added:`, data.candidate.type, data.candidate.protocol);
        setIceStats(prev => ({ ...prev, remoteCandidates: remoteCandidateCount }));
}
} catch (error) {
console.error('❌ Error adding ICE candidate:', error);
@@ -662,6 +699,7 @@ const EmotionVideoCallWithWebRTC = () => {
}

remotePeerIdRef.current = null;
    setIceStats({ localCandidates: 0, remoteCandidates: 0, selectedPair: null });
addAlert('Remote user disconnected', 'warning');
};

@@ -674,7 +712,6 @@ const EmotionVideoCallWithWebRTC = () => {
try {
console.log('🎥 Starting call...');

      // ✨ UPDATED: Use selected devices
const constraints = {
video: selectedDevices.videoDeviceId 
? { deviceId: { exact: selectedDevices.videoDeviceId } }
@@ -751,6 +788,7 @@ const EmotionVideoCallWithWebRTC = () => {
peerConnectionRef.current = null;
socketRef.current = null;
remotePeerIdRef.current = null;
    setIceStats({ localCandidates: 0, remoteCandidates: 0, selectedPair: null });

setConnectionStatus({
socket: 'disconnected',
@@ -1054,21 +1092,19 @@ const EmotionVideoCallWithWebRTC = () => {
<div className="text-center mb-8">
<h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
<Heart className="w-10 h-10 text-red-500" />
            Emotion Video Call
            Emotion Video Call (Enhanced Debug)
</h1>
          <p className="text-gray-600">Real-time emotion tracking with device selection</p>
          <p className="text-gray-600">With TURN servers and detailed ICE statistics</p>
</div>

{!callActive ? (
<div className="max-w-md mx-auto space-y-4">
            {/* ✨ NEW: Device Selection Panel (Before Call) */}
<div className="bg-white rounded-2xl shadow-xl p-8">
<h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
<Settings className="w-5 h-5" />
Device Settings
</h3>

              {/* Video Device Selection */}
<div className="mb-4">
<label className="block text-sm font-medium text-gray-700 mb-2">
📹 Camera
@@ -1089,7 +1125,6 @@ const EmotionVideoCallWithWebRTC = () => {
</select>
</div>

              {/* Audio Input Selection */}
<div className="mb-4">
<label className="block text-sm font-medium text-gray-700 mb-2">
🎤 Microphone
@@ -1110,7 +1145,6 @@ const EmotionVideoCallWithWebRTC = () => {
</select>
</div>

              {/* Audio Output Selection */}
<div className="mb-4">
<label className="block text-sm font-medium text-gray-700 mb-2">
🔊 Speaker
@@ -1139,7 +1173,6 @@ const EmotionVideoCallWithWebRTC = () => {
</button>
</div>

            {/* Room Entry */}
<div className="bg-white rounded-2xl shadow-xl p-8">
<div className="mb-6">
<label className="block text-sm font-medium text-gray-700 mb-2">
@@ -1168,14 +1201,26 @@ const EmotionVideoCallWithWebRTC = () => {
</div>
) : (
<>
            {/* Connection Status Bar */}
<div className="bg-white rounded-xl shadow-lg p-4 mb-6">
<div className="flex items-center justify-between flex-wrap gap-4">
<div>
<p className="text-sm text-gray-600">Room ID:</p>
<p className="font-mono text-lg font-semibold text-gray-800">{currentRoomId}</p>
</div>

                {/* ✨ NEW: ICE Statistics Display */}
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
@@ -1204,7 +1249,6 @@ const EmotionVideoCallWithWebRTC = () => {
</div>
</div>

                {/* ✨ NEW: Device Settings Button */}
<button
onClick={() => setShowDeviceSettings(!showDeviceSettings)}
className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
@@ -1231,7 +1275,6 @@ const EmotionVideoCallWithWebRTC = () => {
</button>
</div>

              {/* ✨ NEW: Device Settings Panel (During Call) */}
{showDeviceSettings && (
<div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
<div>
@@ -1288,10 +1331,8 @@ const EmotionVideoCallWithWebRTC = () => {
)}
</div>

            {/* Rest of the UI (videos, controls, statistics) - keeping it short for space */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
<div className="lg:col-span-2 space-y-4">
                {/* Remote Video */}
<div className="bg-white rounded-xl shadow-lg overflow-hidden">
<div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 flex items-center justify-between">
<span className="font-semibold">Patient</span>
@@ -1315,15 +1356,17 @@ const EmotionVideoCallWithWebRTC = () => {
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

                {/* Local Video */}
<div className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2 flex items-center justify-between">
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-4 py-2">
<span className="font-semibold">You (Caregiver)</span>
</div>
<div className="relative bg-gray-900 aspect-video">
@@ -1338,7 +1381,6 @@ const EmotionVideoCallWithWebRTC = () => {
</div>
</div>

                {/* Controls */}
<div className="bg-white rounded-xl shadow-lg p-6">
<div className="flex items-center justify-center gap-4">
<button
@@ -1372,33 +1414,39 @@ const EmotionVideoCallWithWebRTC = () => {
</button>
</div>
</div>

                {/* Statistics Dashboard - Only showing structure, full code available in previous versions */}
                {isConnected && analyzing && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-indigo-600" />
                      Call Statistics Dashboard
                    </h3>
                    {/* Statistics content from previous version */}
                    <p className="text-sm text-gray-500">
                      Duration: {formatDuration(callStatistics.duration)} | 
                      Engagement: {callStatistics.engagementScore}% | 
                      Readings: {callStatistics.totalReadings}
                    </p>
                  </div>
                )}
</div>

              {/* Right sidebar - alerts, etc. */}
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
                    <p className="text-gray-500 text-sm text-center py-4">No concerns detected</p>
                    <p className="text-gray-500 text-sm text-center py-4">No alerts</p>
) : (
                    <div className="space-y-2">
                      {alerts.slice(-3).reverse().map((alert) => (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {alerts.slice(-5).reverse().map((alert) => (
<div key={alert.id} className="p-2 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm">
{alert.message}
</div>
