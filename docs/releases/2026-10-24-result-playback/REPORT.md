# 转录结果播放与旧代码复用

已部署至 https://reelstranscript.com/ ，生产部署 dpl_EUcuz7ckdzVvxb7UVUGsQorRjgYE，READY。

## 复用而非重写

原项目 views/PlayerView.tsx 已有按时间同步文字与跟随滚动。现在结果区直接复用 lib/subtitle-timing.ts 的 getSynchronizedWords、getActiveWordIndex、getActiveSegmentIndex；旧播放器的局部滚动代码原样提取为 scrollActiveCaptionIntoView，两处共用。原播放器的滚动触发依赖与算法保持不变。
lib/reel-result.ts 的 resultSegments 仅把 cue/word 字段适配为旧函数所需形状。直接复制原始时间，不插值、不加偏移。校验发现分词不一致、缺词、零时长词或重叠时，该 cue 回退整句高亮，不补造词级时间戳。

## 完成项目

- 删除右上角 Start transcribing 链接。
- 右上角加入浅色/深色切换，复用 apiConfig.theme 和原保存机制。
- 提交后滚动到进度；成功后滚动到结果并显示 Transcription complete.
- 成功响应返回本次已下载的原始音频 bytes 与现有已校验词数组；不重复下载、不服务器持久化、不更改 ASR。
- 原生音频播放器、点击句子定位、逐词高亮、阅读区局部跟随滚动。
- SRT / Markdown / TXT 导出；SRT 内容与命名规则不变，后两种导出仅含无时间戳正文。

## 实测证据

真实公开 Reel：https://www.instagram.com/reel/Dewkwa1DWS-/
浏览器成功输出9条cue，显示成功提示与原音频播放器。
播放观察1：currentTime=1.6，activeCue=1（从0计数），activeWord=Not，paused=false。
播放观察2：currentTime=19.557779，activeCue=6，activeWord=fun。
手机390宽：currentTime=5.539153，activeWord=We，clientWidth=scrollWidth=390。
MP4浏览器报告音频 duration=31.829333；此前完整解码测量31.851958秒，两者为各自原始读数，未补偿时间轴。
Copy text：526字符；Markdown/TXT下载与复制文字完全相等。SRT下载9条cue，时间格式 hh:mm:ss,SSS --> hh:mm:ss,SSS 正确。
下载原件：/Users/aurrordediannao/Downloads/reel-transcript (4).srt、reel-transcript.md、reel-transcript.txt；本报告目录另存内容副本。
浅色/深色浏览器检查：根节点 class 依次 light / dark。手机无横向溢出。

## 测试与限制

Node 130/130通过（本轮新增9项）；Python22/22通过（本轮新增3项，含8种媒体格式子案例）；类型检查及构建通过。
首页静态HTML2897→2897字节，除产物名外完全一致；H1、副标题、示例、SEO不变。
产物 /assets/index-CUfJxjTO.js、/assets/index-Cg0SI6VR.css。
模型、180秒限制、2,500,000字节预检、90/120/300秒超时、SRT/时间戳引擎未改。
未继续上一轮长样本性能验收，也不将本轮短样本播放成功当作长样本性能结论。

## 改动文件

App.tsx、components/SiteHeader.tsx、components/ReelTranscriber.tsx、components/ReelResult.tsx、lib/reel-client.ts、lib/reel-result.ts、lib/subtitle-timing.ts、views/PlayerView.tsx、website.css、server/transcription/chain_entry.py、api/reel-transcribe.py、tests/reel-result.test.cjs、server/transcription/test_result_audio.py。

无新依赖、字体或第三方脚本。机械样式检查只作为参考，既有字体/颜色保持现状。此处报告为验证记录，不改产品文案。
