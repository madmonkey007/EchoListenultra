import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioSession, SlicingMethod, AIProviderConfig, AudioSegment, Type } from '../types.ts';
import { GoogleGenAI } from "@google/genai";

const PRESET_COVERS = [
  '1518133910546-b6c2fb7d79e3', '1518770660439-4636190af475', '1507413245164-6160d8298b31',
  '1451187580459-43490279c0fa', '1461896704190-3213cf0ad119', '1519791883288-dc8bd9967f1f',
  '1536640712-4d4c36ff0e4e', '1511632765486-a01980e01a18', '1520694478145-d14946084531',
  '1511671782779-c97d3d27a1d4', '1507838596018-b9468b4961f6', '1519999482648-25049ddd37b1',
  '1494438639946-1ebd1d20bf85', '1485827404703-89b55fcc595e', '1519011985187-444d62641929',
  '1517245386807-bb43f82c33c4', '1441974231531-6227db76b6e', '1547826039-adc3a421f163',
  '1486406146926-c627a92fb1ab', '1514525253344-9104f6e43034'
];

const DB_NAME = 'EchoListenStorage';
const DB_VERSION = 3; 

const saveAudioToDB = (id: string, blob: Blob): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) {
        resolve(); 
        return;
      }
      const transaction = db.transaction('audio_files', 'readwrite');
      const store = transaction.objectStore('audio_files');
      const putRequest = store.put(blob, id);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(new Error("Failed to store audio blob"));
    };
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) db.createObjectStore('audio_files');
      if (!db.objectStoreNames.contains('dictionary')) db.createObjectStore('dictionary');
    };
  });
};

const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    setTimeout(() => resolve(0), 10000);
  });
};

interface AddSessionViewProps {
  onAdd: (session: AudioSession) => void;
  apiConfig: AIProviderConfig;
  isOnline?: boolean;
}

