# Local Stripe sandbox payment harness

这是独立的本地服务端 Spike，使用 Node 24 内置 `node:sqlite`、`node:crypto`、`fetch` 和 `node:http`，没有新增项目依赖。固定商品为 `circular-lifetime`（Circular 模板一次性买断），测试价 USD 100 cents。它不接入现有业务系统，也没有订阅或正式支付 UI。

**合同测试中的 provider 是内存 fake，不能称为 Stripe 沙盒支付通过。** 截至本次实现交付，未连接真实 Stripe 沙盒，未完成托管 Checkout/真实回调/真实退款；收款主体、地区、商户资格也未确认，不能真实收款。Stripe REST API 固定 `2026-09-30.endive`，该稳定版本只由[官方文档](https://docs.stripe.com/upgrades)核实，尚未实际调用验证。真实 provider 的执行证据和失败记录以 phase2 总报告为准。

## 启动

需要 Node >=24，当前合同测试运行于 Node 24.14.0。`node:sqlite` 仍会打印 experimental warning。

将以下变量通过本机秘密管理器/私有环境文件注入，不要把实际值粘贴到聊天、源码、公共目录或日志：

| 变量 | 用途 |
| --- | --- |
| `STRIPE_TEST_SECRET_KEY` | 仅 `sk_test_...` 或 `rk_test_...`；显式拒绝 live key |
| `STRIPE_WEBHOOK_SECRET` | 当前 endpoint 或 CLI listen 的 `whsec_...`，与 API key 不同 |
| `PAYMENT_ADMIN_SECRET` | 自行生成的高熵随机字符串，至少32位，仅字母数字 `_` `-`；仅管理端使用 |
| `PAYMENT_DB_PATH` | 可选，默认 `phase2/payment/private/ledger.sqlite`，必须为本地私有可写路径 |

私有环境文件权限设为 `600`，放在工程以外。然后在 Spike 目录执行：

```sh
node --env-file=/absolute/private/path/payment-sandbox.env phase2/payment/server.mjs
```

服务仅监听 `http://127.0.0.1:5180`。仅接受这一 Host，不接受 `localhost` 别名；本地测试可注入 server 并监听随机端口，Host 校验随实际端口变化。不开放 CORS，普通 API 拒绝外站 Origin。Webhook 不要求 Origin，仍要求正确 Host 和签名。需要可用沙盒/权限后，可在另一个使用相同沙盒身份的 Stripe CLI 会话运行：

```sh
stripe listen --forward-to http://127.0.0.1:5180/api/webhooks/stripe
```

将 listen 输出的 endpoint signing secret 私下注入服务并重启，不能用 Dashboard 的另一个 endpoint secret 替代。CLI 默认转发全部事件，本服务只处理下方白名单。不要记录 listen 输出中的 secret 到公开证据。

**禁止将 SQLite 版支付服务部署到 Vercel。** `VERCEL` 环境存在时服务/ledger 都拒绝启动。实例本地文件无法保证多实例、冷启动后的持久性；生产需独立持久数据库、鉴权和审计后再集成。静态 Visualizer 可以单独部署，此服务不随静态站公开。不要把 `private/`、环境文件或数据库复制到 `public/`、`dist/` 或部署产物。

## HTTP 接口

所有普通 POST 使用 `Content-Type: application/json`。返回不缓存；错误不会回显 provider 原文、请求正文或密钥。

| 接口 | 认证与正文 | 结果 |
| --- | --- | --- |
| `GET /health` | 无 | `mode: sandbox-only`；不作为 provider 已验证凭据 |
| `POST /api/orders` | `{}` | 201，`{id,capability,sku,amount,currency}`；capability 只在此返回一次，数据库仅存 SHA-256 |
| `POST /api/orders/:id/checkout` | `Authorization: Bearer <capability>`，`{}` | `{orderId,sessionId,checkoutUrl}`；整页跳转托管 URL |
| `GET /api/orders/:id/entitlement` | 同一 capability | 刷新 provider 当前状态后返回 `{orderId,sku,active,status,grantCount}`；跨订单拒绝，provider 不可用则503且暂停 |
| `POST /api/webhooks/stripe` | 原始正文 + `Stripe-Signature` | 验签后核对 Stripe 当前对象、事务更新；重复已处理 event 返回200 |
| `POST /api/admin/orders/:id/refund` | `Authorization: Bearer <PAYMENT_ADMIN_SECRET>`，`{requestId,amount}` | 仅管理端；amount=100为全额，1..99为部分；返回 refundId/status |
| `GET /return` | 任意 Checkout 返回参数 | 仅提示查询订单；`paid=true`、Session ID、success URL 均不能授权 |

买家 capability 是该匿名订单的访问凭证，不能当支付商户密钥使用。需要由可信调用方私下保留；丢失后本 Spike 没有恢复流程。不将它写入 URL 或日志。测试时可在 Node 脚本中用 `fetch` 获取 capability、保存到变量，再用 `Authorization` 传递；不要把响应原文输出到可公开日志。

管理退款 `requestId` 是稳定的本地操作 ID（1..80位字母数字 `_` `-`），网络超时后重试必须沿用相同值和金额；更改金额会被拒绝。原始退款明确失败后，管理员确认状态才使用新的 requestId。退款先在 SQLite 持久标记 pending 并暂停权益，再向 Stripe 发起请求；网络不确定时保持暂停。

## 状态与防重复处理

- 支付未确认、失败、关闭页面、延迟支付尚未成功：不授予权限。处理 `checkout.session.completed`、`async_payment_succeeded`、`async_payment_failed`、`expired`，以及关联订单已知的 `payment_intent.succeeded/payment_failed`。未知或尚未保存的 Session/PaymentIntent 回调返回503允许重试。
- 金额/币种/SKU/Session/PaymentIntent/订单归属由服务端核对，不信客户端指定值；Stripe API 返回的 Session/事件 `livemode` 必须是 false，其他对象不得是 true。退款回调处理 `refund.created/updated/failed`，状态通过 provider 完整退款列表重算。
- 原始字节 HMAC-SHA256、多 v1 签名、常量时间比较；签名时间戳与服务端时钟偏差须在300秒以内，包括拒绝过远未来时间。应保持系统时钟同步。
- SQLite WAL + `BEGIN IMMEDIATE`，event ID 唯一；订单更新、权益唯一账本和已处理 event 在一个事务内提交。不同 event ID 指向同一订单也只发放一份模板权益。
- provider 查询在事务外执行，持有订单 revision 后用 CAS 重试，避免网络期间长持写锁；不能按 event.created 排序。重复、并行、重启、写入故障回滚均有合同测试。
- Checkout API 使用订单 ID 作为 `Idempotency-Key`；退款使用订单+requestId。Stripe 的幂等 key 可能在至少24小时后被清理，因此本服务对“已发起但结果未知且未持久保存 provider ID”的操作只允许23小时内重试；之后保持关闭并要求人工对账，不盲目重发。
- 当前退款政策：pending/requires_action暂停；成功部分退款保留模板权限；成功累计全额退款撤销；failed/canceled必须核对所有退款才能恢复，不能因某一失败退款忽略其他成功全额退款。旧 completed 回调不能重新发放已全额退掉的权限。
- provider 明确4xx拒绝（400/401/403/404/422）会记录被拒操作，并在重新读取支付/退款后恢复应有状态；超时、5xx和未知结果继续暂停。同一被拒requestId不再次创建退款。

## 直接注入 provider / Ledger

`ledger.mjs` 导出 `PaymentLedger`，`stripe.mjs` 导出 `StripeProvider`，`server.mjs` 导出 `createPaymentServer`。导入模块不会自动监听端口。

```js
const ledger = new PaymentLedger({ dbPath, provider, webhookSecret });
const order = ledger.createOrder();
const checkout = await ledger.checkout(order.id, order.capability);
// await browser opens checkout.checkoutUrl and completes sandbox hosted checkout.
// CLI forwards authentic webhook to ledger.webhook(rawBuffer, stripeSignature).
const result = ledger.entitlement(order.id, order.capability);
// Direct entitlement() reads the local ledger; HTTP GET also calls reconcile().
const server = createPaymentServer({ ledger, adminKey });
server.listen(5180, '127.0.0.1');
```

注入 provider 的异步接口：

- `createCheckout(order, idempotencyKey)` 返回 Stripe Session；只需读取 order.id，不向外部发送 capability hash。
- `retrieveSession(sessionId)` 返回当前 Session，必须展开 `line_items.data.price.product`，含产品 metadata.sku。
- `listRefunds(paymentIntentId)` 返回该支付的完整退款数组，分页不足/超限必须报错，不能假定无退款。
- `createRefund(order, amount, idempotencyKey)` 返回关联该 order.payment_intent 的 Refund。

此外有 `await ledger.reconcile(orderId)`、`await ledger.refund(orderId,{requestId,amount})` 和 `ledger.close()`。Ledger 本身是可信服务端库，HTTP capability/admin 认证由 server 边界执行；不要向客户端暴露任意 ledger 方法。

## 验证

从 Spike 根目录运行：

```sh
node --test phase2/tests/payment*.test.mjs
node --check phase2/payment/ledger.mjs
node --check phase2/payment/stripe.mjs
node --check phase2/payment/server.mjs
```

红测与绿测原始日志在 `phase2/evidence/payment-red.txt`、`payment-green.txt`。测试使用随机私有临时目录，结束清理数据库；合同测试覆盖原始签名/篡改/重放/未来时间、跨订单、金额/模式校验、失败/延迟付款、重复与不同event ID、两连接并行、关闭重开、事务故障回滚、退款乱序和未知provider状态、HTTP管理员认证及DNS rebinding。

未验证：真实provider API/托管Checkout/真实签名回调/真实退款、真实商户收款、多个OS进程抢占和数据库灾难恢复、正式鉴权/审计/速率限制。两连接测试是在同一 Node 进程中运行，不能描述为多机器分布式一致性验证。退款未完成且经过23小时的未知请求需要人工对账，此 Spike 不提供自动修复 UI。

## 商业化限制

**纯浏览器渲染无法阻止用户修改JS、绕过前端付费开关、复制模板代码后本地导出。** 此服务验证订单与权益账本，不能强制用户控制的浏览器遵守权限，也不能收回退款前已下载的MP4或模板。要强制按次付费，需要服务端控制渲染/交付或核心资产，这不属于本次Spike。

新增服务端文件使用现有Spike工程许可；依赖全部为Node内置模块，没有新增npm依赖。Stripe API是外部托管服务，真实使用受其服务条款及商户资格约束；NodeSQLite的experimental状态属于维护风险。详细支付事实与官方来源见上级 `PAYMENT-RESEARCH.md`。
