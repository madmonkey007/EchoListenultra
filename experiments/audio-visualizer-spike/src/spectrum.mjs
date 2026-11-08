// Original radix-2 FFT; centered Hann window, shared by offline export and tests.
export function spectrumAt(pcm, sampleRate, time, size = 2048) {
 const re=new Float64Array(size), im=new Float64Array(size);
 const start=Math.round(time*sampleRate)-size/2;
 for(let i=0;i<size;i++) re[i]=(pcm[start+i]??0)*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));
 for(let i=1,j=0;i<size;i++) {let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let len=2;len<=size;len<<=1)for(let i=0;i<size;i+=len)for(let j=0;j<len/2;j++){
  const angle=-2*Math.PI*j/len,c=Math.cos(angle),s=Math.sin(angle),k=i+j,l=k+len/2,tr=re[l]*c-im[l]*s,ti=re[l]*s+im[l]*c;
  re[l]=re[k]-tr;im[l]=im[k]-ti;re[k]+=tr;im[k]+=ti;
 }
 return Float32Array.from({length:size/2},(_,i)=>Math.hypot(re[i],im[i])*4/size);
}
export function frameCount(duration) {if(!Number.isFinite(duration)||duration<=0)throw new Error('Audio duration must be positive');return Math.ceil(Math.min(30,duration)*30);}
export function mixMono(buffer) {
 const mono=new Float32Array(buffer.length);
 for(let c=0;c<buffer.numberOfChannels;c++){const data=buffer.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=data[i]/buffer.numberOfChannels;}
 return mono;
}
