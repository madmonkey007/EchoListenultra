// Match a known broadband calibration pulse; no browser/OS-specific delay constant.
export function estimateDelay(reference, decoded, referenceStart, maxDelay=4096) {
 let best=-Infinity,index=-1;
 let refEnergy=0;for(const x of reference)refEnergy+=x*x;
 for(let lag=0;lag<=maxDelay;lag++){
  let dot=0,energy=0;for(let i=0;i<reference.length;i++){const y=decoded[referenceStart+lag+i]??0;dot+=reference[i]*y;energy+=y*y;}
  const score=dot/Math.sqrt(refEnergy*energy||1);
  if(score>best){best=score;index=lag;}
 }
 if(best<.85)throw new Error('AAC delay calibration failed: correlation '+best);
 return {samples:index,correlation:best};
}
