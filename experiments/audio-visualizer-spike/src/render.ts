export const templates = [
 {id:'bars',name:'Bars · 经典频谱',description:'从低音到高音排列的竖向频谱。'},
 {id:'circular',name:'Circular · 环形频谱',description:'围绕中心向外跃动的环形频谱。'},
 {id:'mirror',name:'Mirror · 镜像脉冲',description:'青紫色频谱沿中线对称展开。'},
 {id:'ripple',name:'Ripple · 霓虹波纹',description:'多层音频轮廓形成柔和的同心波纹。'},
 {id:'mountains',name:'Mountains · 频谱山峦',description:'由频率能量构成的多层渐变山脊。'},
 {id:'orbit',name:'Orbit · 轨道光点',description:'光点随音轨时间公转，随频谱扩张。'},
 {id:'rays',name:'Rays · 放射光束',description:'从中心向四周绽放的彩色光束。'},
 {id:'grid',name:'Grid · 频谱网格',description:'逐列显示频段能量的发光矩阵。'},
] as const;
export type Mode = typeof templates[number]['id'];
export function render(canvas: HTMLCanvasElement, bins: Float32Array, rate: number, mode: Mode, background?: ImageBitmap, time=0) {
 const c=canvas.getContext('2d')!; const w=canvas.width,h=canvas.height;
 c.fillStyle='#080e18';c.fillRect(0,0,w,h);
 if(background){const s=Math.max(w/background.width,h/background.height);c.drawImage(background,(w-background.width*s)/2,(h-background.height*s)/2,background.width*s,background.height*s);c.fillStyle='#080e1888';c.fillRect(0,0,w,h);}
 const count=64;
 const levels=Array.from({length:count},(_,i)=>{
  const lo=Math.max(1,Math.floor(35*Math.pow(16000/35,i/count)*2048/rate));
  const hi=Math.max(lo+1,Math.floor(35*Math.pow(16000/35,(i+1)/count)*2048/rate));
  let peak=0;for(let k=lo;k<Math.min(hi,bins.length);k++)peak=Math.max(peak,bins[k]);
  return Math.min(1,Math.max(0,(20*Math.log10(peak+1e-6)+65)/65));
 });
 const cx=w/2,cy=h/2;
 c.save();
 c.fillStyle='#76edcf';c.strokeStyle='#76edcf';
 if(mode==='bars'||mode==='circular'){
  for(let i=0;i<count;i++){
   const v=levels[i];
   if(mode==='bars'){const bw=(w-100)/count;c.fillRect(50+i*bw,h*.72-v*420,Math.max(1,bw-3),2+v*420);}
   else{const a=i/count*Math.PI*2-Math.PI/2,r=170,l=3+v*220;c.lineWidth=5;c.beginPath();c.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.lineTo(cx+Math.cos(a)*(r+l),cy+Math.sin(a)*(r+l));c.stroke();}
  }
 }else if(mode==='mirror'){
  const gradient=c.createLinearGradient(0,cy-300,0,cy+300);gradient.addColorStop(0,'#76edcf');gradient.addColorStop(.5,'#8e9eff');gradient.addColorStop(1,'#e47bd5');c.fillStyle=gradient;
  levels.forEach((v,i)=>{const bw=(w-100)/count;c.fillRect(50+i*bw,cy-3-v*290,bw-3,6+v*580);});
 }else if(mode==='ripple'){
  for(let ring=0;ring<6;ring++){
   c.beginPath();for(let i=0;i<=count;i++){const a=i/count*Math.PI*2,r=65+ring*42+levels[i%count]*(25+ring*5),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}
   c.closePath();c.strokeStyle=`hsla(${160+ring*20},85%,72%,${1-ring*.1})`;c.lineWidth=3;c.stroke();
  }
 }else if(mode==='mountains'){
  for(let layer=0;layer<4;layer++){
   const base=h*.48+layer*115;c.beginPath();c.moveTo(0,base+130);
   levels.forEach((v,i)=>c.lineTo(i/(count-1)*w,base-v*(200-layer*25)));c.lineTo(w,base+150);c.closePath();
   const g=c.createLinearGradient(0,base-180,0,base+150);g.addColorStop(0,`hsla(${180+layer*28},80%,65%,.85)`);g.addColorStop(1,'#080e1800');c.fillStyle=g;c.fill();c.strokeStyle=`hsla(${180+layer*28},80%,75%,.8)`;c.lineWidth=2;c.stroke();
  }
 }else if(mode==='orbit'){
  for(let ring=0;ring<3;ring++){
   c.beginPath();c.ellipse(cx,cy,110+ring*85,150+ring*100,0,0,Math.PI*2);c.strokeStyle='#ffffff18';c.lineWidth=1;c.stroke();
   for(let i=0;i<24;i++){const v=levels[(i*2+ring*7)%count],a=i/24*Math.PI*2+time*(ring%2?-.24:.18),rx=110+ring*85+v*35,ry=150+ring*100+v*40;c.beginPath();c.arc(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,2+v*10,0,Math.PI*2);c.fillStyle=`hsla(${160+ring*45+i*2},85%,75%,${.25+v*.75})`;c.fill();}
  }
 }else if(mode==='rays'){
  levels.forEach((v,i)=>{const a=i/count*Math.PI*2-Math.PI/2,r=45,l=60+v*300;c.beginPath();c.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.lineTo(cx+Math.cos(a)*(r+l),cy+Math.sin(a)*(r+l));c.strokeStyle=`hsla(${i/count*300+140},85%,70%,${.15+v*.85})`;c.lineWidth=2+v*5;c.stroke();});
 }else if(mode==='grid'){
  const cols=16,rows=20,gap=7,size=(w-100)/cols;
  for(let x=0;x<cols;x++){const v=Math.max(...levels.slice(x*4,x*4+4));for(let y=0;y<rows;y++){const active=v*rows>y;c.fillStyle=active?`hsl(${165+y*5},80%,${55+y}%)`:'#ffffff0c';c.fillRect(50+x*size,cy+rows*size/2-(y+1)*size,size-gap,size-gap);}}
 }
 c.restore();
 c.fillStyle='#edf8ff';c.font='28px sans-serif';c.fillText('AUDIO / '+mode.toUpperCase(),50,100);
}
