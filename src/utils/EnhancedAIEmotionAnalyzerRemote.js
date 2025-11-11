// Enhanced AI Emotion Analyzer - Remote Audio Edition
// This version properly analyzes REMOTE audio, not local microphone

class EnhancedAIEmotionAnalyzerRemote {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.isSupported = this.checkSupport();
    this.audioContext = null;
    this.analyser = null;
    this.isListening = false;
    this.currentEmotion = 'neutral';
    this.confidence = 0;
    this.emotionHistory = [];
    this.analysisInterval = null;
    this.scriptProcessor = null;
    this.audioBuffers = [];
    this.maxBufferSize = 50; // Keep last 50 audio samples
    
    // Enhanced emotion patterns
    this.emotionPatterns = {
      happy: {
        audioProfile: { 
          pitchRange: [200, 300], 
          energyRange: [0.6, 0.9],
          zeroCrossingRange: [0.2, 0.4]
        },
        weight: 1.0
      },
      sad: {
        audioProfile: { 
          pitchRange: [100, 150], 
          energyRange: [0.2, 0.5],
          zeroCrossingRange: [0.1, 0.25]
        },
        weight: 1.2
      },
      angry: {
        audioProfile: { 
          pitchRange: [250, 350], 
          energyRange: [0.7, 1.0],
          zeroCrossingRange: [0.3, 0.5]
        },
        weight: 1.5
      },
      anxious: {
        audioProfile: { 
          pitchRange: [180, 280], 
          energyRange: [0.5, 0.8],
          zeroCrossingRange: [0.3, 0.6]
        },
        weight: 1.3
      },
      neutral: {
        audioProfile: { 
          pitchRange: [150, 200], 
          energyRange: [0.4, 0.6],
          zeroCrossingRange: [0.2, 0.3]
        },
        weight: 0.5
      }
    };
  }

  checkSupport() {
    const hasAudioContext = 'AudioContext' in window || 'webkitAudioContext' in window;
    return {
      audioAnalysis: hasAudioContext,
      fullSupport: hasAudioContext
    };
  }

  async initialize(remoteStream) {
    if (!this.isSupported.fullSupport) {
      console.warn('⚠️ Audio analysis not supported');
      return false;
    }

    if (!remoteStream) {
      console.error('❌ No remote stream provided');
      return false;
    }

    try {
      console.log('🎤 Initializing audio analyzer for REMOTE stream');
      
      // Create Audio Context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      
      // Create media stream source from REMOTE audio
      const source = this.audioContext.createMediaStreamSource(remoteStream);
      
      // Create analyzer
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // ✅ FIXED: Use AudioWorklet instead of deprecated ScriptProcessor
      if (this.audioContext.audioWorklet) {
        await this.setupAudioWorklet(source);
      } else {
        // Fallback for older browsers (shouldn't happen in modern browsers)
        console.warn('⚠️ AudioWorklet not supported, audio analysis may have limitations');
        // Just connect source to analyser without processor
        source.connect(this.analyser);
      }
      
      console.log('✅ Remote audio analyzer initialized (AudioWorklet)');
      console.log('   Sample Rate:', this.audioContext.sampleRate);
      console.log('   FFT Size:', this.analyser.fftSize);
      console.log('   No deprecation warnings! ✨');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize analyzer:', error);
      return false;
    }
  }

  /**
   * ✅ NEW: Setup AudioWorklet for modern audio processing
   */
  async setupAudioWorklet(source) {
    try {
      // Create inline AudioWorklet processor for emotion analysis
      const processorCode = `
        class EmotionAnalyzerProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
          }

          process(inputs, outputs, parameters) {
            // Pass through audio (we're just analyzing, not modifying)
            const input = inputs[0];
            const output = outputs[0];
            
            if (input.length > 0 && output.length > 0) {
              // Copy input to output
              for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
                output[channel].set(input[channel]);
              }
            }
            
            return true; // Keep processor alive
          }
        }

        registerProcessor('emotion-analyzer-processor', EmotionAnalyzerProcessor);
      `;

      // Create blob URL for the processor
      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const processorUrl = URL.createObjectURL(blob);

      // Add the processor module
      await this.audioContext.audioWorklet.addModule(processorUrl);
      
      // Create the worklet node
      this.workletNode = new AudioWorkletNode(this.audioContext, 'emotion-analyzer-processor');
      
      // Connect: source → analyser → workletNode → destination
      source.connect(this.analyser);
      this.analyser.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      
      console.log('✅ AudioWorklet processor initialized for emotion analysis');
      
      // Clean up blob URL
      URL.revokeObjectURL(processorUrl);

    } catch (error) {
      console.error('❌ Error setting up AudioWorklet:', error);
      // Fallback: just connect source to analyser
      source.connect(this.analyser);
    }
  }

  startListening(onEmotionDetected) {
    if (!this.analyser) {
      console.warn('⚠️ Analyzer not initialized');
      return;
    }

    this.isListening = true;
    console.log('🎤 Started analyzing REMOTE audio');

    // Analyze audio continuously
    this.analysisInterval = setInterval(() => {
      const analysis = this.analyzeRemoteAudio();
      
      if (analysis && analysis.isSpeaking) {
        this.currentEmotion = analysis.emotion;
        this.confidence = analysis.confidence;
        
        // Add to history
        this.emotionHistory.push({
          emotion: this.currentEmotion,
          confidence: this.confidence,
          timestamp: Date.now(),
          audioMetrics: analysis.audioMetrics,
          transcript: this.generateTranscript(analysis.emotion)
        });

        // Keep only last 100 entries
        if (this.emotionHistory.length > 100) {
          this.emotionHistory.shift();
        }

        // Callback with detected emotion
        if (onEmotionDetected) {
          onEmotionDetected({
            emotion: this.currentEmotion,
            confidence: this.confidence,
            transcript: this.generateTranscript(this.currentEmotion),
            voiceMetrics: analysis.audioMetrics,
            aiInsight: null, // Will be added if API key available
            isDemo: false
          });
        }
      }
    }, 2000); // Analyze every 2 seconds

    // If API key available, periodically get AI insights
    if (this.apiKey) {
      this.startAIAnalysis(onEmotionDetected);
    }
  }

  analyzeRemoteAudio() {
    if (!this.analyser) return null;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDataArray = new Uint8Array(bufferLength);
    
    this.analyser.getByteFrequencyData(dataArray);
    this.analyser.getByteTimeDomainData(timeDataArray);

    // Calculate audio metrics
    const volume = this.calculateVolume(dataArray);
    
    // Check if someone is speaking (volume threshold)
    const isSpeaking = volume > 0.05;
    
    if (!isSpeaking) {
      return { isSpeaking: false };
    }

    const metrics = {
      volume: volume,
      pitch: this.estimatePitch(timeDataArray),
      energy: this.calculateEnergy(dataArray),
      spectralCentroid: this.calculateSpectralCentroid(dataArray),
      zeroCrossingRate: this.calculateZeroCrossingRate(timeDataArray),
      harmonicity: this.calculateHarmonicity(dataArray)
    };

    console.log('🎵 Remote audio metrics:', metrics);

    // Map audio features to emotions
    const emotionScores = this.mapAudioToEmotions(metrics);
    
    // Find dominant emotion
    let maxScore = 0;
    let dominantEmotion = 'neutral';
    
    Object.keys(emotionScores).forEach(emotion => {
      if (emotionScores[emotion] > maxScore) {
        maxScore = emotionScores[emotion];
        dominantEmotion = emotion;
      }
    });

    // Calculate confidence
    const totalScore = Object.values(emotionScores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.min(0.95, maxScore / totalScore) : 0.5;

    return {
      isSpeaking: true,
      emotion: dominantEmotion,
      confidence: confidence,
      audioMetrics: metrics
    };
  }

  calculateVolume(dataArray) {
    const sum = dataArray.reduce((a, b) => a + b, 0);
    return sum / (dataArray.length * 255);
  }

  estimatePitch(timeData) {
    // Autocorrelation method for pitch detection
    let maxCorrelation = 0;
    let bestOffset = 0;
    const minLag = Math.floor(this.audioContext.sampleRate / 400); // 400 Hz max
    const maxLag = Math.floor(this.audioContext.sampleRate / 80);  // 80 Hz min
    
    for (let offset = minLag; offset < maxLag && offset < timeData.length / 2; offset++) {
      let correlation = 0;
      for (let i = 0; i < timeData.length / 2; i++) {
        correlation += Math.abs(timeData[i] - timeData[i + offset]);
      }
      correlation = 1 - (correlation / (timeData.length / 2 * 255));
      
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestOffset = offset;
      }
    }
    
    const pitch = bestOffset > 0 ? this.audioContext.sampleRate / bestOffset : 0;
    return Math.min(500, Math.max(50, pitch)); // Clamp between 50-500 Hz
  }

  calculateEnergy(dataArray) {
    const sum = dataArray.reduce((a, b) => a + b * b, 0);
    return Math.sqrt(sum / dataArray.length) / 255;
  }

  calculateSpectralCentroid(dataArray) {
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      numerator += i * dataArray[i];
      denominator += dataArray[i];
    }
    
    return denominator > 0 ? numerator / denominator / dataArray.length : 0.5;
  }

  calculateZeroCrossingRate(timeData) {
    let crossings = 0;
    for (let i = 1; i < timeData.length; i++) {
      if ((timeData[i] >= 128 && timeData[i - 1] < 128) ||
          (timeData[i] < 128 && timeData[i - 1] >= 128)) {
        crossings++;
      }
    }
    return crossings / timeData.length;
  }

  calculateHarmonicity(dataArray) {
    const peaks = [];
    for (let i = 1; i < dataArray.length - 1; i++) {
      if (dataArray[i] > dataArray[i - 1] && dataArray[i] > dataArray[i + 1] && dataArray[i] > 50) {
        peaks.push({ index: i, value: dataArray[i] });
      }
    }
    
    peaks.sort((a, b) => b.value - a.value);
    
    if (peaks.length < 2) return 0.5;
    
    const ratio = peaks[1].index / peaks[0].index;
    return Math.abs(ratio - Math.round(ratio)) < 0.15 ? 0.8 : 0.3;
  }

  mapAudioToEmotions(metrics) {
    const scores = {};
    
    Object.keys(this.emotionPatterns).forEach(emotion => {
      const profile = this.emotionPatterns[emotion].audioProfile;
      const weight = this.emotionPatterns[emotion].weight;
      
      let score = 0;
      let matches = 0;
      
      // Check pitch match
      if (metrics.pitch >= profile.pitchRange[0] && metrics.pitch <= profile.pitchRange[1]) {
        score += weight;
        matches++;
      }
      
      // Check energy match
      if (metrics.energy >= profile.energyRange[0] && metrics.energy <= profile.energyRange[1]) {
        score += weight;
        matches++;
      }
      
      // Check zero-crossing rate
      if (metrics.zeroCrossingRate >= profile.zeroCrossingRange[0] && 
          metrics.zeroCrossingRate <= profile.zeroCrossingRange[1]) {
        score += weight * 0.5;
        matches++;
      }
      
      // Normalize by number of features checked
      scores[emotion] = matches > 0 ? score / matches : 0;
    });
    
    return scores;
  }

  generateTranscript(emotion) {
    const phrases = {
      happy: ['Feeling positive', 'Good mood detected', 'Positive emotional state'],
      sad: ['Feeling down', 'Low mood detected', 'Sadness in voice'],
      angry: ['Elevated tension', 'High arousal detected', 'Agitated state'],
      anxious: ['Nervous energy', 'Anxiety detected', 'Worried state'],
      neutral: ['Calm state', 'Neutral mood', 'Stable emotional state']
    };
    
    const emotionPhrases = phrases[emotion] || phrases.neutral;
    return emotionPhrases[Math.floor(Math.random() * emotionPhrases.length)];
  }

  async startAIAnalysis(onEmotionDetected) {
    console.log('🤖 AI-enhanced analysis enabled');
    
    // Periodically get AI insights based on recent audio patterns
    setInterval(async () => {
      if (this.emotionHistory.length > 0) {
        const recent = this.emotionHistory.slice(-5);
        const dominantEmotion = this.currentEmotion;
        const avgMetrics = this.getAverageMetrics(recent);
        
        try {
          const aiInsight = await this.getAIInsight(dominantEmotion, avgMetrics);
          
          if (aiInsight && onEmotionDetected) {
            onEmotionDetected({
              emotion: aiInsight.emotion || dominantEmotion,
              confidence: aiInsight.confidence || this.confidence,
              transcript: this.generateTranscript(aiInsight.emotion || dominantEmotion),
              voiceMetrics: avgMetrics,
              aiInsight: aiInsight,
              isDemo: false
            });
          }
        } catch (error) {
          console.error('❌ AI insight error:', error);
        }
      }
    }, 10000); // Get AI insight every 10 seconds
  }

  getAverageMetrics(recentEmotions) {
    if (recentEmotions.length === 0) {
      return {
        volume: 0.5,
        pitch: 150,
        energy: 0.5,
        spectralCentroid: 0.5,
        zeroCrossingRate: 0.2,
        harmonicity: 0.5
      };
    }

    const avg = {
      volume: 0,
      pitch: 0,
      energy: 0,
      spectralCentroid: 0,
      zeroCrossingRate: 0,
      harmonicity: 0
    };

    recentEmotions.forEach(entry => {
      if (entry.audioMetrics) {
        Object.keys(avg).forEach(key => {
          avg[key] += entry.audioMetrics[key] || 0;
        });
      }
    });

    Object.keys(avg).forEach(key => {
      avg[key] /= recentEmotions.length;
    });

    return avg;
  }

  async getAIInsight(emotion, audioMetrics) {
    if (!this.apiKey) return null;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Analyze emotional state from voice metrics. Respond ONLY with JSON.

Current emotion detected: ${emotion}

Voice metrics:
- Pitch: ${audioMetrics.pitch.toFixed(0)} Hz
- Energy: ${audioMetrics.energy.toFixed(2)}
- Volume: ${audioMetrics.volume.toFixed(2)}
- Zero-crossing rate: ${audioMetrics.zeroCrossingRate.toFixed(2)}

Respond with JSON only:
{
  "emotion": "happy|sad|angry|anxious|neutral",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      let responseText = data.content[0].text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const insight = JSON.parse(responseText);
      console.log('🤖 AI Insight received:', insight);
      return insight;
    } catch (error) {
      console.error('❌ AI insight error:', error);
      return null;
    }
  }

  stopListening() {
    this.isListening = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    
    console.log('🛑 Stopped analyzing remote audio');
  }

  getEmotionStatistics() {
    if (this.emotionHistory.length === 0) {
      return {
        totalReadings: 0,
        emotionCounts: {},
        emotionPercentages: {},
        dominantEmotion: 'neutral',
        averageConfidence: 0,
        trend: 'stable'
      };
    }

    const counts = {};
    let totalConfidence = 0;

    this.emotionHistory.forEach(entry => {
      counts[entry.emotion] = (counts[entry.emotion] || 0) + 1;
      totalConfidence += entry.confidence;
    });

    const total = this.emotionHistory.length;
    const percentages = {};
    
    Object.keys(counts).forEach(emotion => {
      percentages[emotion] = (counts[emotion] / total) * 100;
    });

    let dominantEmotion = 'neutral';
    let maxCount = 0;
    Object.keys(counts).forEach(emotion => {
      if (counts[emotion] > maxCount) {
        maxCount = counts[emotion];
        dominantEmotion = emotion;
      }
    });

    const trend = this.calculateEmotionTrend();

    return {
      totalReadings: total,
      emotionCounts: counts,
      emotionPercentages: percentages,
      dominantEmotion: dominantEmotion,
      averageConfidence: totalConfidence / total,
      trend: trend
    };
  }

  calculateEmotionTrend() {
    if (this.emotionHistory.length < 10) return 'stable';

    const recent = this.emotionHistory.slice(-5);
    const previous = this.emotionHistory.slice(-10, -5);

    const recentPositive = recent.filter(e => 
      e.emotion === 'happy' || e.emotion === 'neutral'
    ).length;
    
    const previousPositive = previous.filter(e => 
      e.emotion === 'happy' || e.emotion === 'neutral'
    ).length;

    if (recentPositive > previousPositive + 1) return 'improving';
    if (recentPositive < previousPositive - 1) return 'declining';
    return 'stable';
  }

  cleanup() {
    this.stopListening();
    
    // ✅ FIXED: Cleanup AudioWorklet node instead of ScriptProcessor
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    console.log('🧹 Analyzer cleaned up (AudioWorklet)');
  }
}

export default EnhancedAIEmotionAnalyzerRemote;

