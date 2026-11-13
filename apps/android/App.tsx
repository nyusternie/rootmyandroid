/**
 * Root My Android (Android edition) — device scan, paired Guardian devices,
 * encrypted backups, and tools.
 *
 * Dark, minimal UI matching rootmyandroid.com. Talks to the API at
 * rootmyandroid.com/v1. Backups are encrypted client-side with a user-held
 * key before upload; the API only ever sees ciphertext.
 *
 * Account lives behind the top-right header button (modal), not a tab.
 * The header carries the Guru⚡ balance chip (mock value until billing is
 * wired to the API — owner ruling 2026-11-13: billing is now inference-
 * based; the site brands the AI-usage balance "Guru Balance", USD).
 * The device scan and backup audit run for real via the native modules
 * (ScanModule + AuditModule) and the scan.ts rules engine; Devices and
 * Tools data is mocked for now; further API wiring comes from the /v1 API.
 *
 * Styled with NativeWind (tailwind.config.js ↔ rootzColors in
 * packages/shared/src/theme.ts).
 *
 * @format
 */

import './global.css';
import React, { useRef, useState } from 'react';
import {
  Modal,
  NativeModules,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'scan' | 'devices' | 'backups' | 'tools';

// Shared Rootz/Guardian palette (packages/shared/src/theme.ts) — single
// source of truth for app + web colors (dynamic props only; static styling
// lives in NativeWind classes).
import { rootzColors as colors } from 'rootmyandroid-shared';
// Scan rules engine (scan.ts): same rules as the web /scan
// (apps/web/src/lib/scan-report.ts), fixture-tested in jest.
import {
  analyzeScan,
  bootloaderLabel,
  bootloaderTone,
  integrityTone,
  parseGetprop,
  type ScanResult,
} from './scan';
// Vector icons (react-native-svg): SU-robot brand glyph + web-footer
// stroke family, shared theme colors.
import { BrandIcon, NavIcon, UserIcon, type NavIconName } from './icons';
// Lottie wire-up demo (owner request 2026-11-13 — first of many
// animations): scan-reticle sweep on the main screen; brand-authored
// asset, not a stock file. Speeds up while a scan runs.
import LottieView from 'lottie-react-native';
import scanSweep from './assets/scan-sweep.json';

/** Mock Guru Balance until billing is wired to the API — owner
 * ruling 2026-11-13: billing is now inference-based, displayed unit-less
 * with 6 decimals, last 4 superscript (value PEGGED TO USD). "Guru⚡"
 * matches the site's established "Guru Balance" vocabulary (balanceUsd,
 * pay-per-use with the price shown before each request). */
const MOCK_GURU_BALANCE_USD = '12.400000';

/**
 * Mock plan tiers (owner ruling 2026-11-05) until checkout is wired to the
 * API. Server-side source of truth: the MCP list_subscription_plans tool
 * and its REST equivalent. Guardian Angel features are cumulative — Pro
 * includes everything in Lite; Rootz Pro is a separate lane (no switching).
 */
const MOCK_PLANS = [
  {
    id: 'guardian-lite',
    label: 'Guardian Angel Lite',
    price: '$5',
    period: '30 days',
    features: ['Read apps', 'Read messages'],
  },
  {
    id: 'guardian-pro',
    label: 'Guardian Angel Pro',
    price: '$15',
    period: '30 days',
    features: [
      'Everything in Lite',
      'Read call logs',
      'View media',
      'View camera / video',
      'Real-time device monitoring',
      '"Smart" triggers (API-gated)',
    ],
  },
  {
    id: 'rootz-pro',
    label: 'Rootz Pro',
    price: '$15',
    period: '365 days',
    features: ['Terminal Editor', 'Log Analysis'],
  },
];

function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <SafeAreaProvider>
      {/* RN 0.88 types omit StatusBar's Android-only backgroundColor; spread-cast keeps the runtime behavior. */}
      <StatusBar barStyle="light-content" {...({ backgroundColor: colors.bg } as object)} />
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between border-b border-border px-5 pb-3 pt-5">
          {/* Owner ruling 2026-11-13: the header shows the SU-robot brand
              icon instead of the wordmark. */}
          <BrandIcon size={26} />
          <BillingChip balance={MOCK_GURU_BALANCE_USD} onPress={() => setAccountOpen(true)} />
          {/* Owner ruling 2026-11-13: the Account button is an icon. */}
          <TouchableOpacity
            className="rounded-lg border border-accent p-2"
            onPress={() => setAccountOpen(true)}
            accessibilityLabel="Account"
          >
            <UserIcon color={colors.accent} size={20} />
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
          {tab === 'scan' && <ScanScreen />}
          {tab === 'devices' && <DevicesScreen />}
          {tab === 'backups' && <BackupsScreen />}
          {tab === 'tools' && <ToolsScreen />}
        </ScrollView>

        <View className="flex-row border-t border-border bg-panel">
          <TabButton label="Scan" icon="scan" active={tab === 'scan'} onPress={() => setTab('scan')} />
          <TabButton label="Devices" icon="devices" active={tab === 'devices'} onPress={() => setTab('devices')} />
          <TabButton label="Backups" icon="backups" active={tab === 'backups'} onPress={() => setTab('backups')} />
          <TabButton label="Tools" icon="tools" active={tab === 'tools'} onPress={() => setTab('tools')} />
        </View>

        <Modal
          visible={accountOpen}
          animationType="slide"
          onRequestClose={() => setAccountOpen(false)}
        >
          <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
            <View className="flex-row items-center justify-between border-b border-border px-5 pb-3 pt-5">
              <Text className="text-xl font-bold text-text">Account</Text>
              <TouchableOpacity
                className="rounded-lg border border-accent px-3 py-1.5"
                onPress={() => setAccountOpen(false)}
              >
                <Text className="text-sm font-semibold text-accent">Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
              <AccountScreen />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function BillingChip({ balance, onPress }: { balance: string; onPress: () => void }) {
  // Owner ruling 2026-11-13: 6 decimals, last 4 superscript AND RAISED —
  // nested Text sits on the shared baseline (bottom-aligned), so the pair
  // renders as a row View with items-start: both tops flush = the small
  // digits ride at the top of the number.
  const main = balance.slice(0, -4);
  const sup = balance.slice(-4);
  return (
    <TouchableOpacity className="mx-3.5 flex-1 flex-row items-center justify-center" onPress={onPress}>
      <Text className="mr-2 text-[10px] font-bold tracking-[1px] text-faint">Guru⚡</Text>
      <View className="flex-row items-start">
        <Text className="text-[13px] font-bold text-accent">{main}</Text>
        <Text className="mt-[1px] text-[8px] font-bold text-accent">{sup}</Text>
      </View>
    </TouchableOpacity>
  );
}

// Bottom-nav icons (owner request 2026-11-13: the text-only tabs were too
// flat and hard to tap — vector SVG icons give each tab height and a
// bigger touch target; owner follow-up: SVG icons, NOT emoji, all in the
// shared theme colors).
function TabButton({ label, icon, active, onPress }: { label: string; icon: NavIconName; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      className={`flex-1 items-center py-2 ${active ? 'border-t-2 border-accent' : ''}`}
      onPress={onPress}
    >
      <NavIcon name={icon} color={active ? colors.accent : colors.muted} size={22} />
      <Text className={`mt-0.5 text-[11px] font-medium ${active ? 'text-text' : 'text-muted'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="mb-4 rounded-xl border border-border bg-panel p-4">
      {title ? <Text className="mb-2.5 text-[15px] font-semibold text-text">{title}</Text> : null}
      {children}
    </View>
  );
}

function Row({ label, value, tone, wide }: { label: string; value: string; tone?: 'good' | 'warn'; wide?: boolean }) {
  const valueColor = tone === 'good' ? colors.good : tone === 'warn' ? colors.warn : colors.text;
  // wide: full-width stacked label + value — for long values (fingerprints)
  // that would wrap into a squeezed flex-row sliver.
  if (wide) {
    return (
      <View className="py-1.5">
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="mt-0.5 text-sm font-medium" style={{ color: valueColor }} selectable>
          {value.replace(/([:/])/g, '$1\u200b')}
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="text-sm font-medium" style={{ color: valueColor }}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity className="mt-1 items-center rounded-[10px] bg-accent py-3.5" onPress={onPress}>
      <Text className="text-base font-semibold text-white">{label}</Text>
    </TouchableOpacity>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity className="mt-3 items-center rounded-[10px] border border-border py-3.5" onPress={onPress}>
      <Text className="text-base font-semibold text-text">{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ label, pro }: { label: string; pro?: boolean }) {
  return (
    <Text
      className={`overflow-hidden rounded-md px-2 py-0.5 text-[11px] font-bold ${
        pro ? 'bg-accentDim text-accent' : 'bg-border text-muted'
      }`}
    >
      {label}
    </Text>
  );
}

type AuditPackageEntry = {
  package: string;
  label: string;
  allow_backup: boolean;
  system_app: boolean;
  target_sdk: number;
};

type AuditSnapshot = {
  os: string;
  build_fingerprint: string;
  counts: {
    installed_total: number;
    user_apps: number;
    participating: number;
    excluded: number;
  };
  packages: AuditPackageEntry[];
};

type AuditSummary = {
  participating: number;
  excluded: number;
  userApps: number;
  excludedLabels: string[];
};

// Native module (android/app/.../AuditModule.kt): PackageManager backup
// participation scan + persisted audit device id. Undefined under jest.
const AuditModule = NativeModules.AuditModule as {
  collectBackupAudit(): Promise<AuditSnapshot>;
  getDeviceId(): Promise<string>;
  getDeviceName(): Promise<string>;
};

// Native module (android/app/.../ScanModule.kt): raw device facts for the
// scan.ts rules engine. Undefined under jest.
const ScanModule = NativeModules.ScanModule as {
  collectScan(): Promise<{
    getpropText: string;
    suPath: string | null;
    rootPackages: string[];
  }>;
};

const API_BASE = 'https://rootmyandroid.com/v1';

function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [auditError, setAuditError] = useState('');
  const [auditAccount, setAuditAccount] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncOk, setSyncOk] = useState(false);
  const auditSnapshot = useRef<AuditSnapshot | null>(null);

  // Real scan: raw device facts from the native ScanModule, mapped through
  // the scan.ts rules engine (same rules as the web /scan; absent values
  // render "unknown" — never a guess). READ-ONLY on the device.
  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanError('');
    try {
      const raw = await ScanModule.collectScan();
      setResult(
        analyzeScan({
          getprop: parseGetprop(raw.getpropText ?? ''),
          suPath: raw.suPath ?? null,
          rootPackages: raw.rootPackages ?? [],
        }),
      );
    } catch (e: any) {
      setScanError(e?.message || 'Scan failed on this device.');
    } finally {
      setScanning(false);
    }
  };

  // Real scan: backup participation of every installed app, read from the OS.
  const runAudit = async () => {
    if (auditing) return;
    setAuditing(true);
    setAuditError('');
    setSyncMsg('');
    try {
      const snapshot = await AuditModule.collectBackupAudit();
      auditSnapshot.current = snapshot;
      const excludedLabels = snapshot.packages
        .filter((p) => !p.allow_backup && !p.system_app)
        .map((p) => p.label)
        .sort();
      setAudit({
        participating: snapshot.counts.participating,
        excluded: snapshot.counts.excluded,
        userApps: snapshot.counts.user_apps,
        excludedLabels,
      });
    } catch (e: any) {
      setAuditError(e?.message || 'Backup audit failed on this device.');
    } finally {
      setAuditing(false);
    }
  };

  // Sync the collected snapshot to the account as audit_type "backup".
  const syncAudit = async () => {
    if (syncing || !auditSnapshot.current) return;
    const accountNumber = auditAccount.replace(/\s/g, '');
    if (!/^\d{16}$/.test(accountNumber)) {
      setSyncOk(false);
      setSyncMsg('Enter the 16-digit account number.');
      return;
    }
    setSyncing(true);
    setSyncMsg('');
    try {
      const [deviceId, deviceName] = await Promise.all([
        AuditModule.getDeviceId(),
        AuditModule.getDeviceName(),
      ]);
      const res = await fetch(`${API_BASE}/device/audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account_number: accountNumber,
          device_id: deviceId,
          audit_type: 'backup',
          device_name: deviceName,
          collected_at: new Date().toISOString(),
          snapshot: auditSnapshot.current,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setSyncOk(true);
        setSyncMsg('Synced. The audit is on your account — view it at rootmyandroid.com/audit.');
      } else if (res.status === 404) {
        setSyncOk(false);
        setSyncMsg('Account not found. Check the number and try again.');
      } else if (res.status === 400) {
        setSyncOk(false);
        setSyncMsg('That does not look like a valid 16-digit account number.');
      } else {
        setSyncOk(false);
        setSyncMsg(body?.error || 'Could not sync the audit. Please try again.');
      }
    } catch {
      setSyncOk(false);
      setSyncMsg('Network error. Is the device online?');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View>
      <Text className="mb-1.5 text-2xl font-bold text-text">Device scan</Text>
      <Text className="mb-4 text-sm leading-5 text-muted">
        Analyze this device to plan a root or upgrade. Scanning is free.
      </Text>
      {/* Lottie wire-up demo (owner 2026-11-13): ambient scan sweep that
          runs 2x speed while a scan is in flight. */}
      <LottieView
        source={scanSweep}
        autoPlay
        loop
        speed={scanning ? 2 : 1}
        style={{ width: 120, height: 120, alignSelf: 'center' }}
      />
      <Panel title="Device">
        <Row label="Model" value={result?.model ?? '—'} />
        <Row label="Android" value={result?.android ?? '—'} />
        <Row label="Build" value={result?.build ?? '—'} />
        <Row
          label="Bootloader"
          value={result ? bootloaderLabel(result.bootloader) : '—'}
          tone={result ? bootloaderTone(result.bootloader) : undefined}
        />
        {result ? (
          <Text className="mt-1.5 text-xs leading-[17px] text-faint">
            verifiedbootstate={result.verifiedBootState}
            {result.oemUnlockAllowed === null
              ? ''
              : ` · oem_unlock_allowed=${result.oemUnlockAllowed ? 1 : 0}`}
            {'\n'}
            {result.bootloaderEvidence.join(' · ') || 'no bootloader props exposed'}
          </Text>
        ) : null}
      </Panel>
      <Panel title="Root status">
        <Row
          label="Rooted"
          value={result ? (result.rooted ? 'Yes' : 'No') : '—'}
          tone={result ? (result.rooted ? 'good' : 'warn') : undefined}
        />
        <Row
          label="Integrity"
          value={result?.integrity ?? '—'}
          tone={result ? integrityTone(result.integrity) : undefined}
        />
        {result && result.rootedEvidence.length > 0 ? (
          <Text className="mt-1.5 text-xs leading-[17px] text-faint">{result.rootedEvidence.join('\n')}</Text>
        ) : null}
        {result ? (
          <Text className="mt-1.5 text-xs leading-[17px] text-faint">
            Integrity is derived from bootloader state on-device — not a Play Integrity verdict.
          </Text>
        ) : null}
      </Panel>
      {result ? (
        <Panel title="Build details">
          <Row label="Manufacturer" value={result.manufacturer} />
          <Row label="Codename" value={result.codename} />
          <Row label="Brand" value={result.brand} />
          <Row label="Hardware" value={result.hardware} />
          <Row label="ABI" value={result.abi} />
          <Row label="Build tags" value={result.buildTags} />
          <Row
            label="Security patch"
            value={
              result.securityPatch
                ? `${result.securityPatch} (${result.patchAgeDays === null ? 'age unknown' : `${result.patchAgeDays} days old`})`
                : 'unknown'
            }
          />
          <Row label="Fingerprint" value={result.fingerprint} wide />
        </Panel>
      ) : null}
      <PrimaryButton label={scanning ? 'Scanning…' : 'Run scan'} onPress={runScan} />
      <Text className="mt-3.5 text-xs leading-[17px] text-faint">
        Scanning runs on-device. Nothing is sent until you choose to back up.
      </Text>
      {scanError ? <Text className="mt-2 text-xs leading-[17px]" style={{ color: colors.warn }}>{scanError}</Text> : null}
      {result ? (
        <Panel title={`Device properties (${Object.keys(result.props).length})`}>
          {/* Fixed height so the list can't be squeezed away by sibling
              content (the Rootz app's measured layout lesson, 2026-11-09).
              nestedScrollEnabled: this ScrollView sits inside the tab's
              outer ScrollView — without it Android swallows the scroll
              gestures (owner report: the list was not scrollable).
              One row per property, alternating backgrounds. */}
          <ScrollView
            className="border border-border bg-inset"
            nestedScrollEnabled
            style={{ height: 280 }}
          >
            {Object.keys(result.props)
              .sort()
              .map((k, i) => (
                <View key={k} className={`px-2 py-[3px] ${i % 2 === 1 ? 'bg-panel' : ''}`}>
                  <Text className="font-mono text-[10px] leading-[14px] text-muted" selectable>
                    {k} = {result.props[k]}
                  </Text>
                </View>
              ))}
          </ScrollView>
          <Text className="mt-2 text-xs leading-[17px] text-faint">
            Full getprop dump, read-only from the device. Nothing here leaves the phone.
          </Text>
        </Panel>
      ) : null}
      <Panel title="Backup audit">
        <Text className="mb-4 text-sm leading-5 text-muted">
          Which installed apps are covered by Android backup, and which opted
          out entirely. Read live from the OS — no root required.
        </Text>
        <PrimaryButton label={auditing ? 'Auditing…' : 'Run backup audit'} onPress={runAudit} />
        {auditError ? <Text className="mt-3.5 text-xs leading-[17px]" style={{ color: colors.warn }}>{auditError}</Text> : null}
        {audit ? (
          <View>
            <Row label="Participating in backup" value={String(audit.participating)} tone="good" />
            <Row label="Not covered at all" value={String(audit.excluded)} tone="warn" />
            <Row label="Third-party apps installed" value={String(audit.userApps)} />
            {audit.excludedLabels.length > 0 ? (
              <Text className="mt-3.5 text-xs leading-[17px] text-faint">
                Opted out of backup: {audit.excludedLabels.slice(0, 12).join(', ')}
                {audit.excludedLabels.length > 12 ? ` +${audit.excludedLabels.length - 12} more` : ''}
              </Text>
            ) : null}
            <Text className="mt-3.5 text-xs leading-[17px] text-faint">
              Sync this audit to your account number to see it at rootmyandroid.com/audit.
            </Text>
            <TextInput
              className="mb-1 mt-2 rounded-[10px] border border-border px-3.5 py-3 text-[15px] text-text"
              placeholder="1234 5678 9012 3456"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              value={auditAccount}
              onChangeText={setAuditAccount}
            />
            <PrimaryButton label={syncing ? 'Syncing…' : 'Sync audit to account'} onPress={syncAudit} />
            {syncMsg ? (
              <Text className="mt-3.5 text-xs leading-[17px]" style={{ color: syncOk ? colors.good : colors.warn }}>{syncMsg}</Text>
            ) : null}
          </View>
        ) : null}
      </Panel>
    </View>
  );
}

const mockDevices = [
  { name: 'Pixel 5', detail: '•••• 9434 · synced 2 days ago', pro: true },
  { name: 'Pixel 3', detail: '•••• 1027 · synced 3 weeks ago', pro: false },
];

function DevicesScreen() {
  return (
    <View>
      <Text className="mb-1.5 text-2xl font-bold text-text">Devices</Text>
      <Text className="mb-4 text-sm leading-5 text-muted">
        Guardian devices synced to this account. Pairing is done from the
        Guardian app on the managed device.
      </Text>
      <Panel title="Paired devices">
        {mockDevices.map((d) => (
          <View key={d.name} className="flex-row items-center py-2">
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text">{d.name}</Text>
              <Text className="mt-0.5 text-[13px] text-muted">{d.detail}</Text>
            </View>
            <Badge label={d.pro ? 'PRO' : 'FREE'} pro={d.pro} />
          </View>
        ))}
      </Panel>
      <PrimaryButton label="Pair a new device" />
      <Text className="mt-3.5 text-xs leading-[17px] text-faint">
        Open Guardian on the device you want to manage and enter this
        account's 16-digit number.
      </Text>
    </View>
  );
}

function AccountScreen() {
  return (
    <View>
      <Text className="mb-4 text-sm leading-5 text-muted">
        Mullvad-style: a 16-digit account number, no email, no personal data.
      </Text>
      <Panel title="Your account">
        <Row label="Account number" value="1327 3076 2982 9434" />
        <Row label="Storage used" value="1.2 GB of 5 GB" />
      </Panel>
      <Panel title="Plan time">
        <Row label="Balance" value="34 days" />
        <Row label="Renewal" value="None — top up anytime" />
      </Panel>
      {MOCK_PLANS.map((plan) => (
        <Panel key={plan.id} title={`${plan.label} — ${plan.price} / ${plan.period}`}>
          {plan.features.map((feature) => (
            <Row key={feature} label="•" value={feature} />
          ))}
        </Panel>
      ))}
      <PrimaryButton label="Top up — from $5" />
      <GhostButton label="Create new account" />
      <Text className="mt-3.5 text-xs leading-[17px] text-faint">
        Plans are top-up subscriptions: add time whenever you like — no
        auto-renewal, no stored card. Your account number is the only
        credential. Keep it safe — it cannot be recovered.
      </Text>
    </View>
  );
}

function BackupsScreen() {
  return (
    <View>
      <Text className="mb-1.5 text-2xl font-bold text-text">Backups</Text>
      <Text className="mb-4 text-sm leading-5 text-muted">
        Encrypted on this device with a key only you hold. We can't read or
        recover them.
      </Text>
      <Panel title="Storage">
        <Row label="Used" value="1.2 GB" />
        <Row label="Included" value="5 GB" />
      </Panel>
      <Panel title="Backups">
        <View className="flex-row items-center py-2">
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-text">Full backup</Text>
            <Text className="mt-0.5 text-[13px] text-muted">Oct 15, 2026 · 1.2 GB · encrypted</Text>
          </View>
        </View>
      </Panel>
      <PrimaryButton label="New backup" />
    </View>
  );
}

function ToolRow({ name, desc, pro }: { name: string; desc: string; pro?: boolean }) {
  return (
    <TouchableOpacity className="flex-row items-center py-2.5">
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-[15px] font-semibold text-text">{name}</Text>
          {pro ? <Badge label="PRO" pro /> : null}
        </View>
        <Text className="mt-0.5 text-[13px] leading-[18px] text-muted">{desc}</Text>
      </View>
      <Text className="ml-3 text-[22px] text-faint">›</Text>
    </TouchableOpacity>
  );
}

function ToolsScreen() {
  return (
    <View>
      <Text className="mb-1.5 text-2xl font-bold text-text">Tools</Text>
      <Text className="mb-4 text-sm leading-5 text-muted">
        Advanced features. PRO tools require time credit on your account.
      </Text>
      <Panel title="Root & ROM">
        <ToolRow
          name="OTA survival assistant"
          desc="Re-apply root and modules after an OTA update."
          pro
        />
        <ToolRow
          name="Integrity auditor"
          desc="Audit root, SELinux, and Play Integrity status."
        />
        <ToolRow
          name="ROM catalog"
          desc="Browse ROMs for this device on rootmyandroid.com."
        />
      </Panel>
      <Panel title="Device health">
        <ToolRow
          name="Health monitor"
          desc="Battery, thermal, and storage health trends."
        />
        <ToolRow
          name="Storage manager"
          desc="Analyze disk usage and reclaim space."
        />
      </Panel>
    </View>
  );
}

export default App;
