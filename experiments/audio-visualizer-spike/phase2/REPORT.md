# Audio Visualizer 最小上线与支付验证报告

日期：2026-10-26。工作范围始终限定在 `experiments/audio-visualizer-spike`，旧测试证据保留。**独立 Vercel 生产部署和桌面 Chrome 线上媒体链路验证通过；Android 真机未验证；支付完成本地服务端合同验证，但真实 Stripe 沙盒/真实收款闭环未完成。**

## 状态总表

| 阶段 | 本轮结果 | 判断依据 |
|---|---|---|
| 旧 Spike 复核 | 通过 | 旧5个MP4哈希匹配；ffprobe、重新解码互相关/FFT几何复核通过 |
| 生产构建 | 通过 | 本地tsc/Vite及真实Vercel云构建完成 |
| 独立生产URL | 可访问，HTTP200 | https://audio-visualizer-spike-20261026.vercel.app |
| 线上上传/播放/预览/导出 | 桌面Chrome通过 | 实际本地文件上传至网页、播放暂停、频谱变化、背景像素变化、按钮导出、下载和解码 |
| 线上15秒MP3 | 通过 | Bars、H.264/AAC、720×1280、30fps、450帧、15秒 |
| 线上30秒MP3 | 通过 | Circular、H.264/AAC、720×1280、30fps、900帧、30秒 |
| Android Chrome 15/30秒 | **未验证** | 无可用ADB/真实设备调试会话；未用桌面模拟替代 |
| 服务端支付/退款合同 | 14项支付测试及HTTP流程通过 | fake provider，不代表Stripe真实沙盒 |
| 真实Stripe Sandbox | **受阻，未创建成功** | CLI要求邮箱；本机无Git邮箱，已向用户请求 |
| 收款主体/地区/商户资格 | **未确认** | 用户尚未提供；没有从时区推断 |
| 真实收款与支付权益商业闭环 | **未完成/未启用** | 无live key/真实扣款/生产订单数据库/支付部署 |

## 1. 原 Spike 与许可复核

已阅读README、REPORT、LICENSES及实际源代码。五个原MP4 SHA-256均与旧`media-validation.json`一致；重新ffprobe均H.264/avc1 + AAC/mp4a、720×1280、30fps、900帧、视频/音频/容器呈现均30秒。独立重新解码：头、中、尾音频均0采样偏移；视觉最佳偏移均0帧。未运行会重写旧证据的旧测试main。完整复核见 [SPIKE-REVIEW.md](SPIKE-REVIEW.md)。

当前是真正的Canvas逐帧WebCodecs/Mediabunny MP4，不是WebM换后缀。AAC通过相同编码器的短脉冲校准、负时间戳/edit list去除priming。浏览器库Mediabunny 1.62.1为MPL-2.0，未修改；完整许可通知与对应源码地址继续发布。原创代码MIT、音乐/图片CC0。支付后端只使用Node内置模块，无新增npm运行时依赖；Stripe服务资格/条款不由开源许可代替。

旧`evidence/`共71个文件在本轮开始保存哈希清单；最终逐项检查未改变。原业务文件也保存只含路径/哈希的基线，最终核验未修改。新日志、视频、支付测试全部位于`phase2/evidence/`。

## 2. 独立生产部署

新建项目：`ponymads-projects/audio-visualizer-spike-20261026`。

