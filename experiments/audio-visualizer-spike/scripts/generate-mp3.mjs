import ffmpeg from 'ffmpeg-static';import {spawnSync} from 'node:child_process';
const result=spawnSync(ffmpeg,['-y','-i','public/test-music.wav','-codec:a','libmp3lame','-b:a','192k','public/test-music.mp3'],{stdio:'inherit'});process.exit(result.status??1);
