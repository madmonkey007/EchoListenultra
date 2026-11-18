const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');
// Byte-exact manifest from the design delivery (madmonkey007/instagram-reel-transcript).
// A mismatch means an image was recompressed or swapped: stop, do not deploy.
const manifest={
 'public/og/home.png':[49053,'da5395f33243e7e2'],
 'public/og/instagram-reel-transcript.png':[36982,'a2a26aa925a81620'],
 'public/og/reels-transcript.png':[28264,'43ccd28c76e4c9ae'],
 'public/og/instagram-reel-transcript-generator.png':[45680,'00a737287183e60c'],
 'public/og/instagram-video-transcript.png':[39558,'7298a1f2b0daf996'],
 'public/logo-512.png':[6388,'8675e34a53ff7293'],
 'public/logo-512-white.png':[5969,'3ee83de8e9568c42'],
};
test('share-card images ship byte-exact, matching the design manifest',()=>{
 for(const [file,[bytes,hash]] of Object.entries(manifest)){
  const buf=fs.readFileSync(file);
  assert.equal(buf.length,bytes,file);
  assert.equal(crypto.createHash('sha256').update(buf).digest('hex').slice(0,16),hash,file);
 }
});
