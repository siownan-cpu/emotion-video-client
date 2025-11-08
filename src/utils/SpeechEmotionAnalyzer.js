// Enhanced AI-Powered Speech & Emotion Analyzer
// Integrates GenAI APIs for better accuracy in emotion detection

class EnhancedAIEmotionAnalyzer {
  constructor(apiKey = null) {
    this.apiKey = apiKey; // Optional: Claude API key for advanced analysis
    this.isSupported = this.checkSupport();
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.isListening = false;
    this.currentEmotion = 'neutral';
    this.confidence = 0;
    this.emotionHistory = [];
    this.audioBuffer = [];
    this.analysisQueue = [];
    
    // Enhanced emotion keywords with weights
    this.emotionPatterns = {
      happy: {
        keywords: ['good', 'great', 'wonderful', 'excellent', 'amazing', 'fantastic', 'love', 'happy', 'joy', 'excited', 'glad', 'pleased', 'delighted', 'cheerful', 'fun', 'nice', 'beautiful', 'awesome', 'perfect', 'yes', 'brilliant', 'terrific', 'super', 'lovely'],
        weight: 1.0,
        toneIndicators: { pitch: 'high', energy: 'high', speed: 'normal' }
      },
      sad: {
        keywords: ['sad', 'unhappy', 'depressed', 'down', 'low', 'miserable', 'upset', 'disappointed', 'hurt', 'pain', 'crying', 'tears', 'lonely', 'alone', 'empty', 'hopeless', 'sorry', 'miss', 'lost', 'grief', 'terrible', 'awful', 'bad', 'worse'],
        weight: 1.2,
        toneIndicators: { pitch: 'low', energy: 'low', speed: 'slow' }
      },
      angry: {
        keywords: ['angry', 'mad', 'furious', 'rage', 'hate', 'annoyed', 'irritated', 'frustrated', 'upset', 'pissed', 'damn', 'hell', 'stupid', 'idiot', 'terrible', 'awful', 'worst', 'fed up', 'sick of', 'enough', 'outraged', 'livid'],
        weight: 1.5,
        toneIndicators: { pitch: 'high', energy: 'very-high', speed: 'fast' }
      },
      anxious: {
        keywords: ['worried', 'anxious', 'nervous', 'scared', 'afraid', 'fear', 'stress', 'panic', 'overwhelmed', 'tense', 'uneasy', 'concerned', 'troubled', 'distressed', 'restless', 'uncertain', 'doubt', 'what if', 'scared', 'terrified'],
        weight: 1.3,
        toneIndicators: { pitch: 'varying', energy: 'high', speed: 'fast' }
      },
      lonely: {
        keywords: ['lonely', 'alone', 'isolated', 'nobody', 'empty', 'abandoned', 'forgotten', 'ignored', 'excluded', 'solitary', 'disconnected', 'distant', 'apart', 'separate', 'miss', 'longing', 'yearning', 'isolated'],
        weight: 1.1,
        toneIndicators: { pitch: 'low', energy: 'low', speed: 'slow' }
      },
      neutral: {
        keywords: ['okay', 'fine', 'alright', 'normal', 'usual', 'regular', 'same', 'nothing', 'whatever', 'sure', 'maybe', 'guess', 'think', 'suppose'],
        weight: 0.5,
        toneIndicators: { pitch: 'mid', energy: 'mid', speed: 'normal' }
      }
    };

    // Sentiment context patterns
    this.contextPatterns = {
      negation: ['not', 'no', 'never', "don't", "can't", "won't", "isn't", "aren't"],
      intensifiers: ['very', 'really', 'extremely', 'so', 'absolutely', 'completely', 'totally'],
      diminishers: ['somewhat', 'slightly', 'a bit', 'kind of', 'sort of']
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
      console.warn('⚠️ Full speech emotion detection not supported');
      return false;
    }

    try {
      // Initialize Speech Recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 3; // Get multiple alternatives for better accuracy

      // Initialize Audio Context for voice analysis
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096; // Higher resolution for better analysis
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      console.log('✅ Enhanced AI emotion analyzer initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize AI analyzer:', error);
      return false;
    }
  }

