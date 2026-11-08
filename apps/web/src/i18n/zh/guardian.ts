// src/i18n/zh/guardian.ts — 中文（简体）Guardian Angel 产品页词典。契约与
// 术语表见 en/guardian.ts。套餐名称（"Guardian Angel FREE"…）与价格不翻译。
import type en from '../en/guardian'

const guardian: typeof en = {
  metaTitle: 'Guardian Angel —— Android 家长设备管理',
  metaDescription:
    'Guardian Angel 是隐私优先的家长设备管理应用：使用统计、广告拦截，以及 Lite（$5/30 天）和 Pro（$15/30 天）的消息/通话记录监控。客户端加密；AI 摘要正在开发中。',
  schemaDescription:
    '为你的家庭提供家长设备管理：使用统计、广告拦截，以及最多 5 台设备的消息、通话记录和媒体监控——客户端加密，AI 活动摘要正在开发中。',
  heroH1Before: 'Guardian Angel —— ',
  heroH1Highlight: '守护他们',
  heroH1After: '，而不必监视一切。',
  heroLede:
    'Guardian Angel 是为你家庭打造的家长设备管理。你在孩子的设备上自行安装并配置，它向你的私密账户汇报——无邮箱、无密码，一切数据在离开设备前已完成加密。AI 助手正在开发中，会把这些活动转化为平静、可读的摘要。',
  heroDownload: '下载 Guardian Angel',
  heroPlans: '查看套餐与定价',
  heroImgAlt:
    'Guardian Angel 插画——头戴金色光环的绿色 Android 机器人——守护在一部显示应用使用统计的智能手机旁',
  plansH2: '尊重你家庭的套餐',
  plansP:
    '从免费版开始，需要更多功能时再升级。每个套餐都是充值式订阅：随时加时——不自动续费、不保存银行卡——使用加密货币支付还可立省 15%。',
  tiers: [
    {
      name: 'Guardian Angel FREE',
      price: '$0',
      per: '永久',
      features: ['每个应用的短期使用统计', '基于 DNS 的广告拦截', '清理与维护'],
    },
    {
      name: 'Guardian Angel LITE',
      price: '$5',
      per: '30 天',
      features: ['读取已安装的应用', '读取消息', '最多覆盖 5 台设备', '每次充值 30 天——随时加时'],
    },
    {
      name: 'Guardian Angel PRO',
      price: '$15',
      per: '30 天',
      features: [
        '包含 Guardian Angel Lite 全部功能',
        '读取通话记录',
        '查看照片与媒体',
        '查看相机与视频',
        '随时在 Lite 与 Pro 之间切换',
      ],
    },
  ],
  plansNoteBefore: '功能包正在最终确定中——以我们',
  plansNoteLink: '定价页面',
  plansNoteEnd: '上的阵容为当前方案。',
  encH2: '客户端加密——设计上就不存在隐私担忧',
  encPStrong: 'Guardian Angel 同步的一切数据都在你孩子的设备上完成加密后才离开，密钥由你持有，我们绝不持有。',
  encPRest:
    ' 使用统计、消息、通话记录、照片——无论你的套餐覆盖什么，到达我们服务器的都是我们无法解密的密文，关联的只是一个不指向任何人的账户号码。我们无法读取你孩子的数据，无法找回丢失的密钥，也不存在你孩子的个人档案——唯一的记录是你的账户号码和受管设备的加密数据。',
  encLi1: '无邮箱、无密码、无姓名、无电话号码——根本没有填写它们的输入框。',
  encLi2: '没有任何形式的广告标识符或跨站跟踪。',
  encLi3: '绝不出售、出租或向任何人分享你的数据。',
  encLi4: '你自行安装并配置应用；它只同步到你的账户号码，不会同步到其他任何人的。',
  encNoteBefore: '完整细节见我们的',
  encNoteLink: '隐私政策',
  encNoteEnd: '，包括具体存储了什么以及为什么。',
  aiH2: 'Guardian Angel AI',
  aiBadge: '计划中',
  aiP:
    'Guardian Angel AI 在我们的路线图上、正在开发中——它不是你今天可以购买的任何套餐的一部分。它的职责是减少噪音，而不是加强监视：它把本地过滤后的活动转化为家长真正读得进去的摘要，并在过程中自我解释。你的向导就是 Guardian Angel 本身——我们插画中那个头戴金色光环的绿色机器人：它安静地守护，然后解释。',
  aiLi1Strong: '应用与使用分类',
  aiLi1Rest: '——孩子的一天被哪类应用填满。',
  aiLi2Strong: '重复提醒归并',
  aiLi2Rest: '——一个发现，而不是五十条通知。',
  aiLi3Strong: '活动摘要',
  aiLi3Rest: '——按你的节奏推送的家长可读摘要。',
  aiLi4Strong: '解释',
  aiLi4Rest: '——用平实的语言说明某条规则为何触发提醒。',
  aiLi5Strong: '提醒灵敏度建议',
  aiLi5Rest: '——带着理由调校规则，而不是靠猜测。',
  aiLi6Strong: '你的反馈闭环',
  aiLi6Rest: '——把任何内容标记为有用、误报或忽略类似。',
  aiWhereH3: '处理发生在哪里——每个屏幕都有标注',
  aiWhereP: '每个 AI 结果都带有可见的处理标注，让你始终知道家人的数据去了哪里：',
  aiWhereLi1Strong: '设备上',
  aiWhereLi1Rest: '——绝不离开手机的过滤与分类。',
  aiWhereLi2Strong: '云端 AI——最小化活动数据',
  aiWhereLi2Rest: '——仅聚合数据与分类，经你同意后发送。',
  aiWhereLi3Strong: '云端 AI——敏感内容',
  aiWhereLi3Rest: '——仅当此类处理获得批准时，并且需要针对该类别单独、明确的授权。',
  aiWhereLi4Strong: '外部提供商——提供商名称',
  aiWhereLi4Rest: '——当使用第三方模型时，其名称会显示在标注上。',
  aiMediaP:
    '媒体处理默认关闭，且不在首个版本范围内。原始消息与媒体默认绝不上传——AI 摘要基于本地过滤后的最小化活动数据。',
  aiChooseH3: '由你选择，逐类决定',
  aiChooseP:
    '不同的决定有独立的开关：本地过滤；云端 AI 摘要；消息内容处理（如果未来支持）；媒体处理；在允许范围内的提供商与模型选择；保留与删除。撤销云端处理绝不会删除你的本地规则——监控会一如既往地在设备上继续工作。',
  aiNeverH3: 'Guardian Angel AI 绝不会做的事',
  aiNeverLi1: '做出自主的惩戒决定——惩罚、阻止或联系任何人。',
  aiNeverLi2: '诊断心理健康或宣称内容"安全"。',
  aiNeverLi3: '悄悄扩大监控范围。',
  aiNeverLi4: '保证安全结果——它为家长提供信息；它不能取代家长。',
  billH2: 'AI 用量将如何计费',
  billP1:
    '你的 Guardian Angel 订阅时长与 AI 用量是两回事，并且会一直保持分开：套餐、包含的 AI 额度、额外的预付费推理用量，以及你直接支付给自己提供商的 BYOK 用量。在首次扣费前，你会看到功能与任务、提供商与模型、预计最高扣费，以及硬性的会话支出上限——会话会在达到上限时干净地停止。',
  billPanelStrong: '本地工具免费。云端 AI 使用你包含的额度或预付费 AI 用量。不自动超支。',
  billPanelRest: ' 无透支、不自动充值，账单历史也绝不包含消息或提示词内容。',
  builtinH2: '已经在用系统内置管控？',
  builtinPBefore:
    'Guardian Angel 在 Android 内置管控和 Google Family Link 之上增加了监控层——它并不取代它们。我们的',
  builtinLink: '家长管控指南',
  builtinPEnd: '会带你走完全部三个层级，并附并排对比，帮助你判断家庭真正需要什么。',
  faqH2: '常见问题',
  faqs: [
    {
      q: 'Guardian Angel 是什么？',
      a: 'Guardian Angel 是我们的家长设备管理应用：你在孩子的设备上自行安装并配置，它向你的私密账户汇报。免费版包含每个应用的短期使用统计、基于 DNS 的广告拦截，以及清理与维护；Lite 和 Pro 为最多 5 台设备增加消息、应用、通话记录和媒体可见性。',
    },
    {
      q: '需要邮箱或账户吗？',
      a: '无需邮箱、无需密码——账户是 Mullvad 式的随机 16 位数字，号码本身就是凭证。你和孩子的任何信息都不会与姓名、地址或电话号码绑定。',
    },
    {
      q: 'Lite 和 Pro 套餐包含什么？',
      a: 'Lite（$5 / 30 天）读取已安装的应用和消息，每个账户最多覆盖 5 台设备。Pro（$15 / 30 天）增加通话记录、照片与媒体、相机与视频。两者都是充值式订阅——不自动续费、不保存银行卡——并且可以随时在 Lite 与 Pro 之间切换。',
    },
    {
      q: '谁能读取我孩子的消息和照片？',
      a: '只有你。Guardian Angel 同步的一切都在设备上完成加密后才上传，密钥由你持有，我们绝不持有——我们无法解密你的监控数据。AI 摘要（当它们上线时）使用本地过滤后的最小化活动数据，消息内容只有在你针对该确切类别单独授权后才会被处理。',
    },
    {
      q: 'Guardian Angel AI 会对我的孩子做决定吗？',
      a: '不会。Guardian Angel AI 的设计目标是总结与解释——归并重复提醒、分类应用使用情况、解释规则为何触发——绝不会自主惩罚、阻止、诊断或联系任何人。它是一个计划中的功能，不属于任何当前套餐。',
    },
    {
      q: '用加密货币支付能省 15% 吗？',
      a: '能——在标价基础上优惠 15%，在我们的服务器上强制执行，因为加密货币为我们节省了手续费和管理成本。优惠在结账时应用；上述法定货币标价永不改变。',
    },
  ],
  faqDownload: '下载 Guardian Angel',
  faqPlans: '套餐与定价',
}

export default guardian
