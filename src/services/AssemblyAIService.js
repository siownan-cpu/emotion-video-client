/**
 * AssemblyAI Universal-Streaming (v3) Service
 * 
 * ✅ Features:
 * - Uses v3 streaming API (latest)
 * - Token-based authentication via backend
 * - ~300ms latency
 * - Immutable transcripts
 * - Sentiment analysis
 * - Distress detection
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
    this.connectionTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.token = null;
    this.audioBuffer = [];
    this.isProcessing = false;
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

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.websocket?.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket connection timeout (10s)');
            this.websocket?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.websocket.onopen = () => {
          clearTimeout(this.connectionTimeout);
          console.log('✅ AssemblyAI v3 WebSocket connected');
          console.log('   ReadyState:', this.websocket.readyState);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Start sending audio
          this.startAudioProcessing(stream);
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
          clearTimeout(this.connectionTimeout);
          console.error('❌ AssemblyAI WebSocket error:', error);
          this.isConnected = false;
          reject(error);
        };

        this.websocket.onclose = (event) => {
          clearTimeout(this.connectionTimeout);
          console.log('🔌 AssemblyAI WebSocket closed');
          console.log('   Code:', event.code);
          console.log('   Reason:', event.reason || 'No reason provided');
          
          this.isConnected = false;
          
          // Attempt reconnect on unexpected closure
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

      } catch (error) {
        console.error('❌ Error starting transcription:', error);
        reject(error);
      }
    });
  }

  /**
   * Process audio stream and send to AssemblyAI using AudioWorklet (modern approach)
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

      // Try to use AudioWorkletNode (modern), fallback to ScriptProcessor if not supported
      if (this.audioContext.audioWorklet) {
        await this.setupAudioWorklet();
      } else {
        console.warn('⚠️ AudioWorklet not supported, using ScriptProcessor fallback');
        this.setupScriptProcessor();
      }

      console.log('✅ Audio processing started');
    } catch (error) {
      console.error('❌ Error starting audio processing:', error);
      throw error;
    }
  }

  /**
   * Setup AudioWorklet processing (modern, runs in separate thread)
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

            // Log every 5 seconds
            const now = Date.now();
            if (now - lastLogTime > 5000) {
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
      workletNode.connect(this.audioContext.destination);
      
      this.processor = workletNode;
      this.isProcessing = true;

      console.log('✅ AudioWorklet processor initialized (no deprecation warnings!)');
      
      // Clean up blob URL
      URL.revokeObjectURL(processorUrl);

    } catch (error) {
      console.error('❌ AudioWorklet setup failed:', error);
      console.warn('⚠️ Falling back to ScriptProcessor');
      this.setupScriptProcessor();
    }
  }

  /**
   * Setup ScriptProcessor (fallback for older browsers)
   */
  setupScriptProcessor() {
    const BUFFER_SIZE = 8000; // ~500ms at 16kHz
    this.audioBuffer = [];
    this.isProcessing = true;

    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    let audioPacketsCount = 0;
    let lastLogTime = Date.now();

    this.processor.onaudioprocess = (e) => {
      if (!this.isProcessing || !this.isConnected || this.websocket?.readyState !== WebSocket.OPEN) {
        return;
      }

      const audioData = e.inputBuffer.getChannelData(0);
      
      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Add to buffer
      this.audioBuffer.push(...pcm16);

      // Send when buffer reaches target size
      if (this.audioBuffer.length >= BUFFER_SIZE) {
        const chunk = new Int16Array(this.audioBuffer.splice(0, BUFFER_SIZE));
        this.sendAudioChunk(chunk);
        audioPacketsCount++;

        // Log every 5 seconds
        const now = Date.now();
        if (now - lastLogTime > 5000) {
          console.log(`📡 Sent ${audioPacketsCount} audio packets to AssemblyAI`);
          lastLogTime = now;
        }
      }
    };

    // Connect audio graph
    this.sourceNode.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    console.log('✅ ScriptProcessor initialized (fallback mode)');
  }

  /**
   * Send audio chunk to AssemblyAI v3 (binary format)
   */
  sendAudioChunk(pcm16Data) {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // AssemblyAI v3 expects raw binary PCM16 data, not JSON
      // Send the ArrayBuffer directly
      this.websocket.send(pcm16Data.buffer);
    } catch (error) {
      console.error('❌ Error sending audio packet:', error);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    // Log unknown message types for debugging
    if (!data.message_type) {
      console.log('ℹ️ AssemblyAI message (no type):', JSON.stringify(data).substring(0, 200));
      return;
    }

    if (data.message_type === 'PartialTranscript') {
      // Real-time partial results
      console.log('📝 Partial:', data.text);
      
    } else if (data.message_type === 'FinalTranscript') {
      // Final immutable transcript
      console.log('✅ Final:', data.text);

      const message = {
        text: data.text,
        confidence: data.confidence || 0,
        timestamp: Date.now(),
        isFinal: true
      };

      this.messages.push(message);

      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }

      // Analyze sentiment
      this.analyzeSentiment(data.text);
      
    } else if (data.message_type === 'SessionBegins') {
      console.log('🎤 AssemblyAI session started');
      console.log('   Session ID:', data.session_id);
      console.log('   Expires at:', data.expires_at);
      
    } else if (data.message_type === 'SessionTerminated') {
      console.log('🔚 AssemblyAI session terminated');
      
    } else if (data.message_type === 'Error') {
      console.error('❌ AssemblyAI error:', data.error);
      
    } else {
      console.log('ℹ️ AssemblyAI message:', data.message_type, JSON.stringify(data).substring(0, 100));
    }
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
      if (lowerText.includes(word)) {
        distressCount++;
        console.warn(`⚠️ Distress keyword detected: "${word}"`);
      }
    });

    // Calculate sentiment score (-1 to 1)
    const totalWords = positiveCount + negativeCount + 1;
    const score = (positiveCount - negativeCount) / totalWords;
    const polarity = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    const sentiment = {
      text,
      polarity: {
        score: Number.isNaN(score) ? 0 : score,
      },
      suggested: polarity,
      distress: distressCount > 0,
      distressKeywords: distressCount,
      timestamp: Date.now(),
    };

    this.sentiments.push(sentiment);

    if (this.onSentimentCallback) {
      this.onSentimentCallback(sentiment);
    }

    // Log significant sentiment
    if (distressCount > 0 || Math.abs(score) > 0.5) {
      console.log('😊 Sentiment:', {
        polarity: polarity.toUpperCase(),
        score: score.toFixed(2),
        distress: distressCount > 0,
        text: text.substring(0, 50) + '...'
      });
    }

    return sentiment;
  }

  /**
   * Stop transcription and cleanup
   */
  stopRealtimeTranscription() {
    console.log('🛑 Stopping AssemblyAI transcription...');

    this.isProcessing = false;

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }

    // Flush remaining audio buffer
    if (this.audioBuffer.length > 0 && this.websocket?.readyState === WebSocket.OPEN) {
      const chunk = new Int16Array(this.audioBuffer);
      this.sendAudioChunk(chunk);
      this.audioBuffer = [];
    }

    // Close WebSocket
    if (this.websocket && this.isConnected) {
      try {
        // AssemblyAI v3 doesn't need terminate_session message
        // Just close the WebSocket gracefully
        setTimeout(() => {
          if (this.websocket) {
            this.websocket.close(1000, 'Normal closure');
            console.log('🔌 WebSocket closed');
          }
        }, 500);
      } catch (error) {
        console.error('❌ Error closing WebSocket:', error);
      }
    }

    // Clean up audio processing
    if (this.processor) {
      try {
        // Handle both AudioWorkletNode and ScriptProcessorNode
        if (this.processor.port) {
          // AudioWorklet cleanup
          this.processor.port.close();
          console.log('✅ AudioWorklet port closed');
        }
        
        this.processor.disconnect();
        this.processor = null;
        console.log('✅ Audio processor disconnected');
      } catch (error) {
        console.error('❌ Error disconnecting processor:', error);
      }
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      } catch (error) {
        console.error('❌ Error disconnecting source:', error);
      }
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
        this.audioContext = null;
        console.log('✅ Audio context closed');
      } catch (error) {
        console.error('❌ Error closing audio context:', error);
      }
    }

    this.isConnected = false;
    this.websocket = null;
    this.token = null;
    console.log('✅ AssemblyAI transcription stopped');
  }

  /**
   * Get conversation analytics
   */
  getConversationAnalytics() {
    console.log('📊 Generating conversation analytics...');
    console.log('   Messages:', this.messages.length);
    console.log('   Sentiments:', this.sentiments.length);

    const sentimentDistribution = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };

    this.sentiments.forEach(s => {
      if (s.suggested === 'positive') sentimentDistribution.positive++;
      else if (s.suggested === 'negative') sentimentDistribution.negative++;
      else sentimentDistribution.neutral++;
    });

    const avgSentiment = this.sentiments.length > 0
      ? this.sentiments.reduce((sum, s) => sum + s.polarity.score, 0) / this.sentiments.length
      : 0;

    const distressIndicators = this.sentiments.reduce((sum, s) => sum + (s.distressKeywords || 0), 0);

    const analytics = {
      conversationId: `assembly-${Date.now()}`,
      messages: this.messages,
      topics: this.extractTopics(),
      actionItems: [],
      questions: [],
      analytics: {
        messageCount: this.messages.length,
        avgConfidence: this.messages.reduce((sum, m) => sum + (m.confidence || 0), 0) / Math.max(1, this.messages.length),
      },
      sentiment: {
        averageSentiment: avgSentiment,
        sentimentDistribution,
        distressIndicators,
      },
      duration: 0,
    };

    console.log('✅ Analytics generated');

    return analytics;
  }

  /**
   * Extract topics from messages
   */
  extractTopics() {
    const wordFrequency = {};
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 
      'should', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it', 
      'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this',
      'that', 'these', 'those', 'there', 'here', 'where', 'when', 'why', 'how'
    ]);

    this.messages.forEach(msg => {
      const words = msg.text.toLowerCase().split(/\W+/);
      words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
          wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        }
      });
    });

    return Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({
        text: word,
        score: count / this.messages.length,
        type: 'topic',
        count: count
      }));
  }

  /**
   * Set callbacks
   */
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onSentiment(callback) {
    this.onSentimentCallback = callback;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      websocketState: this.websocket?.readyState,
      messagesReceived: this.messages.length,
      sentimentsAnalyzed: this.sentiments.length,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

export default AssemblyAIService;