const AddSessionView: React.FC<AddSessionViewProps> = ({ onAdd, apiConfig, isOnline = true }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<SlicingMethod>(SlicingMethod.TURNS);
  const [ruleValue, setRuleValue] = useState(1); // Default to 1 turn for precision
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'slicing' | 'saving'>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleGenerate = async () => {
    if (!selectedFile) return;
    
    setProcessingStatus('uploading');
    setProgress(10);

    try {
      const sessionId = Math.random().toString(36).substr(2, 9);
      const audioDuration = await getAudioDuration(selectedFile);
      let segments: AudioSegment[] = [];

      const hasApiKey = !!process.env.API_KEY && process.env.API_KEY.length > 5;
      const canUseAI = isOnline && (
        (apiConfig.provider === 'gemini' && hasApiKey) ||
        (apiConfig.provider === 'deepgram' && !!apiConfig.deepgramApiKey)
      );

      if (canUseAI) {
        try {
          setProcessingStatus('transcribing');
          setProgress(30);

          if (apiConfig.provider === 'deepgram') {
            const url = new URL('https://api.deepgram.com/v1/listen');
            url.searchParams.append('model', 'nova-3');
            url.searchParams.append('smart_format', 'true');
            url.searchParams.append('diarize', 'true');
            url.searchParams.append('language', apiConfig.deepgramLanguage || 'en');

            const response = await fetch(url.toString(), {
              method: 'POST',
              headers: { 'Authorization': `Token ${apiConfig.deepgramApiKey.trim()}` },
              body: selectedFile
            });

            if (!response.ok) throw new Error(`Deepgram API failed with status ${response.status}`);
            const data = await response.json();
            const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
            
            setProgress(60);
            setProcessingStatus('slicing');
            
            if (words.length > 0) {
              let currentTokens: string[] = [];
              let currentStart = words[0].start;
              let speakerChangesInSegment = 0;
              let lastSpeaker = words[0].speaker;

              words.forEach((w: any, i: number) => {
                const speakerChanged = i > 0 && w.speaker !== lastSpeaker;
                const segmentDur = w.end - currentStart;
                
                // CRITICAL: Split logic must trigger BEFORE adding the current word if the speaker has changed
                let shouldSplit = false;
                if (method === SlicingMethod.DURATION) {
                  shouldSplit = segmentDur >= ruleValue * 60;
                } else if (method === SlicingMethod.TURNS && speakerChanged) {
                  speakerChangesInSegment++;
                  if (speakerChangesInSegment >= ruleValue) shouldSplit = true;
                }

                if (shouldSplit && currentTokens.length > 0) {
                  segments.push({ 
                    id: `seg-${segments.length}`, 
                    startTime: currentStart, 
                    endTime: words[i-1].end, 
                    text: currentTokens.join(' ').trim(), 
                    speaker: (lastSpeaker !== undefined ? lastSpeaker : 0) + 1 
                  });
                  currentTokens = []; 
                  currentStart = w.start; 
                  speakerChangesInSegment = 0;
                }

                const token = w.punctuated_word || w.word;
                currentTokens.push(token);
                lastSpeaker = w.speaker;

                // Handle the final segment
                if (i === words.length - 1 && currentTokens.length > 0) {
                  segments.push({
                    id: `seg-${segments.length}`,
                    startTime: currentStart,
                    endTime: w.end,
                    text: currentTokens.join(' ').trim(),
                    speaker: (lastSpeaker !== undefined ? lastSpeaker : 0) + 1
                  });
                }
              });
            }
          } else {
            // Gemini Provider: Rigid turn-based prompt
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const reader = new FileReader();
            const base64Audio = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.onerror = () => reject(new Error("FileReader failed"));
              reader.readAsDataURL(selectedFile);
            });

            const prompt = method === SlicingMethod.TURNS 
              ? `Speaker diarization task: Transcribe the audio and split it into segments. 
                 CRITICAL RULE: Each segment must contain only ONE speaker turn. 
                 Start a NEW segment IMMEDIATELY when the speaker changes. 
                 Group exactly ${ruleValue} turn(s) per segment. Output strictly JSON.`
              : `Transcription task: Slice audio into segments of exactly ${ruleValue} minutes. Output strictly JSON.`;

            const result = await ai.models.generateContent({
              model: apiConfig.geminiModel || 'gemini-3-flash-preview',
              contents: { 
                parts: [
                  { inlineData: { mimeType: selectedFile.type || 'audio/mpeg', data: base64Audio } }, 
                  { text: prompt }
                ] 
              },
              config: { 
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    segments: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          startTime: { type: Type.NUMBER },
                          endTime: { type: Type.NUMBER },
                          text: { type: Type.STRING },
                          speaker: { type: Type.INTEGER }
                        },
                        required: ["startTime", "endTime", "text", "speaker"]
                      }
                    }
                  },
                  required: ["segments"]
                }
              }
            });
            
            const rawText = result.text;
            if (rawText) {
              const parsedData = JSON.parse(rawText);
              if (parsedData?.segments && Array.isArray(parsedData.segments)) {
                segments = parsedData.segments.map((s: any, idx: number) => ({
                  ...s,
                  id: `seg-${idx}`,
                  text: s.text || ""
                }));
              }
            }
          }
        } catch (aiError) {
          console.warn("[ECHO_ADD] AI processing engine failed, falling back to local slicing:", aiError);
        }
      }

      if (!segments || segments.length === 0) {
        const dur = audioDuration || 300;
        const sliceSize = method === SlicingMethod.DURATION ? ruleValue * 60 : 30; 
        for (let t = 0; t < dur; t += sliceSize) {
          segments.push({
            id: `manual-${t}`,
            startTime: t,
            endTime: Math.min(t + sliceSize, dur),
            text: `[Audio Section: ${Math.floor(t/60)}m ${Math.floor(t%60)}s]`,
            speaker: 1
          });
        }
      }

      setProcessingStatus('saving');
      setProgress(90);
      await saveAudioToDB(sessionId, selectedFile);
      
      const randomCoverId = PRESET_COVERS[Math.floor(Math.random() * PRESET_COVERS.length)];
      
      onAdd({
        id: sessionId,
        title: selectedFile.name.replace(/\.[^/.]+$/, ""),
        subtitle: `${segments.length} segments • ${segments[0]?.id?.startsWith('manual') ? 'Standard' : 'Turn-by-Turn'}`,
        coverUrl: `https://images.unsplash.com/photo-${randomCoverId}?auto=format&fit=crop&w=400&h=400&q=60`,
        segments,
        duration: audioDuration || (segments.length > 0 ? segments[segments.length - 1].endTime : 0),
        lastPlayed: 'Just now',
        status: 'ready'
      });
      
      setProgress(100);
      navigate('/');
    } catch (e) {
      console.error("[ECHO_ADD] Critical failure during generate:", e);
      alert("Error: " + (e as Error).message);
      setProcessingStatus('idle');
    }
  };

  return (
    <div className="p-6 pb-24 space-y-8 bg-background-light dark:bg-background-dark min-h-full overflow-y-auto no-scrollbar">
      <header className="flex items-center gap-4 pt-4">
        <button onClick={() => navigate('/')} className="size-10 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-center shadow-sm active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Import Session</h2>
      </header>

      <div 
        onClick={() => processingStatus === 'idle' && fileInputRef.current?.click()} 
        className={`flex flex-col items-center justify-center p-12 bg-surface-light dark:bg-surface-dark border-2 border-dashed rounded-[2.5rem] transition-all duration-300 ${selectedFile ? 'border-accent shadow-lg bg-accent/5' : 'border-slate-200 dark:border-white/10'} ${processingStatus !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent/40'}`}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="audio/*" />
        <span className="material-symbols-outlined text-4xl mb-4 text-accent animate-pulse">{selectedFile ? 'check_circle' : 'upload_file'}</span>
        <p className="font-bold text-sm text-center truncate w-full text-slate-900 dark:text-white">
          {selectedFile ? selectedFile.name : 'Tap to select audio source'}
        </p>
      </div>

      {processingStatus === 'idle' ? (
        <div className="space-y-6 animate-fade-in">
          <section className="space-y-3">
             <div className="flex items-center gap-2 px-1">
                <span className="material-symbols-outlined text-xs text-slate-400">psychology</span>
                <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Slicing Intelligence</label>
             </div>
             <div className="grid grid-cols-2 bg-surface-light dark:bg-surface-dark p-1.5 rounded-[1.5rem] border border-slate-200 dark:border-white/5 shadow-inner">
                <button 
                  type="button"
                  onClick={() => setMethod(SlicingMethod.DURATION)}
                  className={`py-3.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all duration-300 ${method === SlicingMethod.DURATION ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg' : 'text-slate-400 dark:text-gray-500'}`}
                >
                  By Time
                </button>
                <button 
                  type="button"
                  onClick={() => setMethod(SlicingMethod.TURNS)}
                  className={`py-3.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all duration-300 ${method === SlicingMethod.TURNS ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg' : 'text-slate-400 dark:text-gray-500'}`}
                >
                  Interaction
                </button>
             </div>
          </section>

          <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm">
             <div className="flex justify-between mb-8 items-baseline px-1">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Sensitivity</span>
               <span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                 {ruleValue} <span className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">{method === SlicingMethod.DURATION ? 'min' : 'turns'}</span>
               </span>
             </div>
             <input 
               type="range" 
               className="w-full h-2 bg-slate-100 dark:bg-background-dark rounded-full appearance-none accent-accent cursor-pointer" 
               min="1" 
               max={method === SlicingMethod.DURATION ? "30" : "50"} 
               step="1"
               value={ruleValue} 
               onChange={(e) => setRuleValue(parseInt(e.target.value))} 
             />
             <p className="mt-6 text-[9px] text-slate-400 dark:text-gray-500 font-medium leading-relaxed">
               {method === SlicingMethod.TURNS 
                 ? "Each slice contains a speaker transition. Value 1 means a new block for every reply." 
                 : "Divides audio into fixed intervals. Best for monologues and long lectures."}
             </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8 py-10 text-center animate-pulse">
          <div className="flex flex-col items-center gap-6">
             <div className="relative size-20">
               <div className="absolute inset-0 rounded-full border-4 border-accent/20"></div>
               <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent animate-spin"></div>
             </div>
             <div className="space-y-2">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">{processingStatus}</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Optimizing speaker boundaries...</p>
             </div>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-surface-dark rounded-full overflow-hidden mx-8">
            <div className="h-full bg-accent shadow-[0_0_10px_#00E4FF] transition-all duration-1000" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      <button 
        onClick={handleGenerate} 
        disabled={processingStatus !== 'idle' || !selectedFile} 
        className={`w-full py-6 rounded-[2.5rem] font-display text-lg font-black transition-all duration-500 active:scale-95 shadow-2xl ${selectedFile && processingStatus === 'idle' ? 'bg-slate-900 dark:bg-accent text-white dark:text-black hover:opacity-90' : 'bg-slate-100 dark:bg-gray-800 text-slate-400 cursor-not-allowed opacity-50'}`}
      >
        {processingStatus === 'idle' ? 'Commence Engine' : 'Processing...'}
      </button>
    </div>
  );
};

export default AddSessionView;