/**
 * AssemblyAI Real-time Transcription Service
 * Handles WebSocket connection to AssemblyAI Streaming API
 * Processes remote audio stream and provides transcription + sentiment analysis
 */

export class AssemblyAIService {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.audioContext = null;
    this.audioProcessor = null;
    this.sourceNode = null;
    this.isActive = false;
    this.audioBuffer = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.onTranscriptCallback = null;
    this.onSentimentCallback = null;
    this.onErrorCallback = null;
  }

  /**
   * Connect to AssemblyAI WebSocket
   */
  async connect() {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to AssemblyAI Streaming API...');
      
      // Connect to AssemblyAI WebSocket v3 endpoint
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token=${this.token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ Connected to AssemblyAI Streaming API');
        this.isActive = true;
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('❌ AssemblyAI WebSocket error:', error);
        if (this.onErrorCallback) {
          this.onErrorCallback('WebSocket connection error');
        }
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('🔌 AssemblyAI connection closed:', event.code, event.reason);
        this.isActive = false;
        
        // Attempt reconnection if not a normal closure
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          setTimeout(() => {
            this.connect().catch(err => console.error('Reconnection failed:', err));
          }, 2000 * this.reconnectAttempts);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Handle incoming WebSocket messages from AssemblyAI
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.message_type) {
        case 'SessionBegins':
          console.log('🎬 AssemblyAI session started:', message.session_id);
          break;

        case 'PartialTranscript':
          console.log('📝 Partial transcript:', message.text);
          // You can handle partial transcripts if you want real-time updates
          break;

        case 'FinalTranscript':
          console.log('✅ Final transcript:', message.text);
          if (this.onTranscriptCallback && message.text) {
            this.onTranscriptCallback(message.text, message);
          }
          
          // Check for sentiment analysis
          if (message.sentiment_analysis && this.onSentimentCallback) {
            this.onSentimentCallback(message.sentiment_analysis);
          }
          break;

        case 'SessionTerminated':
          console.log('🛑 AssemblyAI session terminated');
          break;

        case 'Error':
          console.error('❌ AssemblyAI error:', message.error);
          if (this.onErrorCallback) {
            this.onErrorCallback(message.error);
          }
          break;

        default:
          console.log('📨 AssemblyAI message:', message.message_type);
      }
    } catch (error) {
      console.error('❌ Error parsing AssemblyAI message:', error);
    }
  }

  /**
   * Start processing remote audio stream
   * @param {MediaStream} remoteAudioStream - The remote WebRTC audio stream to analyze
   * @param {Function} onTranscript - Callback for transcription results
   * @param {Function} onSentiment - Callback for sentiment analysis
   * @param {Function} onError - Callback for errors
   */
  async startProcessing(remoteAudioStream, onTranscript, onSentiment, onError) {
    console.log('🎤 Starting audio processing for AssemblyAI...');
    
    this.onTranscriptCallback = onTranscript;
    this.onSentimentCallback = onSentiment;
    this.onErrorCallback = onError;

    // Verify we have audio tracks
    const audioTracks = remoteAudioStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error('❌ No audio tracks found in remote stream');
      if (onError) onError('No audio tracks available');
      return;
    }

    console.log('🔊 Audio tracks found:', audioTracks.length);
    audioTracks.forEach((track, i) => {
      console.log(`  Track ${i}: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}`);
    });

    try {
      // Create AudioContext with 16kHz sample rate (required by AssemblyAI)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      console.log('🎵 AudioContext created with sample rate:', this.audioContext.sampleRate);

      // Create media stream source from remote audio
      this.sourceNode = this.audioContext.createMediaStreamSource(remoteAudioStream);
      console.log('✅ Media stream source created');

      // Create ScriptProcessor for audio processing (4096 samples buffer)
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      const BUFFER_SIZE = 8000; // ~500ms at 16kHz (AssemblyAI recommends 50-1000ms chunks)
      this.audioBuffer = [];

      this.audioProcessor.onaudioprocess = (event) => {
        if (!this.isActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert Float32 to Int16 PCM (required by AssemblyAI)
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clamp value between -1 and 1
          const s = Math.max(-1, Math.min(1, inputData[i]));
          // Convert to 16-bit integer
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Add to buffer
        this.audioBuffer.push(...pcmData);

        // Send when buffer reaches target size
        if (this.audioBuffer.length >= BUFFER_SIZE) {
          const chunk = new Int16Array(this.audioBuffer.splice(0, BUFFER_SIZE));
          this.sendAudio(chunk);
        }
      };

      // Connect audio graph: source -> processor -> destination
      this.sourceNode.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);

      console.log('✅ Audio processing pipeline connected');
      console.log('🎙️ Now processing remote audio and sending to AssemblyAI');

    } catch (error) {
      console.error('❌ Error setting up audio processing:', error);
      if (onError) onError('Failed to setup audio processing: ' + error.message);
      throw error;
    }
  }

  /**
   * Send audio data to AssemblyAI
   */
  sendAudio(pcmData) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket not ready, skipping audio chunk');
      return;
    }

    try {
      // Convert Int16Array to base64
      const uint8Array = new Uint8Array(pcmData.buffer);
      const base64 = btoa(String.fromCharCode.apply(null, uint8Array));
      
      // Send to AssemblyAI
      this.ws.send(JSON.stringify({
        audio_data: base64
      }));
    } catch (error) {
      console.error('❌ Error sending audio:', error);
    }
  }

  /**
   * Stop processing and clean up resources
   */
  async stop() {
    console.log('🛑 Stopping AssemblyAI service...');
    this.isActive = false;

    // Flush remaining audio buffer
    if (this.audioBuffer.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const chunk = new Int16Array(this.audioBuffer);
      this.sendAudio(chunk);
      this.audioBuffer = [];
    }

    // Disconnect audio processing
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Terminate AssemblyAI session
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ terminate_session: true }));
      this.ws.close();
    }
    this.ws = null;

    console.log('✅ AssemblyAI service stopped');
  }

  /**
   * Get service status
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN && this.isActive;
  }
}

/**
 * Fetch temporary token from backend
 */