- 生产别名：[打开 Visualizer](https://audio-visualizer-spike-20261026.vercel.app)。
- 本轮不可变URL：https://audio-visualizer-spike-20261026-1h0hw3kbt-ponymads-projects.vercel.app 。
- 部署ID：`dpl_HMLW13gyscS2LZywrjo8JK4jE9Bg`，READY，target=production。
- 本地CLI58.4.4；云CLI65.1.0，项目Node24.x；云Vite6.4.5构建1.11秒，整体Build Completed约5秒。
- Install `npm ci --ignore-scripts`，Build `npm run build`，Output `dist`。避免下载仅本地验证使用的FFmpeg二进制。

显式从Spike目录link/deploy，新项目的根目录为上传包的`.`。没有修改业务根vercel.json、业务项目或业务域名。没有为支付复用业务数据库/密钥。部署详细日志与配置说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。

安全头已实际在线检查：nosniff、DENY、no-referrer、摄像头/麦克风/定位禁用、CSP限制同源JS，允许图片/视频blob和Worker blob；没有开放unsafe-eval。当前style内联，因此仅style-src允许unsafe-inline。没有启用COOP/COEP；生产测得crossOriginIsolated=false，仍正常导出。当前使用路径不要求SharedArrayBuffer；库虽有可选Worker helper，当前测试未要求专门Worker部署。未来移入Worker或增加支付跳转时应重新验证相应CSP。

`.vercelignore`排除evidence、phase2、测试、研究、.env*、数据库、node_modules/dist等；线上请求旧视频证据、phase2哈希清单和.env.local均404。Vercel自动生成的本地OIDC环境文件被排除，未公开。线上站点目前仍是免费渲染Spike，**没有把本地支付后台部署为无持久性Function**。

## 3. 生产URL实测

环境：macOS15.4.1 x86_64、Intel i5-8257U、8GiB，安装版Chrome155由Playwright headless驱动；不是Android，也未做人工听音。音频为本次原创CC0音乐的实际15秒/30秒MP3；背景为原创PNG。

测试通过真实DOM按钮/文件输入操作，并从生产网页下载生成文件。检查播放期间PCM频谱非零且变化、暂停、背景像素变化、导出完成、下载ftyp签名、ffprobe实际编码、Chrome视频与音频解码。独立分析使用FFmpeg解码+NumPy互相关/FFT，不靠页面成功提示判断。

<!-- PRODUCTION_ROWS_START -->
| 输入 / 效果 | 编码+封装耗时 | 实际文件 | 呈现/帧数 | 采样JS heap峰值 | Chrome进程RSS合计峰值 |
|---|---:|---|---|---:|---:|
| 15秒 / bars | 3.216秒 | 2.866MB H.264/AAC | 15秒 / 450帧 | 5.90MiB | 787.04MiB |
| 30秒 / circular | 6.325秒 | 7.770MB H.264/AAC | 30秒 / 900帧 | 7.22MiB | 882.55MiB |
<!-- PRODUCTION_ROWS_END -->

两次均无观察到的页面/浏览器崩溃及未处理异常。RSS为该次Chrome自身browser/renderer/GPU/utility进程采样合计，可能重复统计共享页且漏掉瞬时峰值，不是精确内存分配或移动端预算。JS heap不包含外部AudioBuffer/编码器/GPU分配。30秒仍有约数百MiB内存压力，桌面通过不能外推Android。

独立媒体结果：

- 两份MP4的视频与音频流均为H.264/AAC、720×1280、30/1，准确15/30秒；分别450/900帧。
- 头、中、尾与原始输入MP3互相关：15秒最低0.9999768517，30秒最低0.9999775039；音频偏移及首尾漂移均0ms。
- 25个采样帧几何/FFT比对：两份最佳偏移均0帧；Bars MAE约0.111px，Circular约0.648px。
- AAC裸包解码可能包含末包填充；呈现时长取MP4 edit list/流时间轴，不把额外裸PCM填充误报成用户可见超长。

交付：[15秒线上测试MP4](evidence/production-15s-bars.mp4)、[30秒线上测试MP4](evidence/production-30s-circular.mp4)；原始结果`production-results.json`、`production-media.json`、两份ffprobe JSON与截图均在新证据目录。

第一次线上测试中，15秒导出成功，第二次上传相同PNG没有触发change，测试脚本等待“背景已加载”超时。这是测试复用文件输入的错误；保留`production-before-test-fix.*`，修正为先清空input后再选择，同一线上应用不改源码即可两次通过。

## 4. 移动端

**Android Chrome 未验证。** 没有可用ADB/SDK/真机调试会话；USB枚举也有系统接口错误，不能以空结果声称没有物理设备。设备型号、Chrome版本、15/30秒耗时、内存、崩溃、编码一律未知，不填零也不写“未崩溃”。桌面headless没有设置移动UA模拟结果。

[ANDROID.md](ANDROID.md)提供待运行真实设备协议：先15秒，再30秒；记录型号/系统/Chrome、前台状态、PSS/RSS/耗时/温控/下载结果，把真机下载视频取回ffprobe并比对音轨。该协议本身不是测试通过证据。

## 5. 最小支付流程与服务端验证

候选是**Circular模板一次性买断**，优于在本机失败渲染时按次扣费。当前USD1.00仅为固定的**合同测试价**，不是已确认商户价格或对公众售卖。现有线上渲染器保持免费；支付架构验证器独立位于`phase2/payment/`，不引入登录、订阅或新模板编辑器。

流程：服务端固定SKU/金额创建订单 → 托管Checkout → 服务端验签并重新读取当前支付状态 → 事务更新订单/权益与已处理event → capability认证后查询权益。success/cancel跳转不授予权限。

实现与测试：

| 要求 | 实际实现 | 已验证边界 |
|---|---|---|
| 服务端订单 | Node24 SQLite WAL，随机订单ID；32字节随机capability仅首次返回，库中只存SHA256 | 固定金额/SKU、跨订单访问拒绝、关闭重开保留状态 |
| 服务端Checkout | Native fetch调用Stripe REST，仅test key；服务端固定SKU/USD100 cents，订单ID作Idempotency-Key | 请求合同已测；真正Stripe请求未运行 |
| 回调验签 | 原始Buffer HMAC-SHA256、常量时间、多v1签名、±300秒窗口 | 篡改/过期/过远未来/格式错误拒绝 |
| 重复Webhook | event唯一键+订单/权益/event同一BEGIN IMMEDIATE事务；grant订单唯一 | 重复/不同eventID、两连接并行、事务插入故障回滚均测试 |
| 乱序与支付失败 | 服务端重取Session/完整退款列表，校验金额/币种/SKU/Session/PI/order；revision检查网络查询期间状态变更 | 未paid/失败不发权益，延迟成功才能发，未知状态暂停 |
| 退款 | 管理员认证；稳定requestId；先持久pending并暂停；后核对provider | pending暂停、部分成功保留、累计全额撤销、失败按全部状态恢复；旧completed不恢复已退权益 |
| 付费权限 | Bearer capability严格绑定订单；HTTP查询先刷新provider；无前端paid标记信任 | 伪造/跨订单capability、未授权退款拒绝 |
| 密钥管理 | 只读取服务端环境；不服务静态文件、不返回/记录密钥，拒绝live key/livemode | 本地入口/HTTP安全测试及部署排除检查通过 |
| 持久性边界 | SQLite仅本机，VERCEL环境显式拒绝启动，部署忽略payment目录 | 当前后端不能当Vercel多实例支付账本 |

14项支付合同测试通过，另2项部署安全头测试通过，总计16项。额外真实本地HTTP流程（provider仍为fake）：创建订单 → 本地签名模拟支付通知并行投递5次只发一份权益 → 管理退款pending暂停 → 模拟全额成功撤销 → 迟到completed仍不恢复 → 服务重启后仍撤销。见`payment-contract-flow.json`。

测试包括DNS rebinding：早期Host与Origin互相比对可被攻击域共同伪造，红测实际201而预期403。已限制所有路由Host为实际127.0.0.1端口，Origin只能同一固定来源（Webhook仅豁免Origin、不豁免Host）；最新攻击回归403。详见 [安全复核](SECURITY-REVIEW.md)。

Stripe幂等key有保留窗口，未知结果不能隔多日盲重试；当前超过23小时的未知Checkout/退款结果需人工对账。SQLite仍experimental；两连接测试在同一Node进程，不等于多进程/多机器灾难恢复验证。支付状态迁移、接口和秘密注入说明见 [payment/README.md](payment/README.md)，官方资料见 [PAYMENT-RESEARCH.md](PAYMENT-RESEARCH.md)。

## 6. 真实支付沙盒阻塞项

尚未确认：收款主体是个人/公司、注册国家/地区、现有支付商户/沙盒及准入资格。未以用户时区或Vercel账户推断资格。

按[Stripe官方当前Sandboxes文档](https://docs.stripe.com/sandboxes)，本轮安装独立临时CLI并实际尝试匿名claimable sandbox。两次均在创建前退出1：

1. 不提供身份信息：`email is required`。
2. `--from-git`：本机未配置`git config user.email`，无法推断邮箱。

已异步请求用于沙盒认领的邮箱及主体/地区，当前未取得。没有编造邮箱，也没有复用业务配置/真实商户密钥。没有产生sandbox account、API key、真实Checkout、真实Stripe签名回调或真实退款，**不能把上述fake合同测试叫做Stripe Sandbox闭环**。状态与原始错误摘要见`stripe-provision-status.json`。

下一步解锁条件：提供可用于沙盒的邮箱，或通过私密环境注入现有沙盒test key及endpoint secret；再运行实际Hosted Checkout成功/失败、CLI转发真实Webhook、重送/乱序、真实Sandbox退款和权益检查。付款主体/地区/商户资格另需明确；沙盒通过也不代表真实收款获批。

正式Vercel支付API还缺独立持久数据库（Postgres等）与访问身份/审计、限流、Webhook生产配置及部署验证。不得将当前local SQLite数据库复制到Vercel临时文件系统，也不得复用既有业务数据库来绕过隔离要求。

## 7. 商业化未解决风险

- **纯浏览器渲染无法彻底防止付费绕过。** 当前模板和渲染代码已经发送到浏览器，用户可改JS、调用底层导出函数、复制模板后离线运行；删除诊断入口或隐藏按钮也不能解决。服务端账本可以证明购买权益，不能强制用户浏览器执行按次付费，更不能收回退款前下载的视频。
- 模板一次性买断降低计次争议，但模板复制风险仍然存在；若必须强制计次或控制交付，应由服务端控制核心资产/渲染/下载交付，此轮没有实现。
- Android设备AAC/H.264实现、校准、温控、内存和保存下载未测；桌面RSS约数百MiB，不能承诺手机可用。
- 真实Stripe expanded对象、API版本、Webhook投递/错误、退款行为尚未实测；本地合同不能证明支付服务可用或商户资格。
- 客户端导出仍在主线程、无取消/看门狗，大文件/图片缺完整资源边界；一轮15/30秒线上通过不代表长期稳定。
- MPL通知/源码提供已保留，但正式商用仍需按实际分发与地区复核编解码器权利和支付商户规则。

## 8. 变更与验证入口

只在Spike目录变更：独立vercel.json安全头、.vercelignore、CLI生成的本地忽略项、README第二阶段链接；新增phase2部署/Android/支付/安全文档、服务端模块、测试、脚本与新证据。没有改媒体渲染源码，没有修改旧REPORT/原视频证据，没有改现有业务项目/域名/部署配置。

没有新增npm依赖。支付只用Node内置模块；Stripe CLI装在临时目录，不进入网页或package lock。静态部署继续只发布原渲染器与许可/原创素材。

```sh
npm test
npm run typecheck
npm run build
node --test phase2/tests/*.test.mjs
node phase2/scripts/payment-contract-smoke.mjs
node phase2/scripts/production-url.mjs
# 安装numpy后：
python phase2/scripts/verify-production-media.py
node phase2/scripts/final-check.mjs
```

所有新证据写phase2/evidence，原evidence保持不变。最终核验还检查业务文件哈希、线上下载视频对应分析SHA、线上JS与本地构建哈希、安全头/私密资源排除及测试状态。未运行ESLint（工程无该任务），使用严格tsc、Node脚本语法检查、Python AST与npm audit；不把“没有lint任务”写成lint通过。
