/**
 * AssemblyAI Universal-Streaming (v3) Service - FIXED
 * 
 * ✅ Fixes:
 * - Proper v3 API message handling
 * - Displays transcripts correctly
 * - No message_type needed (v3 uses different format)
 * 
 * 🔒 Security:
 * - NO API key in frontend
 * - Gets temporary tokens from backend
 * - Tokens expire after 1 hour
 */

class AssemblyAIService {
  constructor() {
    this.websocket = null;
    this.isConnected = false;
    this.audioContext = null;
    this.processor = null;
    this.sourceNode = null;
    this.messages = [];
    this.sentiments = [];
    this.onMessageCallback = null;
    this.onSentimentCallback = null;
    this.onTranscriptCallback = null; // ✅ NEW: Separate callback for real-time transcripts
    this.connectionTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.token = null;
    this.audioBuffer = [];
    this.isProcessing = false;
    this.currentTranscript = ''; // ✅ NEW: Track current transcript
  }

  /**
   * Get temporary token from backend
   * @param {string} serverUrl - Your backend URL
   */
  async getTemporaryToken(serverUrl) {
    try {
      console.log('🔑 Requesting temporary token from backend...');
      console.log('   Server URL:', serverUrl);

      const response = await fetch(`${serverUrl}/api/assemblyai-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token request failed:', response.status, errorText);
        throw new Error(`Failed to get token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.token) {
        throw new Error('No token in response');
      }

      this.token = data.token;
      console.log('✅ Got temporary token (expires in', data.expires_in || 3600, 'seconds)');
      console.log('   Token preview:', this.token.substring(0, 20) + '...');
      
      return this.token;
    } catch (error) {
      console.error('❌ Error getting token:', error);
      throw error;
    }
  }