export async function getAssemblyAIToken(serverUrl) {
  try {
    const response = await fetch(`${serverUrl}/api/assemblyai-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status}`);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('❌ Error fetching AssemblyAI token:', error);
    throw error;
  }
}

/**
 * Emotion and sentiment analysis helpers
 */
export const EmotionAnalyzer = {
  /**
   * Analyze emotion from transcribed text
   */
  analyzeEmotionFromText(text) {
    const lowerText = text.toLowerCase();
    
    // Define keyword sets for different emotions
    const emotionKeywords = {
      distress: ['help', 'scared', 'worried', 'anxious', 'pain', 'hurt', 'afraid', 'can\'t', 'panicking', 'emergency'],
      sad: ['sad', 'depressed', 'lonely', 'hopeless', 'down', 'crying', 'miserable', 'unhappy'],
      angry: ['angry', 'mad', 'frustrated', 'annoyed', 'furious', 'irritated', 'pissed'],
      happy: ['happy', 'great', 'good', 'wonderful', 'glad', 'excited', 'amazing', 'fantastic', 'love'],
      anxious: ['nervous', 'tense', 'stressed', 'overwhelmed', 'worry', 'uneasy'],
      fearful: ['fear', 'terrified', 'scared', 'frightened', 'alarmed']
    };

    // Count matches for each emotion
    const scores = {};
    let maxScore = 0;
    let detectedEmotion = 'neutral';

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      const score = keywords.filter(keyword => lowerText.includes(keyword)).length;
      scores[emotion] = score;
      
      if (score > maxScore) {
        maxScore = score;
        detectedEmotion = emotion === 'distress' ? 'fearful' : emotion;
      }
    }

    return {
      emotion: detectedEmotion,
      confidence: maxScore > 0 ? Math.min(0.9, 0.5 + (maxScore * 0.15)) : 0.4,
      isDistressed: scores.distress > 0,
      keywords: scores
    };
  },

  /**
   * Detect distress from sentiment score
   */
  detectDistressFromSentiment(sentiment) {
    // AssemblyAI sentiment scores typically range from negative to positive
    if (sentiment.sentiment === 'negative' && sentiment.confidence > 0.7) {
      return {
        isDistressed: true,
        level: sentiment.confidence > 0.85 ? 'high' : 'moderate',
        message: 'Negative sentiment detected in patient speech'
      };
    }
    return { isDistressed: false };
  }
};
