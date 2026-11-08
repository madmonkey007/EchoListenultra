# 真实阶段进度百分比

生产部署 dpl_6XuuoasgQh1u73U7iPefrJkNB4Vj，READY。https://reelstranscript.com/

去掉往返动画，改为真实步骤完成百分比。不是音频处理到某一秒的百分比，也不按经过时间自动增长。
- 0%：获取原音频。
- 33%（1/3）：完整音频下载、哈希检查和字节预检通过；开始语音识别。
- 67%（2/3）：ASR返回，词级时间戳与原始时长验证通过；开始整理字幕。
- 100%（3/3）：最终文字/SRT/cue响应通过客户端校验，显示成功结果。
识别阶段没有上游逐帧处理百分比，因此等待期间保持当前值。失败、异常响应、断流均不会显示100%。

## 线上真实浏览器观察

样本：https://www.instagram.com/reel/Dewkwa1DWS-/
点击后DOM观察：0.327秒 0%；2.835秒 33%；4.615秒 67%；最终显示 Transcription complete. 100%，生成9条cue并保留原音频/Copy text/三格式导出。
原始采样见live-progress.json；各阶段截图同目录。计时为浏览器观测值，包含轮询/截图开销，不用于性能结论。

## 传输与兼容

页面通过 Accept: application/x-ndjson 选择流式阶段事件，每个事件即时flush。进度事件只含阶段、已完成步骤、总步骤、上限，不含用户链接、文字或密钥。最终结果保留此前的文字、词时间、原音频、SRT等字段。
未选择流模式的调用保留原JSON及原HTTP状态。流开始之后HTTP状态已经为200；后续错误放在 type:error 的帧中，status_code保留原422/502/413，data保留原error/limit_seconds/可选duration_seconds，前端按error分类显示。流开始前的错误仍返回原JSON和HTTP状态。
断开只会在下一次写进度时阻止后续阶段，不宣称能立即中止已经在执行的下载或ASR。模型、180秒/2500000字节上限、90/120/300秒超时、时间戳、音频与SRT引擎均未改。
Vercel官方Python流式支持说明：https://vercel.com/docs/functions/runtimes/python

## 验证

135/135 Node测试，27/27 Python测试，类型检查及构建通过。新增5项客户端测试和5项后端测试方法，涵盖先于结果收到阶段、跨网络块/无末尾换行、too_long、非法/断流、实际完成边界、断开、原JSON契约。
独立只读检查未发现阻塞问题。首页静态壳2897字节，除产物文件名外不变。
产物：index-PsI6fiGB.js / index-DVkVUbaO.css。

改动文件：api/reel-transcribe.py、server/transcription/chain_entry.py、server/transcription/test_progress_stream.py、lib/reel-client.ts、components/ReelTranscriber.tsx、components/ReelResult.tsx、website.css、tests/reel-progress.test.cjs。