  startListening(onEmotionDetected) {
    if (!this.recognition) {
      console.warn('⚠️ Speech recognition not initialized');
      return;
    }

    this.isListening = true;
    let interimTranscript = '';

    this.recognition.onresult = async (event) => {
      interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          console.log('🎤 Final transcript:', transcript);
          
          // Perform comprehensive analysis
          const analysis = await this.comprehensiveAnalysis(transcript);
          
          this.currentEmotion = analysis.emotion;
          this.confidence = analysis.confidence;
          
          // Add to history
          this.emotionHistory.push({
            emotion: this.currentEmotion,
            confidence: this.confidence,
            timestamp: Date.now(),
            transcript: transcript,
            audioMetrics: analysis.audioMetrics,
            aiInsight: analysis.aiInsight
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
              transcript: transcript,
              voiceMetrics: analysis.audioMetrics,
              aiInsight: analysis.aiInsight
            });
          }
        } else {
          interimTranscript += transcript;
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        console.log('No speech detected, continuing...');
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        console.log('🔄 Restarting speech recognition');
        try {
          this.recognition.start();
        } catch (error) {
          console.error('Error restarting recognition:', error);
        }
      }
    };

    this.recognition.start();
    console.log('🎤 Enhanced AI listening started');
  }

  stopListening() {
    if (this.recognition) {
      this.isListening = false;
      this.recognition.stop();
      console.log('🛑 Stopped listening');
    }
  }

  // Comprehensive analysis combining multiple techniques
  async comprehensiveAnalysis(text) {
    const textAnalysis = this.enhancedTextAnalysis(text);
    const audioMetrics = this.advancedAudioAnalysis();
    const contextualAnalysis = this.contextualEmotionAnalysis(text);
    
    // Combine analyses with weighted scoring
    let combinedScores = {};
    const emotions = Object.keys(this.emotionPatterns);
    
    emotions.forEach(emotion => {
      combinedScores[emotion] = 
        (textAnalysis.scores[emotion] || 0) * 0.4 +
        (contextualAnalysis.scores[emotion] || 0) * 0.3 +
        (audioMetrics.emotionScores[emotion] || 0) * 0.3;
    });

    // Find dominant emotion
    let maxScore = 0;
    let dominantEmotion = 'neutral';
    
    Object.keys(combinedScores).forEach(emotion => {
      if (combinedScores[emotion] > maxScore) {
        maxScore = combinedScores[emotion];
        dominantEmotion = emotion;
      }
    });

    // Calculate confidence
    const totalScore = Object.values(combinedScores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? Math.min(0.95, maxScore / totalScore) : 0.5;

    // Get AI insight if available
    let aiInsight = null;
    if (this.apiKey) {
      aiInsight = await this.getAIInsight(text, audioMetrics);
    }

    return {
      emotion: dominantEmotion,
      confidence: confidence,
      scores: combinedScores,
      audioMetrics: audioMetrics,
      aiInsight: aiInsight
    };
  }

  // Enhanced text analysis with context
  enhancedTextAnalysis(text) {
    const words = text.toLowerCase().split(/\s+/);
    const scores = {};
    let hasNegation = false;
    let intensityMultiplier = 1.0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Check for negation
      if (this.contextPatterns.negation.includes(word)) {
        hasNegation = true;
        continue;
      }

      // Check for intensifiers
      if (this.contextPatterns.intensifiers.includes(word)) {
        intensityMultiplier = 1.5;
        continue;
      }

      // Check for diminishers
      if (this.contextPatterns.diminishers.includes(word)) {
        intensityMultiplier = 0.7;
        continue;
      }

      // Score emotions
      Object.keys(this.emotionPatterns).forEach(emotion => {
        if (!scores[emotion]) scores[emotion] = 0;
        
        if (this.emotionPatterns[emotion].keywords.includes(word)) {
          let score = this.emotionPatterns[emotion].weight * intensityMultiplier;
          
          // Apply negation
          if (hasNegation) {
            score = -score * 0.5;
          }
          
          scores[emotion] += score;
        }
      });

      // Reset modifiers after each word
      intensityMultiplier = 1.0;
      if (i % 3 === 0) hasNegation = false; // Negation scope limited
    }

    return { scores };
  }

  // Contextual emotion analysis
  contextualEmotionAnalysis(text) {
    const sentences = text.split(/[.!?]+/);
    const scores = {};
    
    sentences.forEach(sentence => {
      const sentiment = this.analyzeSentenceSentiment(sentence);
      Object.keys(sentiment).forEach(emotion => {
        if (!scores[emotion]) scores[emotion] = 0;
        scores[emotion] += sentiment[emotion];
      });
    });

    return { scores };
  }

  analyzeSentenceSentiment(sentence) {
    const scores = {};
    const lowerSentence = sentence.toLowerCase();

    // Question patterns often indicate anxiety
    if (lowerSentence.includes('?') || lowerSentence.startsWith('what') || 
        lowerSentence.startsWith('why') || lowerSentence.startsWith('how')) {
      scores.anxious = (scores.anxious || 0) + 0.3;
    }

    // Exclamation patterns
    if (lowerSentence.includes('!')) {
      scores.happy = (scores.happy || 0) + 0.2;
      scores.angry = (scores.angry || 0) + 0.2;
    }

    // Length and complexity (longer, complex = more anxious/sad)
    if (sentence.split(' ').length > 15) {
      scores.anxious = (scores.anxious || 0) + 0.1;
    }

    return scores;
  }

  // Advanced audio analysis
  advancedAudioAnalysis() {
    if (!this.analyser) {
      return this.getDefaultAudioMetrics();
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDataArray = new Uint8Array(bufferLength);
    
    this.analyser.getByteFrequencyData(dataArray);
    this.analyser.getByteTimeDomainData(timeDataArray);

    // Calculate comprehensive metrics
    const metrics = {
      volume: this.calculateVolume(dataArray),
      pitch: this.estimatePitch(dataArray, timeDataArray),
      energy: this.calculateEnergy(dataArray),
      spectralCentroid: this.calculateSpectralCentroid(dataArray),
      zeroCrossingRate: this.calculateZeroCrossingRate(timeDataArray),
      harmonicity: this.calculateHarmonicity(dataArray)
    };

    // Map audio metrics to emotions
    const emotionScores = this.mapAudioToEmotions(metrics);

    return {
      ...metrics,
      emotionScores
    };
  }

  calculateVolume(dataArray) {
    const sum = dataArray.reduce((a, b) => a + b, 0);
    return sum / (dataArray.length * 255);
  }

  estimatePitch(freqData, timeData) {
    // Simple pitch estimation using autocorrelation
    let maxCorrelation = 0;
    let bestOffset = 0;
    
    for (let offset = 1; offset < timeData.length / 2; offset++) {
      let correlation = 0;
      for (let i = 0; i < timeData.length / 2; i++) {
        correlation += Math.abs(timeData[i] - timeData[i + offset]);
      }
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestOffset = offset;
      }
    }
    
    return bestOffset > 0 ? this.audioContext.sampleRate / bestOffset : 0;
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
    // Simple harmonicity measure
    const peaks = [];
    for (let i = 1; i < dataArray.length - 1; i++) {
      if (dataArray[i] > dataArray[i - 1] && dataArray[i] > dataArray[i + 1]) {
        peaks.push({ index: i, value: dataArray[i] });
      }
    }
    
    peaks.sort((a, b) => b.value - a.value);
    
    if (peaks.length < 2) return 0.5;
    
    // Check if peaks are harmonically related
    const ratio = peaks[1].index / peaks[0].index;
    return Math.abs(ratio - Math.round(ratio)) < 0.1 ? 0.8 : 0.3;
  }

  mapAudioToEmotions(metrics) {
    const scores = {};
    
    // High energy + high pitch = happy or angry
    if (metrics.energy > 0.6 && metrics.pitch > 200) {
      scores.happy = 0.6;
      scores.angry = 0.4;
    }
    
    // Low energy + low pitch = sad or lonely
    if (metrics.energy < 0.4 && metrics.pitch < 150) {
      scores.sad = 0.7;
      scores.lonely = 0.5;
    }
    
    // High zero crossing rate = anxious
    if (metrics.zeroCrossingRate > 0.3) {
      scores.anxious = 0.6;
    }
    
    // Very high energy = angry
    if (metrics.energy > 0.8) {
      scores.angry = 0.8;
    }
    
    // Mid-range everything = neutral
    if (metrics.energy > 0.4 && metrics.energy < 0.6) {
      scores.neutral = 0.5;
    }
    
    return scores;
  }

  getDefaultAudioMetrics() {
    return {
      volume: 0.5,
      pitch: 150,
      energy: 0.5,
      spectralCentroid: 0.5,
      zeroCrossingRate: 0.2,
      harmonicity: 0.5,
      emotionScores: { neutral: 0.5 }
    };
  }

  // AI-powered insight (optional - requires API key)
  async getAIInsight(text, audioMetrics) {
    if (!this.apiKey) return null;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: `Analyze this speech for emotional content. Respond ONLY with a JSON object.

Text: "${text}"

Audio metrics:
- Volume: ${audioMetrics.volume.toFixed(2)}
- Pitch: ${audioMetrics.pitch.toFixed(0)} Hz
- Energy: ${audioMetrics.energy.toFixed(2)}

Respond with JSON only:
{
  "emotion": "happy|sad|angry|anxious|lonely|neutral",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`
          }]
        })
      });

      const data = await response.json();
      const responseText = data.content[0].text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      return JSON.parse(responseText);
    } catch (error) {
      console.error('AI insight error:', error);
      return null;
    }
  }

  // Demo mode with realistic patterns
  generateDemoEmotion() {
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

    const baseConfidence = selectedEmotion === 'neutral' ? 0.7 : 0.65;
    const confidence = baseConfidence + (Math.random() * 0.25);

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
      voiceMetrics: this.getDefaultAudioMetrics(),
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

    // Calculate trend
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
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export default EnhancedAIEmotionAnalyzer;
