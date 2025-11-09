// Enhanced AssemblyAI Service Integration
// Real-time sentiment analysis and conversation intelligence
// With improved error handling and debugging

class AssemblyAIService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.transcriptId = null;
    this.websocket = null;
    this.isConnected = false;
    this.audioContext = null;
    this.processor = null;
    this.messages = [];
    this.sentiments = [];
    this.onMessageCallback = null;
    this.onSentimentCallback = null;
    this.connectionTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  // Validate API key
  validateApiKey() {
    if (!this.apiKey || this.apiKey === 'undefined' || this.apiKey === 'null') {
      console.error('❌ AssemblyAI API key is missing or invalid');
      return false;
    }
    console.log('✅ API key validated (length:', this.apiKey.length, ')');
    return true;
  }

  // Start real-time transcription with sentiment analysis
  async startRealtimeTranscription(stream) {
    return new Promise((resolve, reject) => {
      // Validate API key first
      if (!this.validateApiKey()) {
        reject(new Error('Invalid API key'));
        return;
      }

      // Check if already connected
      if (this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
        console.log('ℹ️ Already connected to AssemblyAI');
        resolve();
        return;
      }

      // AssemblyAI real-time endpoint
      // CRITICAL: Ensure API key is properly trimmed and encoded
      const cleanApiKey = this.apiKey.trim();
      const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${encodeURIComponent(cleanApiKey)}`;
      
      console.log('🔌 Attempting to connect to AssemblyAI WebSocket...');
      console.log('   URL:', wsUrl.substring(0, 50) + '...');
      console.log('   API Key (trimmed):', cleanApiKey.substring(0, 10) + '...' + cleanApiKey.substring(cleanApiKey.length - 5));
      console.log('   API Key length:', cleanApiKey.length);
      
      try {
        this.websocket = new WebSocket(wsUrl);
      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        reject(error);
        return;
      }

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.websocket?.readyState !== WebSocket.OPEN) {
          console.error('❌ WebSocket connection timeout (10s)');
          console.error('   ReadyState:', this.websocket?.readyState);
          this.websocket?.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.websocket.onopen = () => {
        clearTimeout(this.connectionTimeout);
        console.log('✅ AssemblyAI WebSocket connected');
        console.log('   ReadyState:', this.websocket.readyState);
        this.isConnected = true;
        this.reconnectAttempts = 0; // Reset reconnect counter
        
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
          console.error('   Raw data:', event.data?.substring(0, 100));
        }
      };

      this.websocket.onerror = (error) => {
        clearTimeout(this.connectionTimeout);
        console.error('❌ AssemblyAI WebSocket error:', error);
        console.error('   ReadyState:', this.websocket?.readyState);
        console.error('   URL:', this.websocket?.url);
        console.error('   API Key length:', this.apiKey?.length);
        
        // Log WebSocket state names for debugging
        const states = {
          0: 'CONNECTING',
          1: 'OPEN',
          2: 'CLOSING',
          3: 'CLOSED'
        };
        console.error('   State:', states[this.websocket?.readyState]);
        
        this.isConnected = false;
        reject(error);
      };

      this.websocket.onclose = (event) => {
        clearTimeout(this.connectionTimeout);
        console.log('🔌 AssemblyAI WebSocket closed');
        console.log('   Code:', event.code);
        console.log('   Reason:', event.reason || 'No reason provided');
        console.log('   Was clean:', event.wasClean);
        
        // Log common close codes
        const closeCodes = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error',
          1003: 'Unsupported data',
          1006: 'Abnormal closure',
          1007: 'Invalid frame payload',
          1008: 'Policy violation',
          1009: 'Message too big',
          1011: 'Server error',
          1015: 'TLS handshake failed'
        };
        console.log('   Meaning:', closeCodes[event.code] || 'Unknown');
        
        this.isConnected = false;
        
        // Attempt reconnect on unexpected closure
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Attempting reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          setTimeout(() => {
            if (stream) {
              this.startRealtimeTranscription(stream).catch(err => {
                console.error('❌ Reconnection failed:', err);
              });
            }
          }, 2000 * this.reconnectAttempts); // Exponential backoff
        }
      };
    });
  }

  // Process audio stream
  async startAudioProcessing(stream) {
    if (!stream) {
      console.error('❌ No audio stream provided');
      return;
    }

    try {
      // Check if stream has audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.error('❌ No audio tracks in stream');
        return;
      }

      console.log('🎤 Starting audio processing...');
      console.log('   Audio tracks:', audioTracks.length);
      console.log('   First track:', audioTracks[0].label);
      console.log('   Track enabled:', audioTracks[0].enabled);
      console.log('   Track ready state:', audioTracks[0].readyState);

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      const source = this.audioContext.createMediaStreamSource(stream);
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      let audioPacketsCount = 0;
      let lastLogTime = Date.now();

      this.processor.onaudioprocess = (e) => {
        if (this.isConnected && this.websocket?.readyState === WebSocket.OPEN) {
          const audioData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array (PCM16)
          const pcm16 = new Int16Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
          }

          // Send as base64
          const base64Audio = this.arrayBufferToBase64(pcm16.buffer);
          
          try {
            this.websocket.send(JSON.stringify({ audio_data: base64Audio }));
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

      console.log('✅ Audio processing started');
    } catch (error) {
      console.error('❌ Error starting audio processing:', error);
      throw error;
    }
  }

  // Convert ArrayBuffer to base64
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Handle incoming messages
  handleMessage(data) {
    if (data.message_type === 'PartialTranscript') {
      // Real-time partial results
      console.log('📝 Partial:', data.text);
    } else if (data.message_type === 'FinalTranscript') {
      // Final transcript with sentiment
      console.log('✅ Final:', data.text);
      console.log('   Confidence:', data.confidence);
      
      const message = {
        text: data.text,
        confidence: data.confidence,
        timestamp: Date.now(),
      };

      this.messages.push(message);

      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }

      // Analyze sentiment for this message
      this.analyzeSentiment(data.text);
    } else if (data.message_type === 'SessionBegins') {
      console.log('🎤 AssemblyAI session started');
      console.log('   Session ID:', data.session_id);
      console.log('   Expires:', data.expires_at);
    } else if (data.message_type === 'SessionTerminated') {
      console.log('🔚 AssemblyAI session terminated');
    } else {
      console.log('ℹ️ AssemblyAI message:', data.message_type);
    }
  }

  // Analyze sentiment using keyword-based approach
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    // Positive keywords
    const positiveKeywords = ['good', 'great', 'happy', 'excellent', 'wonderful', 'love', 'amazing', 'fantastic', 'better', 'best', 'excited', 'pleased', 'joy', 'delighted'];
    // Negative keywords
    const negativeKeywords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'pain', 'hurt', 'sad', 'angry', 'frustrated', 'worried', 'upset', 'disappointed'];
    // Distress keywords
    const distressKeywords = ['pain', 'hurt', 'alone', 'lonely', 'depressed', 'anxious', 'scared', 'worried', 'afraid', 'hopeless', 'helpless', 'suffering', 'suicide', 'die'];

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

    // Log sentiment if significant
    if (distressCount > 0 || Math.abs(score) > 0.5) {
      console.log('😊 Sentiment analysis:', {
        polarity: polarity.toUpperCase(),
        score: score.toFixed(2),
        distress: distressCount > 0,
        text: text.substring(0, 50) + '...'
      });
    }

    return sentiment;
  }

  // Stop real-time transcription
  stopRealtimeTranscription() {
    console.log('🛑 Stopping AssemblyAI transcription...');

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }

    if (this.websocket && this.isConnected) {
      try {
        // Send termination message
        if (this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ terminate_session: true }));
          console.log('📤 Sent termination message');
        }
        
        // Wait a moment for graceful closure
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
        this.processor.disconnect();
        this.processor = null;
        console.log('✅ Audio processor disconnected');
      } catch (error) {
        console.error('❌ Error disconnecting processor:', error);
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
    console.log('✅ AssemblyAI transcription stopped');
  }

  // Get conversation analytics
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
      duration: 0, // Will be set by caller
    };

    console.log('✅ Analytics generated:', {
      messages: analytics.messages.length,
      avgSentiment: avgSentiment.toFixed(2),
      distressIndicators
    });

    return analytics;
  }

  // Extract topics from messages
  extractTopics() {
    // Simple word frequency analysis
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

    // Get top topics
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

  // Set callbacks
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onSentiment(callback) {
    this.onSentimentCallback = callback;
  }

  // Get connection status
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