  /**
   * Start real-time transcription with v3 API
   * @param {MediaStream} stream - Audio stream to transcribe
   * @param {string} serverUrl - Backend server URL
   */
  async startRealtimeTranscription(stream, serverUrl) {
    return new Promise(async (resolve, reject) => {
      try {
        // Check if already connected
        if (this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
          console.log('ℹ️ Already connected to AssemblyAI');
          resolve();
          return;
        }

        // Get temporary token from backend
        if (!this.token) {
          await this.getTemporaryToken(serverUrl);
        }

        // Connect to AssemblyAI v3 WebSocket
        const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token=${this.token}`;
        
        console.log('🔌 Connecting to AssemblyAI v3 Universal-Streaming...');
        console.log('   URL:', wsUrl.substring(0, 60) + '...');

        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = async () => {
          console.log('✅ AssemblyAI v3 WebSocket connected');
          console.log('   ReadyState:', this.websocket.readyState);
          this.isConnected = true;
          this.reconnectAttempts = 0;

          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
          }

          // Start audio processing
          await this.startAudioProcessing(stream);
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('❌ Error parsing message:', error);
          }
        };

        this.websocket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(error);
        };

        this.websocket.onclose = (event) => {
          console.log('🔌 WebSocket closed:', event.code, event.reason);
          this.isConnected = false;
          this.isProcessing = false;

          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
              if (stream && serverUrl) {
                this.token = null; // Get fresh token
                this.startRealtimeTranscription(stream, serverUrl).catch(err => {
                  console.error('❌ Reconnection failed:', err);
                });
              }
            }, 2000 * this.reconnectAttempts);
          }
        };

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('❌ Connection timeout');
            this.websocket?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        console.error('❌ Error starting transcription:', error);
        reject(error);
      }
    });
  }

  /**
   * Process audio stream and send to AssemblyAI using AudioWorklet
   */
  async startAudioProcessing(stream) {
    if (!stream) {
      console.error('❌ No audio stream provided');
      return;
    }

    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error('❌ No audio tracks in stream');
        return;
      }

      console.log('🎤 Starting audio processing with AudioWorklet...');
      console.log('   Audio tracks:', audioTracks.length);
      console.log('   Track:', audioTracks[0].label);
      console.log('   Enabled:', audioTracks[0].enabled);

      // Create AudioContext with 16kHz sample rate (required by AssemblyAI)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // Use AudioWorklet (modern)
      await this.setupAudioWorklet();

      console.log('✅ Audio processing started');
    } catch (error) {
      console.error('❌ Error starting audio processing:', error);
      throw error;
    }
  }

  /**
   * Setup AudioWorklet processing (modern, no deprecation warnings)
   */
  async setupAudioWorklet() {
    try {
      // Create inline AudioWorklet processor
      const processorCode = `
        class AssemblyAIProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.bufferSize = 8000; // ~500ms at 16kHz
            this.buffer = [];
          }

          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input.length > 0) {
              const inputData = input[0]; // First channel
              
              // Convert Float32 to Int16 PCM
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                const pcm16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
                this.buffer.push(pcm16);
              }

              // Send when buffer is full
              if (this.buffer.length >= this.bufferSize) {
                const chunk = new Int16Array(this.buffer.splice(0, this.bufferSize));
                this.port.postMessage({ audioData: chunk.buffer }, [chunk.buffer]);
              }
            }
            
            return true; // Keep processor alive
          }
        }

        registerProcessor('assemblyai-processor', AssemblyAIProcessor);
      `;

      // Create blob URL for the processor
      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const processorUrl = URL.createObjectURL(blob);

      // Add the processor module
      await this.audioContext.audioWorklet.addModule(processorUrl);
      
      // Create the worklet node
      const workletNode = new AudioWorkletNode(this.audioContext, 'assemblyai-processor');
      
      // Handle messages from the worklet
      let audioPacketsCount = 0;
      let lastLogTime = Date.now();

      workletNode.port.onmessage = (event) => {
        if (this.isProcessing && this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
          const audioData = event.data.audioData;
          const pcm16 = new Int16Array(audioData);
          
          try {
            this.websocket.send(pcm16.buffer);
            audioPacketsCount++;

            // Log every 10 seconds
            const now = Date.now();
            if (now - lastLogTime > 10000) {
              console.log(`📡 Sent ${audioPacketsCount} audio packets to AssemblyAI`);
              lastLogTime = now;
            }
          } catch (error) {
            console.error('❌ Error sending audio packet:', error);
          }
        }
      };

      // Connect the audio graph
      this.sourceNode.connect(workletNode);
      // DON'T connect to destination - we don't want to hear it
      
      this.processor = workletNode;
      this.isProcessing = true;

      console.log('✅ AudioWorklet processor initialized (no deprecation warnings!)');
      
      // Clean up blob URL
      URL.revokeObjectURL(processorUrl);

    } catch (error) {
      console.error('❌ Error setting up AudioWorklet:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Handle v3 API messages
   * v3 API uses different format than v2:
   * - No 'message_type' field
   * - Uses 'type' field with values like 'Begin', 'Transcript', etc.
   * - Transcript messages have: turn_order, transcript, end_of_turn, words[], etc.
   */
  handleMessage(data) {
    // ✅ Handle v3 'Begin' message (session starts)
    if (data.type === 'Begin') {
      console.log('🎤 AssemblyAI v3 session started');
      console.log('   Session ID:', data.id);
      console.log('   Expires at:', new Date(data.expires_at * 1000).toISOString());
      return;
    }

    // ✅ Handle v3 transcript messages (no 'type' field)
    // v3 sends continuous transcript updates without explicit type
    if (data.hasOwnProperty('transcript')) {
      const transcript = data.transcript;
      const isEndOfTurn = data.end_of_turn === true;
      const confidence = data.end_of_turn_confidence || 0;

      // Log for debugging
      if (transcript && transcript.length > 0) {
        console.log('📝 Transcript:', transcript, '| End:', isEndOfTurn, '| Conf:', Math.round(confidence * 100) + '%');
      }

      // Update current transcript
      this.currentTranscript = transcript;

      // ✅ Call transcript callback for real-time display
      if (this.onTranscriptCallback) {
        this.onTranscriptCallback({
          text: transcript,
          isFinal: isEndOfTurn,
          confidence: confidence,
          timestamp: Date.now()
        });
      }

      // If end of turn, save as final message
      if (isEndOfTurn && transcript && transcript.trim().length > 0) {
        console.log('✅ Final transcript:', transcript);

        const message = {
          text: transcript,
          confidence: confidence,
          timestamp: Date.now(),
          isFinal: true,
          words: data.words || []
        };

        this.messages.push(message);

        if (this.onMessageCallback) {
          this.onMessageCallback(message);
        }

        // Analyze sentiment
        this.analyzeSentiment(transcript);
      }

      return;
    }

    // Handle error messages
    if (data.error) {
      console.error('❌ AssemblyAI error:', data.error);
      return;
    }

    // Log unknown message format
    console.log('ℹ️ AssemblyAI message:', JSON.stringify(data).substring(0, 200));
  }

  /**
   * Analyze sentiment using keyword-based approach
   */
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    // Positive keywords
    const positiveKeywords = ['good', 'great', 'happy', 'excellent', 'wonderful', 'love', 'amazing', 'fantastic', 'better', 'best', 'excited', 'pleased', 'joy', 'delighted'];
    // Negative keywords
    const negativeKeywords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'pain', 'hurt', 'sad', 'angry', 'frustrated', 'worried', 'upset', 'disappointed'];
    // Distress keywords
    const distressKeywords = ['pain', 'hurt', 'alone', 'lonely', 'depressed', 'anxious', 'scared', 'worried', 'afraid', 'hopeless', 'helpless', 'suffering'];

    let positiveCount = 0;
    let negativeCount = 0;
    let distressCount = 0;

    positiveKeywords.forEach(word => {
      if (lowerText.includes(word)) positiveCount++;
    });

    negativeKeywords.forEach(word => {
      if (lowerText.includes(word)) negativeCount++;
    });

    distressKeywords.forEach(word => {
      if (lowerText.includes(word)) distressCount++;
    });

    let sentiment = 'neutral';
    let score = 0;

    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      score = positiveCount - negativeCount;
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      score = negativeCount - positiveCount;
    }

    const sentimentData = {
      sentiment,
      score,
      text,
      timestamp: Date.now(),
      hasDistress: distressCount > 0,
      distressLevel: distressCount
    };

    this.sentiments.push(sentimentData);

    if (this.onSentimentCallback) {
      this.onSentimentCallback(sentimentData);
    }

    if (distressCount > 0) {
      console.warn('⚠️ Distress detected:', text);
      console.warn('   Distress keywords found:', distressCount);
    }
  }

  /**
   * Stop transcription and clean up
   */
  stop() {
    console.log('🛑 Stopping AssemblyAI transcription...');

    this.isProcessing = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.websocket) {
      if (this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close();
      }
      this.websocket = null;
    }

    this.isConnected = false;
    console.log('✅ AssemblyAI stopped and cleaned up');
  }

  /**
   * Get all transcription messages
   */
  getMessages() {
    return this.messages;
  }

  /**
   * Get all sentiment analysis results
   */
  getSentiments() {
    return this.sentiments;
  }

  /**
   * Get conversation data for storage
   */
  getConversationData() {
    return {
      messages: this.messages,
      sentiments: this.sentiments,
      totalMessages: this.messages.length,
      overallSentiment: this.calculateOverallSentiment(),
      distressEvents: this.sentiments.filter(s => s.hasDistress).length,
      duration: this.messages.length > 0 
        ? this.messages[this.messages.length - 1].timestamp - this.messages[0].timestamp
        : 0
    };
  }

  /**
   * Calculate overall sentiment
   */
  calculateOverallSentiment() {
    if (this.sentiments.length === 0) return 'neutral';

    const positive = this.sentiments.filter(s => s.sentiment === 'positive').length;
    const negative = this.sentiments.filter(s => s.sentiment === 'negative').length;

    if (positive > negative) return 'positive';
    if (negative > positive) return 'negative';
    return 'neutral';
  }

  /**
   * ✅ NEW: Set transcript callback for real-time updates
   */
  onTranscript(callback) {
    this.onTranscriptCallback = callback;
  }

  /**
   * Set message callback
   */
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  /**
   * Set sentiment callback
   */
  onSentiment(callback) {
    this.onSentimentCallback = callback;
  }
}

export default AssemblyAIService;
