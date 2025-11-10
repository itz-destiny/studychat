
import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob, Type, FunctionDeclaration } from '@google/genai';
import { decode, encode, decodeAudioData } from '../utils/audio';
import { MicIcon, StopCircleIcon } from './Icons';

type SessionStatus = 'IDLE' | 'CONNECTING' | 'LISTENING' | 'ERROR' | 'CLOSED';

const controlLightFunctionDeclaration: FunctionDeclaration = {
  name: 'set_light_state',
  description: 'Set the state of a room light.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      on: {
        type: Type.BOOLEAN,
        description: 'Whether the light should be on or off.',
      },
      color: {
        type: Type.STRING,
        description: 'The color of the light, e.g., "blue", "warm white".',
      },
    },
    required: ['on'],
  },
};

const VoiceAssistant: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>('IDLE');
  const [transcriptions, setTranscriptions] = useState<{ user: string; model: string; isFinal: boolean }[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  
  const sessionRef = useRef<LiveSession | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  const addNotification = (message: string) => {
    setNotifications(prev => [...prev, message]);
    setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 5000);
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setStatus('IDLE');
  }, []);

  const startSession = async () => {
    setStatus('CONNECTING');
    setTranscriptions([]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: [controlLightFunctionDeclaration] }],
          systemInstruction: 'You are a helpful desktop assistant. You can control smart devices. Keep your responses concise and conversational.',
        },
        callbacks: {
          onopen: () => {
            setStatus('LISTENING');
            const stream = audioStreamRef.current;
            if (!stream) return;
            // FIX: Cast window to `any` to allow access to `webkitAudioContext` for older browser compatibility.
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            inputAudioContextRef.current = inputCtx;
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            
            processor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(new Int16Array(inputData.map(v => v * 32768)).buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent) {
              const { inputTranscription, outputTranscription, modelTurn, turnComplete } = message.serverContent;
              
              if (inputTranscription) {
                  currentInputTranscriptionRef.current += inputTranscription.text;
                  setTranscriptions(prev => {
                      const newTranscriptions = [...prev];
                      if (newTranscriptions.length === 0 || newTranscriptions[newTranscriptions.length - 1].isFinal) {
                          newTranscriptions.push({ user: currentInputTranscriptionRef.current, model: '', isFinal: false });
                      } else {
                          newTranscriptions[newTranscriptions.length - 1].user = currentInputTranscriptionRef.current;
                      }
                      return newTranscriptions;
                  });
              }

              if (outputTranscription) {
                  currentOutputTranscriptionRef.current += outputTranscription.text;
                   setTranscriptions(prev => {
                      const newTranscriptions = [...prev];
                      if(newTranscriptions.length > 0) {
                          newTranscriptions[newTranscriptions.length - 1].model = currentOutputTranscriptionRef.current;
                      }
                      return newTranscriptions;
                  });
              }

              if (turnComplete) {
                  setTranscriptions(prev => {
                      const newTranscriptions = [...prev];
                      if (newTranscriptions.length > 0) {
                          newTranscriptions[newTranscriptions.length - 1].isFinal = true;
                      }
                      return newTranscriptions;
                  });
                  currentInputTranscriptionRef.current = '';
                  currentOutputTranscriptionRef.current = '';
              }

              const audioData = modelTurn?.parts[0]?.inlineData?.data;
              if (audioData) {
                  const outputCtx = outputAudioContextRef.current;
                  if (!outputCtx) return;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                  const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                  const source = outputCtx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(outputCtx.destination);
                  source.onended = () => audioSourcesRef.current.delete(source);
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  audioSourcesRef.current.add(source);
              }
            }
            if (message.toolCall) {
                for (const fc of message.toolCall.functionCalls) {
                  let result = 'ok';
                  if (fc.name === 'set_light_state') {
                    const { on, color } = fc.args;
                    const colorText = color ? ` to ${color}` : '';
                    const stateText = on ? 'on' : 'off';
                    addNotification(`Function Call: Turning light ${stateText}${colorText}.`);
                    result = `Light turned ${stateText}.`;
                  }
                   sessionPromise.then((session) => {
                      session.sendToolResponse({
                        functionResponses: { id: fc.id, name: fc.name, response: { result: result } }
                      });
                   });
                }
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error(e);
            addNotification(`Error: ${e.message}`);
            setStatus('ERROR');
            stopSession();
          },
          onclose: () => {
            setStatus('CLOSED');
            stopSession();
          },
        },
      });

      sessionRef.current = await sessionPromise;
      audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      // FIX: Cast window to `any` to allow access to `webkitAudioContext` for older browser compatibility.
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
    } catch (err) {
      console.error(err);
      addNotification(`Failed to start session: ${err instanceof Error ? err.message : String(err)}`);
      setStatus('ERROR');
      stopSession();
    }
  };

  const handleToggleSession = () => {
    if (status === 'IDLE' || status === 'ERROR' || status === 'CLOSED') {
      startSession();
    } else {
      stopSession();
    }
  };

  const getStatusIndicator = () => {
    const baseClasses = "text-sm font-semibold transition-all duration-300";
    switch (status) {
      case 'IDLE': return <span className={`${baseClasses} text-gray-400`}>Ready</span>;
      case 'CONNECTING': return <span className={`${baseClasses} text-blue-400 animate-pulse`}>Connecting...</span>;
      case 'LISTENING': return <span className={`${baseClasses} text-green-400`}>Listening...</span>;
      case 'ERROR': return <span className={`${baseClasses} text-red-500`}>Error</span>;
      case 'CLOSED': return <span className={`${baseClasses} text-gray-500`}>Disconnected</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800/50 rounded-lg p-4 md:p-6 shadow-xl">
      <div className="flex-shrink-0 flex flex-col items-center gap-4 pb-4 border-b border-gray-700">
        <h2 className="text-2xl font-bold text-center">Voice Assistant</h2>
        <button
          onClick={handleToggleSession}
          className={`relative flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 shadow-lg
            ${status === 'LISTENING' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'}`}
        >
          {status === 'LISTENING' && <span className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></span>}
          {status === 'LISTENING' ? <StopCircleIcon className="w-12 h-12 text-white" /> : <MicIcon className="w-12 h-12 text-white" />}
        </button>
        {getStatusIndicator()}
      </div>

      <div className="flex-grow overflow-y-auto mt-4 pr-2 space-y-4">
        {transcriptions.length === 0 && (
          <div className="text-center text-gray-400 pt-10">
            <p>Click the microphone to start the conversation.</p>
          </div>
        )}
        {transcriptions.map((t, i) => (
          <div key={i} className={`p-3 rounded-lg ${!t.isFinal ? 'opacity-70' : ''}`}>
            {t.user && <p className="text-indigo-300"><strong className="font-semibold">You:</strong> {t.user}</p>}
            {t.model && <p className="text-teal-300 mt-1"><strong className="font-semibold">Assistant:</strong> {t.model}</p>}
          </div>
        ))}
      </div>
      {/* Notifications */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
          {notifications.map((msg, i) => (
              <div key={i} className="bg-blue-500 text-white text-sm font-bold px-4 py-3 rounded-lg shadow-lg animate-fade-in-out">
                  {msg}
              </div>
          ))}
      </div>
    </div>
  );
};

export default VoiceAssistant;