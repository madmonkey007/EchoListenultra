import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioSession, SlicingMethod, AIProviderConfig, AudioSegment, Type } from '../types.ts';
import { GoogleGenAI } from "@google/genai";

const PRESET_COVERS = [
  '1518133910546-b6c2fb7d79e3', // 浪漫 (Romantic)
  '1518770660439-4636190af475', // 科技 (Technology)
  '1507413245164-6160d8298b31', // 科学 (Science)
  '1451187580459-43490279c0fa', // 科幻 (Sci-fi)
  '1461896704190-3213cf0ad119', // 运动 (Sports)
  '1519791883288-dc8bd9967f1f', // 诗歌 (Poetry)
  '1536640712-4d4c36ff0e4e', // 亲子 (Parenting)
  '1511632765486-a01980e01a18', // 友情 (Friendship)
  '1520694478145-d14946084531', // 激情 (Passion)
  '1511671782779-c97d3d27a1d4', // 爵士 (Jazz)
  '1507838596018-b9468b4961f6', // 古典 (Classical)
  '1519999482648-25049ddd37b1', // 童话 (Fairy Tale)
  '1494438639946-1ebd1d20bf85', // 现代 (Modern)
  '1485827404703-89b55fcc595e', // 未来 (Future)
  '1519011985187-444d62641929', // 诱惑 (Temptation)
  '1517245386807-bb43f82c33c4', // 犯罪 (Crime)
  '1441974231531-c6227db76b6e', // 自然 (Nature)
  '1547826039-adc3a421f163', // 艺术 (Art)
  '1486406146926-c627a92fb1ab', // 建筑 (Architecture)
  '1514525253344-9104f6e43034'  // 音乐 (Music General)
];

const DB_NAME = 'EchoListenStorage';
const DB_VERSION = 2;

