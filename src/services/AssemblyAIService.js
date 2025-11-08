// AssemblyAI Service Integration
// Real-time sentiment analysis and conversation intelligence
// Alternative to Symbl.ai

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
  }

  // Start real-time transcription with sentiment analysis
  async startRealtimeTranscription(stream) {
    return new Promise((resolve, reject) => {
      // AssemblyAI real-time endpoint
      const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${this.apiKey}`;
      
      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('✅ AssemblyAI WebSocket connected');
        this.isConnected = true;
        
        // Start sending audio
        this.startAudioProcessing(stream);
        resolve();
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('❌ AssemblyAI WebSocket error:', error);
        this.isConnected = false;
        reject(error);
      };

      this.websocket.onclose = () => {
        console.log('🔌 AssemblyAI WebSocket closed');
        this.isConnected = false;
      };
    });
  }

  // Process audio stream
  async startAudioProcessing(stream) {
    if (!stream) {
      console.error('No audio stream provided');
      return;
    }

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      const source = this.audioContext.createMediaStreamSource(stream);
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (e) => {
        if (this.isConnected && this.websocket.readyState === WebSocket.OPEN) {
          const audioData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array (PCM16)
          const pcm16 = new Int16Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32768));
          }

          // Send as base64
          const base64Audio = this.arrayBufferToBase64(pcm16.buffer);
          
          if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ audio_data: base64Audio }));
          }
        }
      };

      console.log('✅ Audio processing started');
    } catch (error) {
      console.error('❌ Error starting audio processing:', error);
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
      console.log('🎤 Session started');
    }
  }

  // Analyze sentiment using simple keyword-based approach
  // (AssemblyAI real-time doesn't include sentiment, so we do basic analysis)
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    // Positive keywords
    const positiveKeywords = ['good', 'great', 'happy', 'excellent', 'wonderful', 'love', 'amazing', 'fantastic', 'better', 'best'];
    // Negative keywords
    const negativeKeywords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'worst', 'pain', 'hurt', 'sad', 'angry', 'frustrated', 'worried'];
    // Distress keywords
    const distressKeywords = ['pain', 'hurt', 'alone', 'lonely', 'depressed', 'anxious', 'scared', 'worried', 'afraid'];

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

    // Calculate sentiment score
    const score = (positiveCount - negativeCount) / Math.max(1, positiveCount + negativeCount + 1);
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

    return sentiment;
  }

  // Stop real-time transcription
  stopRealtimeTranscription() {
    if (this.websocket && this.isConnected) {
      this.websocket.send(JSON.stringify({ terminate_session: true }));
      
      setTimeout(() => {
        if (this.websocket) {
          this.websocket.close();
        }
      }, 1000);
    }

    // Clean up audio processing
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isConnected = false;
  }

  // Upload and analyze audio file (for post-call analysis)
  async uploadAudio(audioBlob) {
    try {
      console.log('📤 Uploading audio for analysis...');

      // Upload audio
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'authorization': this.apiKey,
        },
        body: audioBlob,
      });

      const uploadData = await uploadResponse.json();
      const audioUrl = uploadData.upload_url;

      console.log('✅ Audio uploaded:', audioUrl);

      // Request transcription with sentiment analysis
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'authorization': this.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          sentiment_analysis: true,
          auto_highlights: true,
          entity_detection: true,
          iab_categories: true,
          speaker_labels: true,
        }),
      });

      const transcriptData = await transcriptResponse.json();
      this.transcriptId = transcriptData.id;

      console.log('✅ Transcription requested:', this.transcriptId);

      // Poll for completion
      return await this.pollTranscript(this.transcriptId);
    } catch (error) {
      console.error('❌ Error uploading audio:', error);
      throw error;
    }
  }

  // Poll for transcript completion
  async pollTranscript(transcriptId) {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: {
            'authorization': this.apiKey,
          },
        });

        const data = await response.json();

        if (data.status === 'completed') {
          console.log('✅ Transcription completed');
          return this.processTranscriptData(data);
        } else if (data.status === 'error') {
          throw new Error('Transcription failed: ' + data.error);
        }

        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      } catch (error) {
        console.error('❌ Error polling transcript:', error);
        throw error;
      }
    }

    throw new Error('Transcription timeout');
  }

  // Process transcript data into usable format
  processTranscriptData(data) {
    const messages = [];
    const topics = [];
    const sentimentData = [];

    // Process sentences with sentiment
    if (data.sentiment_analysis_results) {
      data.sentiment_analysis_results.forEach(result => {
        sentimentData.push({
          text: result.text,
          sentiment: result.sentiment,
          confidence: result.confidence,
          start: result.start,
          end: result.end,
        });

        messages.push({
          text: result.text,
          sentiment: {
            polarity: {
              score: result.sentiment === 'POSITIVE' ? 0.7 : 
                     result.sentiment === 'NEGATIVE' ? -0.7 : 0,
            },
            suggested: result.sentiment.toLowerCase(),
          },
        });
      });
    }

    // Process auto highlights as topics
    if (data.auto_highlights_result?.results) {
      data.auto_highlights_result.results.forEach(highlight => {
        topics.push({
          text: highlight.text,
          count: highlight.count,
          rank: highlight.rank,
          timestamps: highlight.timestamps,
        });
      });
    }

    // Calculate overall statistics
    const avgSentiment = this.calculateAverageSentiment(sentimentData);
    const distressIndicators = this.detectDistressIndicators(data.text || '');

    return {
      transcriptId: data.id,
      text: data.text,
      messages,
      topics,
      sentiment: {
        averageSentiment: avgSentiment,
        sentimentDistribution: this.calculateSentimentDistribution(sentimentData),
        distressIndicators,
      },
      duration: data.audio_duration || 0,
      entities: data.entities || [],
      categories: data.iab_categories_result?.summary || {},
    };
  }

  // Calculate average sentiment
  calculateAverageSentiment(sentimentData) {
    if (sentimentData.length === 0) return 0;

    const scores = sentimentData.map(s => 
      s.sentiment === 'POSITIVE' ? 0.7 : 
      s.sentiment === 'NEGATIVE' ? -0.7 : 0
    );

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Calculate sentiment distribution
  calculateSentimentDistribution(sentimentData) {
    const distribution = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };

    sentimentData.forEach(s => {
      if (s.sentiment === 'POSITIVE') distribution.positive++;
      else if (s.sentiment === 'NEGATIVE') distribution.negative++;
      else distribution.neutral++;
    });

    return distribution;
  }

  // Detect distress indicators
  detectDistressIndicators(text) {
    const lowerText = text.toLowerCase();
    const distressKeywords = ['pain', 'hurt', 'alone', 'lonely', 'depressed', 'anxious', 'scared', 'worried', 'afraid', 'sad', 'hopeless'];
    
    let count = 0;
    distressKeywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = lowerText.match(regex);
      if (matches) count += matches.length;
    });

    return count;
  }

  // Get conversation analytics
  getConversationAnalytics() {
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

    return {
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
      duration: 0, // Would need to track call duration separately
    };
  }

  // Extract topics from messages
  extractTopics() {
    // Simple word frequency analysis
    const wordFrequency = {};
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);

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
      }));
  }

  // Set callbacks
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onSentiment(callback) {
    this.onSentimentCallback = callback;
  }
}

export default AssemblyAIService;
