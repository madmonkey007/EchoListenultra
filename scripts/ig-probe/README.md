# 一次性 Instagram Reels 音频验证

独立脚本，不接入网站。输入 `reels.txt` 恰好8条公开Reel链接，逐条执行；每条60秒硬超时（包括下载、浏览器Cookie读取和ffmpeg转换），失败不重试。最终只保留16kHz、单声道、16bit PCM WAV。优先下载独立音轨；平台仅提供音视频合流时使用临时源文件提取音频，完成或失败后删除源文件，不保留视频。

## 环境

Python3.11、最新版yt-dlp及ffmpeg。以下在本目录执行：

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python --upgrade 'yt-dlp[default]'
# ffmpeg需在PATH上，或在执行时用 --ffmpeg /absolute/path/to/ffmpeg 指定。
```

需要时可在此独立环境安装 `imageio-ffmpeg` 获取测试用ffmpeg可执行文件，不影响网站依赖：

```sh
uv pip install --python .venv/bin/python imageio-ffmpeg
.venv/bin/python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'
```

## 两组运行

在真正的机房环境执行无Cookie组。标签是操作者提供的记录（未指定时为unverified），脚本不会把本机自动认定为机房IP。

```sh
.venv/bin/python probe.py --environment-label dc-provider-region
.venv/bin/python probe.py --environment-label dc-provider-region --with-cookies
```

第二条命令仅在执行主机本地Chrome确有登录态时有意义；不会导出Cookie文件，也不把本机Cookie传到远端服务器。无Cookie命令不包含任何cookies选项，并忽略yt-dlp配置文件和插件。脚本不会读取SSH凭据、设置代理、登录Instagram或把此逻辑接入网站。

对比实验应使用相同8条链接、相同网络出口、相同工具版本。脚本校验Cookie组的链接顺序和环境标签与已有无Cookie组一致。若本机Cookie组与机房无Cookie组在不同出口执行，必须分别标注，不能作为仅Cookie变化的对照。

## 输出

- 无Cookie：`probe-result-noauth.csv`。
- 带Cookie：`probe-result-cookies.csv`。
- 完整原始stderr和stdout：`logs/<UTC时间>-<组名>/01.stderr.log` 等，CSV同时记录绝对路径和stderr前20行；完整日志不截断。
- WAV：`tmp/<UTC时间>-<组名>/01/audio.wav` 等。
- 版本、时间、输入SHA256、网络标签、运行完成状态：对应 `.meta.json`。
- 终端仅报告成功率x/10、七类错误计数及全部8条的中位耗时。耗时含转换，不另发请求测时长；时长由最终WAV帧数计算。

错误分类是固定关键词规则，完整日志保留供人工判断。成功行分类为空。失败即使存在不完整WAV也不会算成功。已有结果不会被覆盖；重做前先移走上一轮CSV和meta文件。中断时CSV保留已完成行，meta的completed保持false，不输出伪造的8条汇总。

运行产物和虚拟环境由本目录.gitignore忽略。测试运行不访问Instagram，不读取浏览器Cookie：

```sh
.venv/bin/python -m unittest discover -s . -p 'test_probe.py' -v
```

官方参数与Cookie说明：https://github.com/yt-dlp/yt-dlp#usage-and-options ，https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
