# Android Chrome 真机验证状态与执行协议

本轮状态：**未验证**。没有可用ADB/Android SDK或可接入的真实Android Chrome调试会话。USB枚举还报告IOCreatePlugInInterfaceForService错误，因此不能据此断言“物理上没有手机”；准确结论是当前环境没有可用真机连接。未使用桌面移动UA或模拟器替代。证据：`evidence/android-access.json`。

| 项目 | 本轮记录 |
|---|---|
| 设备厂商/型号/Android版本 | 未获取 |
| Chrome版本/UA | 未获取 |
| 15秒MP3导出 | 未运行 |
| 30秒MP3导出 | 未运行 |
| 实际编码/封装/帧数 | 未获取 |
| 导出耗时 | 未测量 |
| 内存/温控/崩溃 | 未测量；不能写“未崩溃” |

桌面线上15/30秒测试写在phase2/REPORT.md，完全独立于此表。

## 有真实设备后执行

这是一份待运行的复现协议，不是已完成测试日志。

1. 在专用真机Chrome标签访问 https://audio-visualizer-spike-20261026.vercel.app ，记录设备、Android版本、Chrome确切版本/UA、网络、剩余内存、是否充电/发热。确认HTTPS和页面H.264/AAC/AudioDecoder能力检测。
2. 准备原创CC0素材：`phase2/evidence/test-music-15s.mp3`和`public/test-music.mp3`。15秒素材从原始WAV裁剪后编码，未使用第三方音乐；生成命令见`evidence/fixture-15s.txt`和本轮测试脚本。通过实际手机文件选择器上传，不能用桌面Chrome伪装Android。
3. 首先15秒：上传、点击播放，确认可听音乐、频谱持续变化，暂停，再选Bars并上传PNG。点击导出，保持前台，记录页面编码耗时/总耗时/输出大小；查看下载后视频能否播放并有声音。
4. 15秒通过后再测30秒Circular；若15秒崩溃或OOM，保存错误/设备日志，停止向更高负载推进，标明30秒未运行。
5. 有已授权ADB连接时记录`adb shell getprop ro.product.model`、Android版本、`adb shell dumpsys package com.android.chrome`的versionName；导出前/期间/之后采样`adb shell dumpsys meminfo com.android.chrome`，记录PSS/RSS和采样间隔。该值包括Chrome其他进程/标签，不是独立网页精确内存；JS heap仅是补充。ADB未授权时不要将缺失值填零。
6. 将手机实际下载MP4复制到新的`phase2/evidence/android/`目录，用ffprobe检查：mp4容器、h264、aac、720×1280、30/1、15秒450帧或30秒900帧；检查音轨时长及真实音乐内容。不要仅根据扩展名或页面提示判定成功。
7. 保存失败logcat/Chrome控制台、是否后台/锁屏、耗时、温度和崩溃情况；未完成的项目分别写未验证。手机缺AAC/H.264配置时应明确失败，不偷偷改用WebM。

只有这些步骤在真实设备完成后，才能将本轮“未验证”改成某个具体设备的通过/失败。一个设备通过仍不等于所有Android Chrome兼容。
