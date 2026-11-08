// src/i18n/zh/home.ts — 中文（简体）落地页词典。契约与术语表见 en/home.ts。
import type en from '../en/home'

const home: typeof en = {
  metaTitle: '释放你的全部潜能',
  metaDescription:
    '释放你的 Android 全部潜能——浏览器内免费 root 扫描、Rootz 高级用户工具箱，以及 Guardian Angel 家长管控：使用统计、广告拦截、应用与消息监控等。',
  schemaAppDescription:
    '释放你的 Android 全部潜能：浏览器内免费设备扫描并提供 root 方案、Rootz 高级用户工具箱，以及 Guardian Angel 家长设备管理。',
  heroH1Before: 'Root My Android —— 释放你的',
  heroH1Highlight: '全部',
  heroH1After: '潜能。',
  heroLede:
    '对 Android 手机进行 root，可以夺回厂商留給自己的控制权。直接在浏览器中扫描你的设备——私密、只读、数据不离开你的电脑——获得与你具体机型匹配的 root 方案，然后用我们的两款应用把这份力量用起来：',
  heroLedeAnd: ' 和 ',
  heroLedeEnd: '。',
  heroScanCta: '立即扫描',
  heroMeetGa: '了解 Guardian Angel',
  heroBrowseGuides: '浏览指南',
  heroImgAlt: 'SU 超级英雄插画——Root My Android 的绿色 Android 机器人吉祥物，身披红色斗篷、佩戴黄色 SU 盾牌',
  step1Title: '连接你的设备',
  step1Text: '通过 USB 连接，直接在浏览器中开始扫描——无需安装任何软件，完全私密。',
  step1Alt: 'Android 手机通过 USB 线连接到笔记本电脑的插画',
  step2Title: '本地扫描',
  step2Text:
    '扫描在你的电脑上通过 ADB 运行，完全只读：bootloader 状态、当前系统版本，以及哪些 root 方法和 ROM 在你的设备上真正可用。不会上传任何数据。',
  step2Alt: '放大镜扫描 Android 手机屏幕的插画，旁边有一把小锁，象征私密的本地扫描',
  step3Title: '解锁你的手机',
  step3Text: '与你的具体设备和固件匹配的分步解锁 / 升级方案——而不是论坛里的通用帖子。',
  step3Alt: '剪贴板清单的插画，一枚小火箭正从上面起飞',
  whyH2: '为什么要 root 你的 Android？',
  whyP1:
    'Root 权限——对自己手机的超级用户控制权——可以移除厂商出厂时设下的限制。什么能运行、什么能联网、什么留在设备上，都由你决定。',
  whyLi1Strong: '防火墙保护',
  whyLi1Rest: '——逐个应用精确决定哪些应用可以访问互联网。',
  whyLi2Strong: '广告拦截',
  whyLi2Rest: '——系统级拦截广告，在每个应用、每个浏览器中都生效。',
  whyP2Before:
    'Root 还为你打开了通往第三方 ROM、深度精简、真正备份和自动化的大门——这些都是原生 Android 拒绝提供的。第一次接触 root？请先阅读',
  whyLinkRooting: 'root 指南',
  whyP2And: '以及我们的',
  whyLinkRisk: 'root 与解锁风险披露',
  whyP2End: '。',
  whyImgAlt: '绿色 SU 超级英雄 Android 机器人投射能量护盾、挡住砖墙火花的插画——root 权限下的防火墙保护与广告拦截',
  gaH2: 'Guardian Angel',
  gaP1:
    '为你的家庭提供家长设备管理。你在孩子的设备上自行安装并配置 Guardian Angel——它在后台安静运行并向你汇报。从免费版开始，需要更多功能时再升级。',
  gaExplore: '了解 Guardian Angel',
  gaDownload: '下载 Guardian Angel',
  gaImgAlt: 'Guardian Angel 插画——头戴金色光环的绿色 Android 机器人——守护在一部显示应用使用统计的智能手机旁',
  gaFreeLi1: '每个应用的短期使用统计',
  gaFreeLi2: '基于 DNS 的广告拦截',
  gaFreeLi3: '清理与维护',
  gaLiteLi1: '读取已安装的应用',
  gaLiteLi2: '读取消息',
  gaLiteLi3: '最多覆盖 5 台设备',
  gaProLi1: '包含 Lite 全部功能',
  gaProLi2: '读取通话记录',
  gaProLi3: '查看照片与媒体',
  gaProLi4: '查看相机与视频',
  rootzH2: 'Rootz',
  rootzP1:
    '为你自己的设备打造的高级用户工具箱。原生系统对你隐藏的一切——性能分析、自动化、日志、防火墙、文件管理和真正的终端——尽在一处。免费版已是完整工具箱；Rootz Pro 提供专业级工具。',
  rootzExplore: '了解 Rootz',
  rootzDownload: '下载 Rootz',
  rootzNewBefore: '第一次接触 root？请先阅读',
  rootzLinkGuide: 'root 指南',
  rootzNewEnd: '。',
  rootzImgAlt: 'Colonel Su 插画——Rootz Pro 睿智的绿色 Android 机器人，蓄须披袍，手持 SU 法杖，站在发光的终端窗口前——Rootz Pro 专业工具',
  rootzFreeLi1: '系统性能分析器',
  rootzFreeLi2: '任务管理器与自动化',
  rootzFreeLi3: 'Logcat 日志阅读器',
  rootzFreeLi4: '防火墙管理器',
  rootzFreeLi5: '电池监控器',
  rootzFreeLi6: '终端编辑器',
  rootzFreeLi7: '文件浏览器 / 管理器',
  rootzFreeLi8: 'APK 安装器',
  rootzFreeLi9: '按键映射器',
  rootzProLi1: '日志分析',
  rootzProLi2: 'AI harness——即将推出',
  rootzProLi3: '压缩包管理器、VNC、RDP——即将推出',
  faqH2: '常见问题',
  faqItems: [
    {
      q: 'root 一部 Android 手机意味着什么？',
      a: 'Root 让你获得自己 Android 设备的超级用户（root）权限——与系统本身同级的控制权。有了 root 权限，你可以移除预装的臃肿软件、安装第三方 ROM、运行真正的防火墙，并使用原生 Android 禁止的强大工具。',
    },
    {
      q: '我为什么应该 root 我的 Android？',
      a: '我们的用户最看重的两大好处是防火墙保护——精确决定哪些应用可以联网——以及在每个应用（不仅是浏览器）中都生效的系统级广告拦截。Root 还让你可以精简手机、调校性能并备份任何数据。',
    },
    {
      q: 'Rootz 是什么？',
      a: 'Rootz 是我们为你自己的设备打造的高级用户工具箱。免费版包含系统性能分析器、任务管理器与自动化、logcat 阅读器、防火墙管理器、电池监控器、终端编辑器、文件浏览器与管理器、APK 安装器和按键映射器。Rootz Pro 现已加入日志分析，AI harness、压缩包管理器、VNC 和 RDP 即将推出。',
    },
    {
      q: 'Guardian Angel 是什么？',
      a: 'Guardian Angel 是我们的家长设备管理应用：你在孩子的设备上自行安装并配置。免费版包含每个应用的短期使用统计、基于 DNS 的广告拦截，以及清理与维护。Guardian Angel Lite 增加读取已安装应用和消息；Pro 增加通话记录、照片与媒体、相机与视频——每个账户最多覆盖 5 台设备。',
    },
    {
      q: '扫描手机需要安装任何东西吗？',
      a: '不需要。扫描完全在支持 WebUSB 的桌面浏览器中运行：用 USB 线连接你的 Android 设备，扫描通过 ADB 与之通信。你的电脑和手机上都无需安装任何软件。',
    },
    {
      q: '扫描会改动我手机上的任何东西吗？',
      a: '不会。扫描严格只读：它通过 ADB 读取设备属性（品牌、系统版本、bootloader 与 root 状态指标），绝不写入、刷机或修改任何内容。除非你明确将报告保存到某个账户号码，否则数据不会离开你的电脑。',
    },
    {
      q: '扫描需要账户吗？',
      a: '不需要。设备扫描免费，无需账户、邮箱或密码。只有当你想保存扫描报告或订阅套餐时，才需要一个 Mullvad 式账户号码。',
    },
    {
      q: 'root 会让我的保修失效吗？',
      a: '有可能。解锁 bootloader 可能会让厂商保修失效，具体取决于厂商和你所在的司法辖区，而且解锁会恢复出厂设置——所以请先备份。我们的服务条款包含完整的 root 与解锁风险披露。',
    },
  ],
  faqCloseBefore: '两款应用均受我们的',
  faqLinkTerms: '服务条款',
  faqCloseAnd: '约束，包括完整的',
  faqLinkRisk: 'root 与解锁风险披露',
  faqCloseEnd: '。',
  agentsH2: '在构建 AI agent？',
  agentsP1:
    'Root My Android 天生就是为软件驱动而设计的，而不仅仅是供人访问。公开的 REST API 和 Model Context Protocol（MCP）服务器开放了账户、订阅套餐、银行卡与加密货币结账、代金券、支付状态和人工支持——无需 API 密钥、无需注册——也不需要邮箱或传统的注册身份。',
  agentsGuide: '阅读 agent 指南',
  agentsMcp: '打开 /mcp 工具目录',
}

export default home
