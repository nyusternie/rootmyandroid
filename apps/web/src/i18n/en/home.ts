// src/i18n/en/home.ts — English (default locale) landing-page dictionary.
// This file's shape is the contract for zh/ru/ko (typed `typeof en` there).
// Glossary from en/common.ts applies. Plan tier card headings
// ("Guardian Angel FREE" …) are plan names — they stay literal in the
// component markup, never translated. Fragments ending/starting with a
// space are split around inline links (link hrefs live in the component).
const home = {
  metaTitle: 'Release Your FULL Power',
  metaDescription:
    "Release your Android's full power — free in-browser root scan, the Rootz power-user toolkit, and Guardian Angel parental controls with usage stats, ad blocking, app and message monitoring & more.",
  // SoftwareApplication JSON-LD description (mirrors the visible copy).
  schemaAppDescription:
    "Release your Android's full power: a free in-browser device scan with a rooting plan, the Rootz power-user toolkit, and Guardian Angel parental device management.",
  heroH1Before: 'Root My Android — release your ',
  heroH1Highlight: 'FULL',
  heroH1After: ' power.',
  heroLede:
    'Rooting your Android phone unlocks the control the manufacturer kept for itself. Scan your device right in your browser — private, read-only, nothing leaves your computer — follow a rooting plan matched to your exact model, then put that power to work with our two apps: ',
  heroLedeAnd: ' and ',
  heroLedeEnd: '.',
  heroScanCta: 'SCAN NOW',
  heroMeetGa: 'Meet Guardian Angel',
  heroBrowseGuides: 'Browse the guides',
  heroImgAlt:
    'Illustration of the SU superhero — the green Android robot mascot of Root My Android, wearing a red cape and a yellow SU shield',
  step1Title: 'Connect your device',
  step1Text: 'Plug in over USB and start a scan right from your browser — no installs, completely private.',
  step1Alt: 'Illustration of an Android phone connected by USB cable to a laptop',
  step2Title: 'Scan locally',
  step2Text:
    'The scan runs on your computer over ADB and is read-only: bootloader status, current build, and which root methods and ROMs actually work on it. Nothing is uploaded.',
  step2Alt:
    'Illustration of a magnifying glass scanning an Android phone screen with a small padlock, symbolizing a private local scan',
  step3Title: 'Unlock your phone',
  step3Text:
    'A step-by-step unlocking / upgrade plan matched to your exact device and firmware — not a generic forum thread.',
  step3Alt: 'Illustration of a clipboard checklist with a small rocket launching from it',
  whyH2: 'Why root your Android?',
  whyP1:
    'Root access — superuser control over your own phone — removes the limits the manufacturer shipped with it. You decide what runs, what connects, and what stays on your device.',
  whyLi1Strong: 'Firewall protection',
  whyLi1Rest: ' — decide exactly which apps may reach the internet, app by app.',
  whyLi2Strong: 'Ad blocker',
  whyLi2Rest: ' — block ads system-wide, in every app and every browser.',
  whyP2Before:
    'Rooting also opens the door to custom ROMs, deep debloating, real backups, and automation that stock Android refuses to run. New to rooting? Read the ',
  whyLinkRooting: 'rooting guide',
  whyP2And: ' and our ',
  whyLinkRisk: 'rooting & unlocking risk disclosure',
  whyP2End: ' first.',
  whyImgAlt:
    'Illustration of the green SU superhero Android robot projecting a glowing energy shield that blocks sparks from a brick wall — firewall protection and ad blocking with root access',
  gaH2: 'Guardian Angel',
  gaP1:
    "Parental device management for your family. You install Guardian Angel on your child's device and configure it yourself — it runs quietly in the background and reports back to you. Start free and upgrade when you need more.",
  gaExplore: 'Explore Guardian Angel',
  gaDownload: 'Download Guardian Angel',
  gaImgAlt:
    'Illustration of the Guardian Angel — the green Android robot with a golden halo — standing protectively beside a smartphone showing app usage statistics',
  gaFreeLi1: 'Short-term usage statistics of every app',
  gaFreeLi2: 'DNS-based ad blocker',
  gaFreeLi3: 'Cleanup and maintenance',
  gaLiteLi1: 'Read installed apps',
  gaLiteLi2: 'Read messages',
  gaLiteLi3: 'Cover up to 5 devices',
  gaProLi1: 'Everything in Lite',
  gaProLi2: 'Read call logs',
  gaProLi3: 'View photos & media',
  gaProLi4: 'View camera & video',
  rootzH2: 'Rootz',
  rootzP1:
    'The power-user toolkit for your own device. Everything the stock system hides from you — profiling, automation, logs, firewall, files, and a real terminal — in one place. The free tier is already a full toolbox; Rootz Pro adds the professional instruments.',
  rootzExplore: 'Explore Rootz',
  rootzDownload: 'Download Rootz',
  rootzNewBefore: 'New to rooting? Read the ',
  rootzLinkGuide: 'rooting guide',
  rootzNewEnd: ' first.',
  rootzImgAlt:
    'Illustration of Colonel Su — the wise green Android robot of Rootz Pro, bearded and robed, holding an SU staff in front of a glowing terminal window — Rootz Pro professional tools',
  rootzFreeLi1: 'System profiler',
  rootzFreeLi2: 'Task manager & automation',
  rootzFreeLi3: 'Logcat reader',
  rootzFreeLi4: 'Firewall manager',
  rootzFreeLi5: 'Battery monitor',
  rootzFreeLi6: 'Terminal editor',
  rootzFreeLi7: 'File explorer / manager',
  rootzFreeLi8: 'APK installer',
  rootzFreeLi9: 'Key mapper',
  rootzProLi1: 'Log Analysis',
  rootzProLi2: 'AI harness — coming soon',
  rootzProLi3: 'Archive manager, VNC, RDP — coming soon',
  faqH2: 'Frequently asked questions',
  // FAQ entries render visibly AND feed the FAQPage JSON-LD — per locale,
  // the two stay text-identical (structured data mirrors copy).
  faqItems: [
    {
      q: 'What does it mean to root an Android phone?',
      a: 'Rooting gives you superuser (root) access to your own Android device — the same level of control the system itself has. With root access you can remove pre-installed bloatware, install custom ROMs, run a real firewall, and use powerful tools that stock Android blocks.',
    },
    {
      q: 'Why should I root my Android?',
      a: 'The two benefits our users care about most are firewall protection — deciding exactly which apps may talk to the internet — and a system-wide ad blocker that works in every app, not just the browser. Rooting also lets you debloat the phone, tune performance, and back up anything.',
    },
    {
      q: 'What is Rootz?',
      a: 'Rootz is our power-user toolkit for your own device. The free tier includes a system profiler, a task manager and automation, a logcat reader, a firewall manager, a battery monitor, a terminal editor, a file explorer and manager, an APK installer, and a key mapper. Rootz Pro adds Log Analysis today, with an AI harness, an archive manager, VNC, and RDP coming soon.',
    },
    {
      q: 'What is Guardian Angel?',
      a: "Guardian Angel is our parental device-management app: you install and configure it on your child's device yourself. The free tier includes short-term usage statistics of every app, a DNS-based ad blocker, and cleanup and maintenance. Guardian Angel Lite adds reading installed apps and messages; Pro adds call logs, photos & media, and camera & video — covering up to 5 devices per account.",
    },
    {
      q: 'Do I need to install anything to scan my phone?',
      a: 'No. The scan runs entirely in a WebUSB-capable desktop browser: connect your Android device with a USB cable and the scan talks to it over ADB. There is nothing to install on your computer or your phone.',
    },
    {
      q: 'Does the scan change anything on my phone?',
      a: 'No. The scan is strictly read-only: it reads device properties (brand, build, bootloader and root indicators) over ADB and never writes, flashes, or modifies anything. Nothing leaves your computer unless you explicitly save the report to an account number.',
    },
    {
      q: 'Do I need an account to scan?',
      a: 'No. The device scan is free and works without an account, an email, or a password. A Mullvad-style account number is only needed if you want to save your scan report or subscribe to a plan.',
    },
    {
      q: 'Does rooting void my warranty?',
      a: "It can. Unlocking the bootloader may void the manufacturer's warranty depending on the manufacturer and your jurisdiction, and unlocking factory-resets the device — so back up first. Our Terms of Service include the full rooting & unlocking risk disclosure.",
    },
  ],
  faqCloseBefore: 'Both apps are covered by our ',
  faqLinkTerms: 'Terms of Service',
  faqCloseAnd: ', including the full ',
  faqLinkRisk: 'rooting & unlocking risk disclosure',
  faqCloseEnd: '.',
  agentsH2: 'Building an AI agent?',
  agentsP1:
    'Root My Android is built to be driven by software, not just visited by people. A public REST API and a Model Context Protocol (MCP) server expose accounts, subscription plans, card & crypto checkout, vouchers, payment status, and human support — no API key, no registration — no email or conventional signup identity is required.',
  agentsGuide: 'Read the agent guide',
  agentsMcp: 'Open the /mcp tool catalog',
}

export default home