const saveAudioToDB = (id: string, blob: Blob): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('audio_files')) {
        db.createObjectStore('audio_files');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction('audio_files', 'readwrite');
        const store = transaction.objectStore('audio_files');
        const putRequest = store.put(blob, id);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error("Failed to store audio blob"));
      } catch (e) {
        reject(new Error("Store 'audio_files' not found."));
      }
    };
    request.onerror = () => reject(request.error);
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
    setTimeout(() => resolve(0), 5000);
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
  const [ruleValue, setRuleValue] = useState(15); 
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

      const canUseAI = isOnline && (
        (apiConfig.provider === 'gemini' && !!process.env.API_KEY) ||
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

            if (!response.ok) throw new Error("Deepgram Network Error");
            const data = await response.json();
            const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
            
            setProgress(60);
            setProcessingStatus('slicing');
            
            if (words.length > 0) {
              let currentTokens: string[] = [];
              let currentStart = words[0].start;
              let turnCounter = 0;
              let lastSpeaker = words[0].speaker;

              words.forEach((w: any, i: number) => {
                const token = w.punctuated_word || w.word;
                currentTokens.push(token); // 修复：在判断前推入当前词，防止末尾词丢失

                if (w.speaker !== lastSpeaker) { turnCounter++; lastSpeaker = w.speaker; }
                
                const segmentDur = w.end - currentStart;
                // 增强：按轮次切分时，若单人发言超过60秒也强制切分一次，提高可读性
                let shouldSplit = (method === SlicingMethod.DURATION && segmentDur >= ruleValue * 60) ||
                                 (method === SlicingMethod.TURNS && (turnCounter >= ruleValue || segmentDur >= 60) && segmentDur > 2) ||
                                 (i === words.length - 1);

                if (shouldSplit) {
                  segments.push({ 
                    id: `seg-${segments.length}`, 
                    startTime: currentStart, 
                    endTime: w.end, 
                    text: currentTokens.join(' '), 
                    speaker: (w.speaker !== undefined ? w.speaker : 0) + 1 
                  });
                  currentTokens = []; 
                  currentStart = (i < words.length - 1) ? words[i+1].start : w.end; 
                  turnCounter = 0;
                }
              });
            }
          } else {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const reader = new FileReader();
            const base64Audio = await new Promise<string>(r => {
              reader.onload = () => r((reader.result as string).split(',')[1]);
              reader.readAsDataURL(selectedFile);
            });

            const prompt = `Transcribe the attached audio and provide high-quality structural segments for language learning.
            Instructions:
            1. Transcribe the entire audio content.
            2. Split into logical segments based on speaker turns or natural semantic pauses.
            3. Each segment MUST have precise 'startTime' and 'endTime' in seconds.
            4. 'speaker' must be a consistent integer ID (1, 2, ...).
            Output strictly as JSON based on the schema.`;

            const response = await ai.models.generateContent({
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
            
            const rawText = response.text;
            if (rawText) {
              const parsedData = JSON.parse(rawText);
              if (parsedData && Array.isArray(parsedData.segments)) {
                segments = parsedData.segments.map((s: any, idx: number) => ({
                  ...s,
                  id: `seg-${idx}`
                }));
              }
            }
          }
        } catch (aiError) {
          console.error("[ECHO_ADD] AI slicing failed:", aiError);
          // 发生错误时清空 segments 以触发下方的回退逻辑
          segments = [];
        }
      }

      // 回退逻辑：如果 AI 没生成出任何段落，或者没网，或者报错，执行手动等分切分
      if (!segments || segments.length === 0) {
        console.log("[ECHO_ADD] No segments from AI, performing manual slicing...");
        const dur = audioDuration || 300;
        const sliceSize = method === SlicingMethod.DURATION ? ruleValue * 60 : 45; // 默认45秒一节
        for (let t = 0; t < dur; t += sliceSize) {
          segments.push({
            id: `manual-${t}`,
            startTime: t,
            endTime: Math.min(t + sliceSize, dur),
            text: `[Audio Content: ${Math.floor(t/60)}m ${Math.floor(t%60)}s]`,
            speaker: 1
          });
        }
      }

      setProcessingStatus('saving');
      setProgress(90);
      await saveAudioToDB(sessionId, selectedFile);
      
      const randomCoverId = PRESET_COVERS[Math.floor(Math.random() * PRESET_COVERS.length)];
      const isManual = segments[0]?.id?.startsWith('manual');
      
      onAdd({
        id: sessionId,
        title: selectedFile.name.replace(/\.[^/.]+$/, ""),
        subtitle: `${segments.length} segments • ${isManual ? 'Standard' : 'Intelligence'}`,
        coverUrl: `https://images.unsplash.com/photo-${randomCoverId}?auto=format&fit=crop&w=400&h=400&q=60`,
        segments,
        duration: audioDuration || (segments.length > 0 ? segments[segments.length - 1].endTime : 0),
        lastPlayed: 'Just now',
        status: 'ready'
      });
      
      setProgress(100);
      navigate('/');
    } catch (e) {
      alert("Operation Failed: " + (e as Error).message);
      setProcessingStatus('idle');
    }
  };

  return (
    <div className="p-6 pb-24 space-y-8 bg-background-light dark:bg-background-dark min-h-full overflow-y-auto no-scrollbar">
      <header className="flex items-center gap-4 pt-4">
        <button onClick={() => navigate('/')} className="size-10 bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-center shadow-sm">
          <span className="material-symbols-outlined text-slate-500">arrow_back</span>
        </button>
        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Import Session</h2>
      </header>

      <div 
        onClick={() => processingStatus === 'idle' && fileInputRef.current?.click()} 
        className={`flex flex-col items-center justify-center p-12 bg-surface-light dark:bg-surface-dark border-2 border-dashed rounded-[2.5rem] transition-all ${selectedFile ? 'border-accent shadow-lg' : 'border-slate-200 dark:border-white/10'} ${processingStatus !== 'idle' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-accent/40'}`}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="audio/*" />
        <span className="material-symbols-outlined text-4xl mb-4 text-accent">{selectedFile ? 'verified' : 'cloud_upload'}</span>
        <p className="font-bold text-sm text-center truncate w-full text-slate-900 dark:text-white">
          {selectedFile ? selectedFile.name : 'Tap to select audio file'}
        </p>
      </div>

      {processingStatus === 'idle' ? (
        <div className="space-y-6">
          <section className="space-y-3">
             <div className="flex items-center gap-2 px-1">
                <span className="material-symbols-outlined text-xs text-slate-400">tune</span>
                <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Slicing Method</label>
             </div>
             <div className="grid grid-cols-2 bg-surface-light dark:bg-surface-dark p-1 rounded-2xl border border-slate-200 dark:border-white/5">
                <button 
                  type="button"
                  onClick={() => setMethod(SlicingMethod.DURATION)}
                  className={`py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 ${method === SlicingMethod.DURATION ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg' : 'text-slate-400 dark:text-gray-500'}`}
                >
                  Time Slice
                </button>
                <button 
                  type="button"
                  onClick={() => setMethod(SlicingMethod.TURNS)}
                  className={`py-3 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 ${method === SlicingMethod.TURNS ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-lg' : 'text-slate-400 dark:text-gray-500'}`}
                >
                  Interaction
                </button>
             </div>
          </section>

          <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-sm">
             <div className="flex justify-between mb-6 items-baseline px-1">
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">Precision</span>
               <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                 {ruleValue} <span className="text-[10px] text-slate-400 uppercase tracking-widest">{method === SlicingMethod.DURATION ? 'min' : 'turns'}</span>
               </span>
             </div>
             <input 
               type="range" 
               className="w-full h-1.5 bg-slate-100 dark:bg-background-dark rounded-full appearance-none accent-accent cursor-pointer" 
               min={method === SlicingMethod.DURATION ? "1" : "5"} 
               max={method === SlicingMethod.DURATION ? "60" : "100"} 
               step={method === SlicingMethod.DURATION ? "1" : "5"}
               value={ruleValue} 
               onChange={(e) => setRuleValue(parseInt(e.target.value))} 
             />
          </div>
        </div>
      ) : (
        <div className="space-y-6 py-6 text-center">
          <div className="flex flex-col items-center gap-4">
             <div className="size-12 rounded-full border-2 border-accent/20 border-t-accent animate-spin"></div>
             <span className="text-xs font-black uppercase tracking-widest text-accent">{processingStatus}...</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-surface-dark rounded-full overflow-hidden mx-8">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      <button 
        onClick={handleGenerate} 
        disabled={processingStatus !== 'idle' || !selectedFile} 
        className={`w-full py-6 rounded-[2.5rem] font-black text-lg transition-all active:scale-95 ${selectedFile ? 'bg-slate-900 dark:bg-accent text-white dark:text-black shadow-2xl' : 'bg-slate-200 dark:bg-gray-700 opacity-50'}`}
      >
        {processingStatus === 'idle' ? 'Commence Engine' : 'Processing...'}
      </button>
    </div>
  );
};

export default AddSessionView;