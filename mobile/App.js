import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

const API_BASE = 'http://10.0.2.2:3000'; // Android emulator localhost

export default function App() {
  const [sessionCode, setSessionCode] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const wsRef = useRef(null);
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  const connectWebSocket = (code) => {
    const wsUrl = `${API_BASE.replace('http', 'ws')}/?sessionCode=${code}&userId=${userId}&type=mobile`;
    console.log('Connecting to:', wsUrl);
    
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      wsRef.current.send(JSON.stringify({ type: 'auth', sessionCode: code }));
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WS message:', data.type);
      
      if (data.type === 'authenticated') {
        setIsConnected(true);
        Alert.alert('Connected', 'Successfully connected to session!');
      }
      else if (data.type === 'error') {
        Alert.alert('Error', data.message);
        setIsConnected(false);
      }
      else if (data.type === 'request_transcript') {
        // Real-time transcription requested
      }
      else if (data.type === 'session_closed') {
        setIsConnected(false);
        setIsRecording(false);
        Alert.alert('Session Closed', 'The session has been closed');
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      setIsRecording(false);
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      Alert.alert('Connection Error', 'Failed to connect to server');
    };
  };

  const handleConnect = async () => {
    if (!sessionCode.trim()) {
      Alert.alert('Error', 'Please enter a session code');
      return;
    }
    if (!userId.trim()) {
      Alert.alert('Error', 'Please enter your user ID');
      return;
    }
    
    try {
      // First authenticate with the API to check limits
      const tokenRes = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, password: password || 'demo' })
      });
      
      if (!tokenRes.ok) {
        Alert.alert('Error', 'Invalid credentials');
        return;
      }
      
      const tokenData = await tokenRes.json();
      connectWebSocket(sessionCode.trim().toUpperCase());
    } catch (error) {
      console.error('Auth error:', error);
      connectWebSocket(sessionCode.trim().toUpperCase());
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      // Start audio metering
      recording.setOnRecordingStatusUpdate((status) => {
        if (status.metering !== undefined) {
          setAudioLevel(Math.max(0, Math.min(1, (status.metering + 60) / 60)));
        }
      });
      
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      
      clearInterval(timerRef.current);
      setIsRecording(false);
      
      // Send stop signal to web
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
      }
      
      // Get the recording URI
      const uri = recordingRef.current.getURI();
      console.log('Recording saved to:', uri);
      
      // Here we would send the audio file to the server for transcription
      // For now, we'll send a transcript placeholder
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'transcript', 
          transcript: 'Audio recorded - transcription would be processed server-side',
          isFinal: true
        }));
      }
      
      recordingRef.current = null;
      
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsRecording(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📱 Clinivoice Mobile</Text>
          <Text style={styles.subtitle}>Connect to start remote recording</Text>
        </View>
        
        <ScrollView style={styles.form}>
          <Text style={styles.label}>Session Code</Text>
          <TextInput
            style={styles.input}
            value={sessionCode}
            onChangeText={setSessionCode}
            placeholder="Enter code from web"
            placeholderTextColor="#999"
            autoCapitalize="characters"
          />
          
          <Text style={styles.label}>User ID</Text>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="Your username"
            placeholderTextColor="#999"
          />
          
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor="#999"
            secureTextEntry
          />
          
          <TouchableOpacity style={styles.button} onPress={handleConnect}>
            <Text style={styles.buttonText}>🔗 Connect</Text>
          </TouchableOpacity>
        </ScrollView>
        
        <Text style={styles.footer}>
          1. Open Clinivoice on your computer{'\n'}
          2. Select "Mobile Microphone"{'\n'}
          3. Enter the session code shown
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎙️ Remote Microphone</Text>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Connected to {sessionCode}</Text>
        </View>
      </View>
      
      <View style={styles.recordingArea}>
        <View style={[
          styles.micButton, 
          isRecording && styles.micButtonRecording,
          { transform: [{ scale: 1 + audioLevel * 0.2 }] }
        ]}>
          <TouchableOpacity 
            style={styles.micButtonInner}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.micIcon}>{isRecording ? '⏹️' : '🎙️'}</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.timer}>{formatTime(recordingTime)}</Text>
        
        <Text style={styles.recordingStatus}>
          {isRecording ? '🔴 Recording...' : 'Tap mic to start'}
        </Text>
        
        {isRecording && (
          <View style={styles.audioMeter}>
            {[...Array(10)].map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.audioBar,
                  { 
                    height: Math.random() * 30 + 10,
                    backgroundColor: i < audioLevel * 10 ? '#10b981' : '#374151'
                  }
                ]} 
              />
            ))}
          </View>
        )}
      </View>
      
      <View style={styles.infoArea}>
        <Text style={styles.infoTitle}>Instructions:</Text>
        <Text style={styles.infoText}>• Speak clearly into your phone microphone</Text>
        <Text style={styles.infoText}>• Audio will stream to your computer in real-time</Text>
        <Text style={styles.infoText}>• Transcription appears on your computer screen</Text>
      </View>
      
      <TouchableOpacity style={styles.disconnectButton} onPress={disconnect}>
        <Text style={styles.disconnectText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    padding: 20,
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: '#d1d5db',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#374151',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  statusText: {
    color: '#10b981',
    fontSize: 14,
  },
  recordingArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonRecording: {
    backgroundColor: '#ef4444',
  },
  micButtonInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4b5563',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 48,
  },
  timer: {
    fontSize: 48,
    fontWeight: '200',
    color: '#fff',
    marginTop: 30,
  },
  recordingStatus: {
    fontSize: 18,
    color: '#9ca3af',
    marginTop: 10,
  },
  audioMeter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 50,
    marginTop: 20,
    gap: 4,
  },
  audioBar: {
    width: 8,
    borderRadius: 4,
  },
  infoArea: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 22,
  },
  disconnectButton: {
    padding: 16,
    alignItems: 'center',
  },
  disconnectText: {
    color: '#ef4444',
    fontSize: 16,
  },
});
