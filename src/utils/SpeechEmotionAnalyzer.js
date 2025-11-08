// Speech Emotion Analyzer
// Analyzes speech patterns, tone, and sentiment to detect emotions
// Supports both real detection and demo mode

class SpeechEmotionAnalyzer {
  constructor() {
    this.isSupported = this.checkSupport();
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.isListening = false;
    this.currentEmotion = 'neutral';
    this.confidence = 0;
    this.emotionHistory = [];
    
    // Sentiment keywords for each emotion
    this.emotionKeywords = {
      happy: ['good', 'great', 'wonderful', 'excellent', 'amazing', 'fantastic', 'love', 'happy', 'joy', 'excited', 'glad', 'pleased', 'delighted', 'cheerful', 'fun', 'nice', 'beautiful', 'awesome', 'perfect', 'yes'],
      sad: ['sad', 'unhappy', 'depressed', 'down', 'low', 'miserable', 'upset', 'disappointed', 'hurt', 'pain', 'crying', 'tears', 'lonely', 'alone', 'empty', 'hopeless', 'sorry', 'miss', 'lost', 'grief'],
      angry: ['angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'irritated', 'frustrated', 'upset', 'pissed', 'damn', 'hell', 'stupid', 'idiot', 'terrible', 'awful', 'worst', 'fed up', 'sick of', 'enough'],
      anxious: ['worried', 'anxious', 'nervous', 'scared', 'afraid', 'fear', 'stress', 'anxious', 'panic', 'overwhelmed', 'tense', 'uneasy', 'concerned', 'troubled', 'distressed', 'restless', 'uncertain', 'doubt', 'what if', 'scared'],
      lonely: ['lonely', 'alone', 'isolated', 'nobody', 'empty', 'abandoned', 'forgotten', 'ignored', 'excluded', 'solitary', 'disconnected', 'distant', 'apart', 'separate', 'miss', 'longing', 'yearning'],
      neutral: ['okay', 'fine', 'alright', 'normal', 'usual', 'regular', 'same', 'nothing', 'whatever', 'sure', 'maybe', 'guess', 'think', 'suppose']
    };
  }

  checkSupport() {
    const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    const hasAudioContext = 'AudioContext' in window || 'webkitAudioContext' in window;
    
    return {
      speechRecognition: hasSpeechRecognition,
      audioAnalysis: hasAudioContext,
      fullSupport: hasSpeechRecognition && hasAudioContext
    };
  }

  async initialize(stream) {
    if (!this.isSupported.fullSupport) {
      console.warn('⚠️ Full speech emotion detection not supported, will use demo mode');
      return false;
    }

    try {
      // Initialize Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      // Initialize Audio Context for voice analysis
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      console.log('✅ Speech emotion analyzer initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize speech analyzer:', error);
      return false;
    }
  }

  startListening(onEmotionDetected) {
    if (!this.recognition) {
      console.warn('⚠️ Speech recognition not initialized, using demo mode');
      return;
    }

    this.isListening = true;

    this.recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      
      if (lastResult.isFinal) {
        const transcript = lastResult[0].transcript.toLowerCase();
        console.log('🎤 Detected speech:', transcript);
        
        // Analyze the speech
        const emotion = this.analyzeText(transcript);
        const voiceMetrics = this.analyzeVoice();
        
        // Combine text and voice analysis
        const finalEmotion = this.combineAnalysis(emotion, voiceMetrics);
        
        this.currentEmotion = finalEmotion.emotion;
        this.confidence = finalEmotion.confidence;
        
        // Add to history
        this.emotionHistory.push({
          emotion: this.currentEmotion,
          confidence: this.confidence,
          timestamp: Date.now(),
          transcript: transcript
        });

        // Keep only last 50 entries
        if (this.emotionHistory.length > 50) {
          this.emotionHistory.shift();
        }

        // Callback with detected emotion
        if (onEmotionDetected) {
          onEmotionDetected({
            emotion: this.currentEmotion,
            confidence: this.confidence,
            transcript: transcript,
            voiceMetrics: voiceMetrics
          });
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };

    this.recognition.start();
    console.log('🎤 Started listening for speech emotions');
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
      this.isListening = false;
      console.log('🛑 Stopped listening for speech emotions');
    }
  }

  // Analyze text for emotional content
  analyzeText(text) {
    const words = text.toLowerCase().split(/\s+/);
    const scores = {
      happy: 0,
      sad: 0,
      angry: 0,
      anxious: 0,
      lonely: 0,
      neutral: 0
    };

    // Count keyword matches
    words.forEach(word => {
      Object.keys(this.emotionKeywords).forEach(emotion => {
        if (this.emotionKeywords[emotion].includes(word)) {
          scores[emotion] += 1;
        }
      });
    });

    // Find dominant emotion
    let maxScore = 0;
    let dominantEmotion = 'neutral';
    
    Object.keys(scores).forEach(emotion => {
      if (scores[emotion] > maxScore) {
        maxScore = scores[emotion];
        dominantEmotion = emotion;
      }
    });

    // Calculate confidence based on keyword density
    const confidence = Math.min(0.95, 0.5 + (maxScore / words.length) * 2);

    return {
      emotion: dominantEmotion,
      confidence: confidence,
      scores: scores
    };
  }

  // Analyze voice characteristics (pitch, volume, speed)
  analyzeVoice() {
    if (!this.analyser) {
      return {
        volume: 0.5,
        pitch: 0.5,
        energy: 0.5
      };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / bufferLength;
    const volume = average / 255;

    // Calculate pitch (dominant frequency)
    let maxValue = 0;
    let maxIndex = 0;
    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] > maxValue) {
        maxValue = dataArray[i];
        maxIndex = i;
      }
    }
    const pitch = maxIndex / bufferLength;

