// src/i18n/zh/pricing.ts — 中文（简体）定价页词典。契约与术语表见
// en/pricing.ts。产品与套餐名称（Guardian Angel Lite / Pro、Rootz Pro）及
// 价格（$5/$15，USD）不翻译。
import type en from '../en/pricing'

const pricing: typeof en = {
  metaTitle: '定价',
  metaDescription:
    'Guardian Angel 监控（Lite $5/月，Pro $15/月）与 Rootz Pro 专业工具（$15/年）。充值式订阅——无邮箱、无密码、不自动续费。',
  h1Before: '两款产品。',
  h1Highlight: '简单的订阅。',
  lede:
    'Guardian Angel 以月度监控订阅守护你的设备。Rootz 以年度 Pro 订阅解锁专业工具。两者运行在同一个隐私优先的账户上——无邮箱、无密码，只有你的账户号码。随时充值加时——不自动续费、不保存银行卡。',
  freeH2Name: '免费版',
  freeH2PriceSuffix: ' 永久',
  freeText:
    '浏览器设备扫描（只读 ADB）、bootloader 与解锁检测、root 方法选择，以及完整的指南库——无需账户。',
  freeCta: '免费开始',
  gaHeadSuffix: '—— 月度监控',
  rootzHeadSuffix: '—— 专业工具，按年',
  guardianTiers: [
    {
      badge: '/img/badge-guardian-lite.webp',
      alt: 'Guardian Angel Lite 徽章——带一道光环的 Android 机器人',
      name: 'Guardian Angel',
      level: 'Lite',
      price: '$5',
      per: '月',
      features: ['读取已安装的应用', '读取消息', '最多覆盖 5 台设备', '每次充值 30 天——随时加时'],
      ctaLabel: '订阅',
      tag: null,
      featured: false,
    },
    {
      badge: '/img/badge-guardian-pro.webp',
      alt: 'Guardian Angel Pro 徽章——带两道光环的 Android 机器人',
      name: 'Guardian Angel Pro',
      level: 'Pro',
      price: '$15',
      per: '月',
      features: [
        '包含 Guardian Angel Lite 全部功能',
        '读取通话记录',
        '查看照片与媒体',
        '查看相机与视频',
        '随时在 Lite 与 Pro 之间切换',
      ],
      ctaLabel: '订阅',
      tag: '推荐',
      featured: true,
    },
  ],
  rootzTiers: [
    {
      badge: '/img/brand/colonel-su-staff.webp',
      alt: 'Colonel Su——睿智的老年 Android 机器人，法杖上有 SU 徽章',
      name: 'Rootz',
      level: 'Pro',
      price: '$15',
      per: '年',
      features: ['日志分析', '独立的年度订阅', '可与任何 Guardian Angel 套餐组合——也可单独使用'],
      ctaLabel: '订阅',
      tag: '新',
      featured: true,
    },
  ],
  offerSuffix: '充值式订阅：随时加时——不自动续费、不保存银行卡。使用加密货币支付立省 15%。',
  footnote:
    '所有套餐均为充值式订阅：随时加时——不自动续费、不保存银行卡。Guardian Angel 订阅者可随时在 Lite 与 Pro 之间切换；Rootz Pro 按年续期，无论有无 Guardian Angel 套餐均可使用。使用加密货币支付立省 15%——更低的手续费、更少的管理成本，回馈给你。信用卡结账将在我们的商户账户获批后上线。功能包正在最终确定中——以上阵容为当前方案。',
}

export default pricing
