# 一次性支付官方文档核查

核查日期：2026-10-26。范围：Stripe 托管 Checkout 候选、一次性授权；不引入订阅，不创建支付资源，不修改应用代码。本文是研究与实现约束，不是支付测试通过记录；实际测试状态以本阶段的测试日志和总报告为准。

## 收款资格与验证边界

**尚未确认收款主体、注册国家/地区、结算银行、商户审核、币种及退款政策，不能认定真实收款可用。** Stripe 官方支持地区当前包含香港，不列出中国大陆；消费者能访问支付页并不代表大陆主体能够开通商户。[官方地区列表](https://stripe.com/global)

跨国开通通常还要求当地合法实体、税号、实体地址、电话、身份证明、业务网站和银行账户，存在地区例外，需按最终商户地区核验。这里不建议为本次 Spike 注册海外公司。[官方跨国开户要求](https://support.stripe.com/questions/requirements-to-open-a-stripe-account-in-another-country)

沙盒不通过卡组织真实扣款，不能证明商户资格或真实到账。当前官方文档还提供匿名沙盒 CLI 入口：先核查 `stripe sandbox create --help`；官方称无需注册账户，但实际 CLI 支持和网络连通仍需执行验证。本文未创建沙盒，也未使用真实卡。[Sandboxes](https://docs.stripe.com/sandboxes)

## 建议的最小流程（设计，待实现或集成核验）

建议本阶段只验证一个固定价格的单次导出订单。价格和币种由服务端商品配置决定；示例价格不得作为最终商业定价。匿名买家可使用服务端生成的高熵会话与 HttpOnly/Secure/SameSite Cookie，无需开发完整登录；丢失会话后的权益恢复暂列限制。

1. `POST /api/orders`：服务端生成订单 ID，固化 SKU、金额、币种、归属会话和测试模式；拒绝客户端指定任意价格、订单归属或已付款状态。
2. 服务端 `POST /v1/checkout/sessions`，`mode=payment`，固定 `line_items`；`client_reference_id`/metadata 关联服务端订单；保存返回的 Session ID 与 PaymentIntent ID（后者可能稍后才有）。返回托管 Checkout URL 后整页跳转，避免自建银行卡表单。重试使用稳定的订单级 `Idempotency-Key`。[创建 Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)
3. 成功返回页只显示处理中并读取订单结果，不凭 URL、前端开关、Checkout ID 或支付按钮点击授予权益。服务端读取 Session 核对 `payment_status=paid`、模式、金额、币种、line_items/SKU、订单与会话绑定；本方案不接受零金额的 `no_payment_required` 作为付款。[Session 对象](https://docs.stripe.com/api/checkout/sessions/object)、[读取 Session](https://docs.stripe.com/api/checkout/sessions/retrieve)
4. Webhook 驱动订单确认并入账一份权益；返回页与 Webhook 即使同时触发也必须复用相同的幂等发放逻辑。`checkout.session.completed` 不必然代表延迟支付已成功；处理 `checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`，未付款不授权。[Stripe 官方维护的支付集成规则](https://github.com/stripe/ai/blob/main/skills/stripe-best-practices/references/payments.md)
5. `GET /api/entitlements` 与 `POST /api/export-permits` 必须读取服务端订单和权益，检查会话归属、退款、有效期与剩余次数；原子扣减/保留一次额度，给出短时 permit，并处理相同请求的重试。不要暴露可枚举的其他买家订单详情。具体导出失败后的额度恢复规则需产品确认。

## 回调验证、幂等和乱序

官方事实：验签依赖**原始请求字节**、`Stripe-Signature` 和该 endpoint 的 `whsec_`，JSON 解析后重新序列化不能代替原始正文。SDK 默认验签时间容差为 5 分钟；不能设为 0 来解决验签失败；重试有新的签名和时间戳。事件可能重复、并发、乱序到达；不能用 `event.created` 判断顺序。live 自动重试最长三天，CLI 手动重发可达三十天。[Webhook 文档](https://docs.stripe.com/webhooks)

以下为本工程建议，不是 Stripe 替我们保证的属性：

- Vercel Node handler 读取 raw body（如 Web Request `arrayBuffer()`）；先验签，再解析事件、检查预期账户/模式/事件类型。以 SDK 验签为优先；若实现原生 HMAC，必须固定 SHA-256、常量时间比较、多 v1 签名/密钥轮换和时钟检查，并有独立测试。
- 使用持久数据库，不使用 Vercel 实例内存、临时目录或单 JSON 文件承担正式订单存储。`events(provider,event_id)` 唯一约束；订单级行锁或 CAS；权益账本对订单有唯一发放约束。
- 一个事务内完成“可重试事件处理记录 + 订单更新 + 权益账本”；或者验签后先持久写入可重试 inbox 再返回 2xx，并有可靠消费者。不可先标记 processed 再执行可失败的业务操作，不可返回 2xx 后只依赖无保障的后台 Promise。
- 两个不同 event ID 也可能指向同一业务动作，故仅 event ID 去重不足；退款按 refund ID upsert，权益按订单/SKU 唯一发放。不能把 `(event.type, object.id)` 永久去重用于所有 update 事件，否则会漏掉同一退款的后续状态。
- 对支付、退款更新在订单锁内重新读取 Stripe 当前对象与关联退款，重新计算权益；不能让旧 completed 事件恢复已退款订单。并发更新必须串行化或有版本冲突重试。失败读取应可重试，不能默认为已付。

Stripe API 的请求幂等只覆盖 API 操作，不能替代数据库事务；v1 同一 key 可返回之前的错误结果，至少 24 小时后可能被清理，参数改变会冲突。因此本地订单永久唯一约束仍然必要。[API 幂等行为](https://docs.stripe.com/api/idempotent_requests)

## 失败与退款权限

支付失败、待付款、过期、用户回退不能增加权益。支付失败可能仍允许 Checkout 再次尝试，不能仅收到一次失败事件就永久终结订单；后续是否成功应重取真实支付状态。取消页面访问同样不证明 Stripe 已取消支付。

退款从服务端受保护的管理入口或 Stripe Dashboard 发起；普通买家的“申请退款”不能直接任意退款，不能允许其指定其他人的 PaymentIntent。`POST /v1/refunds` 指定关联 PaymentIntent/Charge；部分退款额使用最小货币单位，重试有独立幂等键并记录操作人。多次部分退款累计不能超过原付款。[退款 API](https://docs.stripe.com/api/refunds/create)

监听 `refund.created`、`refund.updated`、`refund.failed`；`charge.refunded` **也包含部分退款**，不能据此一律判定全额退完。退款可能 pending 或 failed；failed 需要人工替代退款/联系买家，不能记录为已成功退款。[退款事件与失败处理](https://docs.stripe.com/refunds)

权益政策建议（业务规则，待商户确认）：

| 服务端核实结果 | 单次权限处理 |
| --- | --- |
| 已付，未退款 | 发放一次，重复通知不重复发放 |
| 退款 pending / requires_action | 暂停未消费权益，保留原消费记录，等待最终状态 |
| 成功部分退款 | 标记部分退款；暂保留剩余一次权益，除非事先约定其他规则 |
| 成功累计退款达到实付全额 | 撤销未消费权益；保留已消费账本，不允许旧事件重新发放 |
| 退款 failed / canceled | 按最新全部退款重新计算，不按单个 failed 事件盲目恢复；若仍有其他成功全额退款则保持撤销；人工处理退款承诺 |

退款 status 包括 `pending`、`requires_action`、`succeeded`、`failed`、`canceled`；应保存每一笔退款的最新状态，而非只存一个 refund 布尔值。[Refund 对象](https://docs.stripe.com/api/refunds/object)

## 密钥、部署与绕过风险

Stripe API secret/restricted key 与 Webhook secret 只放服务端环境变量/密钥库，测试与 live 分离；不得使用 `VITE_` 前缀、打入 JS、写到版本库或日志。前端只获得 Checkout URL/订单公开状态。正式接入可采用受限 key 并按需授权；Webhook secret 与 API key 是不同凭据。[API keys](https://docs.stripe.com/keys)

托管 Checkout 降低接触银行卡数据的范围，但不消除商户自身合规义务。[官方集成安全指南](https://docs.stripe.com/security/guide)

**纯浏览器渲染无法彻底防止绕过前端付费权限。** 用户可修改 JS、绕过按钮条件、直接调用导出函数、复制已下载模板与编码路径。服务端 permit 可以保护我们自己的订单和额度账本，无法强制用户控制的浏览器执行检查，也不能证明本地导出真的开始或失败。客户端上报失败自动无限返还额度可被滥用；下载到本地的 MP4 也无法在退款后撤回。这是技术推论及商业化限制，不是 Stripe 功能缺陷。

如必须强制执行按次收费，需要服务端控制的渲染/资产/交付能力，其上传隐私、计算成本和存储成本属于下一阶段范围，本次不扩展实现。纯前端高级模板买断同样无法收回已下载代码/素材。

## 最小沙盒验收矩阵（本文件未执行）

| 验证 | 必须保留的证据 |
| --- | --- |
| 托管 Checkout 成功支付 | 沙盒 Session/PaymentIntent、浏览器返回、签名回调、持久订单与一次授权 |
| 拒付/3DS/关闭返回页 | 不提前授权，支付失败可重试；成功不依赖返回页 |
| 篡改 raw body/错误签名/过期签名 | 4xx，订单及权益不变化 |
| 同事件串行及并行重复、不同事件同订单 | 权益只发一份，处理失败可重试 |
| 延迟付款成功/失败、乱序与旧事件重放 | pending 不授权；付款/退款最终状态正确 |
| 部分、全额、多笔部分、pending/failed 退款 | 金额与权限符合明确政策，旧支付事件不能重新授权 |
| 未授权会话/任意价格/他人订单/并发消费 | 拒绝越权，订单服务端定价，额度最多消费一次 |
| Vercel 冷启动/多实例/数据库短暂失败 | 持久性与幂等一致，失败不误回成功 |

成功卡可在交互式沙盒使用 `4242 4242 4242 4242`、未来有效期及任意合规格式 CVC；程序测试优先使用 `pm_card_visa`。不使用真实卡，不以本地伪造事件代替真实 Stripe 沙盒 Checkout 验证。[官方测试文档](https://docs.stripe.com/testing)

## 尚待确认

收款实体/地区与银行、支付服务批准、金额/币种/税、退款条款、匿名权益恢复、正式数据库/鉴权/审计、实际沙盒账号或匿名沙盒连通性及回调接收环境。只有实际连通沙盒并完成上述路径，才可写“沙盒闭环通过”；真实收款需另行资格确认与 live 验证。