    // Calculate energy (variation in signal)
    const variance = dataArray.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / bufferLength;
    const energy = Math.sqrt(variance) / 255;

    return {
      volume: volume,
      pitch: pitch,
      energy: energy
    };
  }

  // Combine text and voice analysis
  combineAnalysis(textAnalysis, voiceMetrics) {
    let emotion = textAnalysis.emotion;
    let confidence = textAnalysis.confidence;

    // Adjust based on voice characteristics
    if (voiceMetrics.volume > 0.7 && voiceMetrics.energy > 0.6) {
      // High volume and energy suggests anger or excitement
      if (textAnalysis.scores.angry > 0) {
        emotion = 'angry';
        confidence = Math.min(0.95, confidence + 0.2);
      } else if (textAnalysis.scores.happy > 0) {
        emotion = 'happy';
        confidence = Math.min(0.95, confidence + 0.15);
      }
    } else if (voiceMetrics.volume < 0.3 && voiceMetrics.energy < 0.4) {
      // Low volume and energy suggests sadness or fatigue
      if (textAnalysis.scores.sad > 0 || textAnalysis.scores.lonely > 0) {
        emotion = emotion === 'neutral' ? 'sad' : emotion;
        confidence = Math.min(0.95, confidence + 0.15);
      }
    }

    // High pitch variation suggests anxiety
    if (voiceMetrics.pitch > 0.7 && voiceMetrics.energy > 0.5) {
      if (textAnalysis.scores.anxious > 0) {
        emotion = 'anxious';
        confidence = Math.min(0.95, confidence + 0.15);
      }
    }

    return {
      emotion: emotion,
      confidence: confidence
    };
  }

  // Demo mode - generates realistic emotion patterns
  generateDemoEmotion() {
    // Weighted random emotion selection
    const emotions = ['happy', 'neutral', 'sad', 'anxious', 'lonely', 'angry'];
    const weights = [0.25, 0.30, 0.15, 0.15, 0.10, 0.05];
    
    let random = Math.random();
    let cumulative = 0;
    let selectedEmotion = 'neutral';

    for (let i = 0; i < emotions.length; i++) {
      cumulative += weights[i];
      if (random <= cumulative) {
        selectedEmotion = emotions[i];
        break;
      }
    }

    // Generate realistic confidence (higher for neutral, varies for others)
    const baseConfidence = selectedEmotion === 'neutral' ? 0.7 : 0.6;
    const confidence = baseConfidence + (Math.random() * 0.3);

    // Generate sample phrases for demo
    const samplePhrases = {
      happy: ['Feeling good today', 'Things are going well', 'I am happy about this'],
      sad: ['Not feeling great', 'Things are tough', 'Feeling down today'],
      angry: ['This is frustrating', 'I am upset about this', 'This makes me mad'],
      anxious: ['Feeling worried', 'A bit nervous about this', 'Feeling stressed'],
      lonely: ['Feeling alone', 'Missing connection', 'Feel isolated'],
      neutral: ['Just okay', 'Nothing special', 'Regular day']
    };

    const phrases = samplePhrases[selectedEmotion];
    const transcript = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      emotion: selectedEmotion,
      confidence: Math.min(0.95, confidence),
      transcript: transcript,
      voiceMetrics: {
        volume: 0.4 + Math.random() * 0.3,
        pitch: 0.3 + Math.random() * 0.4,
        energy: 0.3 + Math.random() * 0.4
      },
      isDemo: true
    };
  }

  getEmotionStatistics() {
    if (this.emotionHistory.length === 0) {
      return {
        totalReadings: 0,
        emotionCounts: {},
        emotionPercentages: {},
        dominantEmotion: 'neutral',
        averageConfidence: 0
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

    // Find dominant emotion
    let dominantEmotion = 'neutral';
    let maxCount = 0;
    Object.keys(counts).forEach(emotion => {
      if (counts[emotion] > maxCount) {
        maxCount = counts[emotion];
        dominantEmotion = emotion;
      }
    });

    return {
      totalReadings: total,
      emotionCounts: counts,
      emotionPercentages: percentages,
      dominantEmotion: dominantEmotion,
      averageConfidence: totalConfidence / total
    };
  }

  cleanup() {
    this.stopListening();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export default SpeechEmotionAnalyzer;
