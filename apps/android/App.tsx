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
import React, { useEffect, useRef, useState } from 'react';
import {
  DeviceEventEmitter,
  Linking,
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
import { BrandIcon, NavIcon, QrIcon, UserIcon, type NavIconName } from './icons';
import { RQrScanView } from './qr-scan-view';
// Build-flavor flag (owner ruling 2026-11-13 — F-Droid policy): the fdroid
// flavor resolves this to IS_FDROID_BUILD=true via metro.config.js and the
// billing/PRO surface below disappears (everything free). Appstore/sideload
// builds keep the base module (false).
import { IS_FDROID_BUILD } from './build-flavor';
// Lottie wire-up demo (owner request 2026-11-13 — first of many
// animations): subtle brand-authored micro-animations beside each tab
// screen's title (owner follow-up: animations MUST BE subtle — small,
// slow; the big centered sweep was removed). Each asset is drawn to its
// tab: reticle sweep (scan), sync dots (devices), breathing shield
// (backups), blinking terminal cursor (tools).
import LottieView from 'lottie-react-native';
import scanSweep from './assets/scan-sweep.json';
import devicesTitle from './assets/devices-title.json';
import backupsTitle from './assets/backups-title.json';
import toolsTitle from './assets/tools-title.json';

/** Screen title with its subtle companion animation. The JSON import's
 * inferred object type matches Lottie's AnimationObject shape; the cast
 * keeps tsc happy without pulling the lib's internal types. */
function ScreenTitle({ title, animation }: { title: string; animation: object }) {
  return (
    <View className="mb-1.5 flex-row items-center gap-2">
      <Text className="text-2xl font-bold text-text">{title}</Text>
      <LottieView source={animation as never} autoPlay loop speed={0.6} style={{ width: 20, height: 20 }} />
    </View>
  );
}

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
  // QR scanner (owner request 2026-11-13 — "wire-up qr scanning; we will
  // use this to SYNC WITH WEB (ALT CLIENTS)"): camera permission first,
  // then a full-screen modal hosting the native QrScanView. Decoded
  // values arrive as onQrResult DeviceEvents and are shown in the modal
  // footer; the actual pairing protocol ships next.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrResult, setQrResult] = useState('');
  // Pairing mode: the same scanner either shows the decoded value (header
  // button) or saves it as a paired device (Devices → Pair a new device).
  const [qrPairing, setQrPairing] = useState(false);

  // Account number (raw digits) — the only credential. Persisted in
  // app-private prefs so a restart does not lose it.
  const [accountNumber, setAccountNumber] = useState('');
  // Devices paired on THIS phone (scanned pairing code → stored locally).
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);

  useEffect(() => {
    AuditModule?.getPref?.(PREF_ACCOUNT)
      .then((v) => {
        if (v) setAccountNumber(v);
      })
      .catch(() => {});
    AuditModule?.getPref?.(PREF_DEVICES)
      .then((v) => {
        if (!v) return;
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) setPairedDevices(parsed);
      })
      .catch(() => {});
  }, []);

  // Stored form is DIGITS ONLY (the API normalizes too); display formatting
  // is applied by formatAccount at render time.
  const persistAccount = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    setAccountNumber(digits);
    AuditModule?.setPref?.(PREF_ACCOUNT, digits).catch(() => {});
  };

  const persistDevices = (next: PairedDevice[]) => {
    setPairedDevices(next);
    AuditModule?.setPref?.(PREF_DEVICES, JSON.stringify(next)).catch(() => {});
  };

  const openQrScan = async (pairing = false) => {
    try {
      const granted = await NativeModules.QrScan?.requestCameraPermission?.();
      if (granted) {
        setQrResult('');
        setQrPairing(pairing);
        setQrOpen(true);
      }
    } catch {
      // Permission flow unavailable/denied — nothing to open.
    }
  };

  useEffect(() => {
    if (!qrOpen) return;
    const subscription = DeviceEventEmitter.addListener('onQrResult', (e: { value?: string }) => {
      if (e?.value) setQrResult(e.value);
    });
    return () => subscription.remove();
  }, [qrOpen]);

  // Pairing: a decoded code becomes a device entry on this phone. The label
  // is derived from the code (URL host when it is a URL, else the code
  // itself); duplicates are ignored.
  const pairDevice = () => {
    if (!qrResult) return;
    const label = (() => {
      try {
        return new URL(qrResult).host || qrResult.slice(0, 32);
      } catch {
        return qrResult.slice(0, 32);
      }
    })();
    if (pairedDevices.some((d) => d.id === qrResult)) return;
    persistDevices([
      ...pairedDevices,
      { id: qrResult, label, paired_at: new Date().toISOString() },
    ]);
    setQrOpen(false);
  };

  const removeDevice = (id: string) => persistDevices(pairedDevices.filter((d) => d.id !== id));

  return (
    <SafeAreaProvider>
      {/* RN 0.88 types omit StatusBar's Android-only backgroundColor; spread-cast keeps the runtime behavior. */}
      <StatusBar barStyle="light-content" {...({ backgroundColor: colors.bg } as object)} />
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between border-b border-border px-5 pb-3 pt-5">
          {/* Owner ruling 2026-11-13: the header shows the SU-robot brand
              icon instead of the wordmark — LARGER per owner follow-up. */}
          <BrandIcon size={36} />
          {/* Owner rulings 2026-11-13: the Guru⚡ chip sits top-right (left
              of the profile button); the QR scanner button sits DIRECTLY
              left of the profile button; the profile button loses its
              border. */}
          <View className="flex-row items-center gap-2">
            {/* fdroid flavor: no billing chip — a mock balance display is a
                fake-payment surface; F-Droid builds show everything free
                (owner ruling 2026-11-13). */}
            {!IS_FDROID_BUILD && (
              <BillingChip balance={MOCK_GURU_BALANCE_USD} onPress={() => setAccountOpen(true)} />
            )}
            <TouchableOpacity
              className="p-2"
              onPress={openQrScan}
              accessibilityLabel="Scan QR to sync with web"
            >
              <QrIcon color={colors.accent} size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              className="p-2"
              onPress={() => setAccountOpen(true)}
              accessibilityLabel="Account"
            >
              <UserIcon color={colors.accent} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
          {tab === 'scan' && <ScanScreen accountNumber={accountNumber} onAccountChange={persistAccount} />}
          {tab === 'devices' && (
            <DevicesScreen
              devices={pairedDevices}
              onPair={() => openQrScan(true)}
              onRemove={removeDevice}
            />
          )}
          {tab === 'backups' && <BackupsScreen accountNumber={accountNumber} />}
          {tab === 'tools' && (
            <ToolsScreen
              onOpenStorage={() => setTab('backups')}
              onOpenScan={() => setTab('scan')}
            />
          )}
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
              <AccountScreen accountNumber={accountNumber} onAccountChange={persistAccount} />
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* QR scanner modal — camera preview + decoded value footer. The
            native view starts the camera on attach and stops on detach.
            SafeAreaView: like the Account modal, the scanner is its own
            full-screen window (edge-to-edge builds draw under the system
            bars) — without it the camera bleeds into the status bar
            (owner report 2026-11-15: "top of the camera screen is bleeding
            into the system's UI"). */}
        <Modal visible={qrOpen} animationType="fade" onRequestClose={() => setQrOpen(false)}>
          <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
            <View className="flex-row items-center justify-between border-b border-border px-5 pb-3 pt-5">
              <Text className="text-xl font-bold text-text">
                {qrPairing ? 'Pair a device' : 'Scan to sync with web'}
              </Text>
              <TouchableOpacity className="px-3 py-1.5" onPress={() => setQrOpen(false)}>
                <Text className="text-sm font-semibold text-accent">Close</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-1">
              <RQrScanView style={{ flex: 1 }} />
            </View>
            <View className="border-t border-border bg-panel p-5">
              {qrResult ? (
                <>
                  <Text className="text-xs uppercase tracking-[0.14em] text-faint">Scanned</Text>
                  <Text className="mt-1 font-mono text-sm text-text" selectable>
                    {qrResult}
                  </Text>
                  {qrPairing ? (
                    <>
                      <PrimaryButton label="Save as paired device" onPress={pairDevice} />
                      <Text className="mt-2 text-xs leading-[17px] text-muted">
                        The device is stored on this phone. Nothing is uploaded.
                      </Text>
                    </>
                  ) : (
                    <Text className="mt-2 text-xs leading-[17px] text-muted">
                      Decoded on-device. Use Devices → Pair a new device to save a code as a
                      paired device.
                    </Text>
                  )}
                </>
              ) : (
                <Text className="text-sm leading-5 text-muted">
                  Point the camera at the QR code shown by the web client.
                </Text>
              )}
            </View>
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

/**
 * Filled action button. F-Droid gate 10 (mezinster's recurring finding, twice
 * on sidecoin): a control that renders tappable but does nothing is a review
 * finding. A button without a handler renders inert (muted, bordered,
 * non-pressable) and carries a note saying why.
 */
function PrimaryButton({ label, onPress, note }: { label: string; onPress?: () => void; note?: string }) {
  const inert = typeof onPress !== 'function';
  return (
    <View>
      <TouchableOpacity
        className={`mt-1 items-center rounded-[10px] py-3.5 ${inert ? 'border border-border bg-panel' : 'bg-accent'}`}
        onPress={onPress}
        disabled={inert}
        accessibilityState={{ disabled: inert }}
      >
        <Text className={`text-base font-semibold ${inert ? 'text-muted' : 'text-white'}`}>{label}</Text>
      </TouchableOpacity>
      {note ? <Text className="mt-2 text-xs leading-[17px] text-faint">{note}</Text> : null}
    </View>
  );
}

/** Outlined secondary action — same inert rule as PrimaryButton. */
function GhostButton({ label, onPress, note }: { label: string; onPress?: () => void; note?: string }) {
  const inert = typeof onPress !== 'function';
  return (
    <View>
      <TouchableOpacity
        className="mt-3 items-center rounded-[10px] border border-border py-3.5"
        onPress={onPress}
        disabled={inert}
        accessibilityState={{ disabled: inert }}
      >
        <Text className={`text-base font-semibold ${inert ? 'text-muted' : 'text-text'}`}>{label}</Text>
      </TouchableOpacity>
      {note ? <Text className="mt-2 text-xs leading-[17px] text-faint">{note}</Text> : null}
    </View>
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
  getStorage(): Promise<StorageInfo>;
  getHealth(): Promise<HealthInfo>;
  encryptBackup(plaintext: string): Promise<{ data_b64: string; size_bytes: number }>;
  getPref(key: string): Promise<string | null>;
  setPref(key: string, value: string): Promise<boolean>;
};

type HealthInfo = { level_percent: number; temperature_c: number; voltage_mv: number; health: string };

/** Preference keys (AuditModule SharedPreferences). */
const PREF_ACCOUNT = 'account_number';
const PREF_DEVICES = 'paired_devices';

type PairedDevice = { id: string; label: string; paired_at: string };

/** "1327 3076 2982 9434" for display; the raw digits are what we store. */
function formatAccount(raw: string): string {
  return raw.replace(/\s/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Real battery snapshot for the Tools health row + a refresh action (the
 * row is tappable and re-reads the sticky battery broadcast). */
function useHealth(): [HealthInfo | null, () => void] {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const read = () => {
    Promise.resolve(AuditModule?.getHealth?.())
      .then((h) => {
        if (h) setHealth(h);
      })
      .catch(() => {});
  };
  useEffect(() => {
    read();
  }, []);
  return [health, read];
}

type StorageInfo = { total_bytes: number; free_bytes: number; used_bytes: number };

/** Byte count → short human string (GB with one decimal, MB, then KB —
 * a 43 KB encrypted snapshot must not render as "0 MB"). */
function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Real device storage (AuditModule.getStorage → StatFs). null until the
 * first read lands; callers render "—", never a placeholder number. */
function useStorage(): StorageInfo | null {
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(AuditModule?.getStorage?.())
      .then((s) => {
        if (alive && s) setStorage(s);
      })
      .catch(() => {
        // Unavailable (jest / older native module): panels stay at "—".
      });
    return () => {
      alive = false;
    };
  }, []);
  return storage;
}

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

function ScanScreen({ accountNumber, onAccountChange }: { accountNumber: string; onAccountChange: (raw: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [auditError, setAuditError] = useState('');
  // The sync field edits the SHARED account number (persisted in prefs), so
  // an account created in the Account modal prefills here.
  const auditAccount = accountNumber ? formatAccount(accountNumber) : '';
  const setAuditAccount = onAccountChange;
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncOk, setSyncOk] = useState(false);
  // Device-properties filter (owner request 2026-11-13: the properties
  // list needs its own search — case-insensitive substring over key AND
  // value).
  const [propQuery, setPropQuery] = useState('');
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

  const propKeys = result
    ? Object.keys(result.props)
        .filter((k) => {
          if (!propQuery.trim()) return true;
          const q = propQuery.toLowerCase();
          return k.toLowerCase().includes(q) || result.props[k].toLowerCase().includes(q);
        })
        .sort()
    : [];

  return (
    <View>
      <ScreenTitle title="Device scan" animation={scanSweep} />
      <Text className="mb-4 text-sm leading-5 text-muted">
        Analyze this device to plan a root or upgrade. Scanning is free.
      </Text>
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
        <Panel
          title={
            propQuery.trim()
              ? `Device properties (${propKeys.length} of ${Object.keys(result.props).length})`
              : `Device properties (${Object.keys(result.props).length})`
          }
        >
          {/* Owner request 2026-11-13: the properties list gets its own
              search + a formatting facelift — key left, value right-aligned,
              alternating row backgrounds. */}
          <TextInput
            className="mb-2 rounded-lg border border-border px-3 py-2.5 font-mono text-[13px] text-text"
            placeholder="Filter properties…"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            value={propQuery}
            onChangeText={setPropQuery}
          />
          {/* Fixed height so the list can't be squeezed away by sibling
              content (the Rootz app's measured layout lesson, 2026-11-09).
              nestedScrollEnabled: this ScrollView sits inside the tab's
              outer ScrollView — without it Android swallows the scroll
              gestures. */}
          <ScrollView
            className="border border-border bg-inset"
            nestedScrollEnabled
            style={{ height: 280 }}
          >
            {propKeys.map((k, i) => (
              <View key={k} className={`flex-row items-start px-2 py-[4px] ${i % 2 === 1 ? 'bg-panel' : ''}`}>
                <Text className="w-[45%] font-mono text-[10px] leading-[14px] text-faint" numberOfLines={1} selectable>
                  {k}
                </Text>
                <Text className="flex-1 text-right font-mono text-[10px] leading-[14px] text-muted" selectable>
                  {result.props[k]}
                </Text>
              </View>
            ))}
            {propKeys.length === 0 ? (
              <Text className="px-2 py-2 font-mono text-[10px] text-faint">No matching properties.</Text>
            ) : null}
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

function DevicesScreen({ devices, onPair, onRemove }: { devices: PairedDevice[]; onPair: () => void; onRemove: (id: string) => void }) {
  return (
    <View>
      <ScreenTitle title="Devices" animation={devicesTitle} />
      <Text className="mb-4 text-sm leading-5 text-muted">
        Devices paired on this phone. A pairing code is scanned with the
        camera and stored on the device — nothing is uploaded.
      </Text>
      <Panel title={`Paired devices (${devices.length})`}>
        {devices.length === 0 ? (
          <Text className="py-1 text-sm text-muted">
            No devices paired yet. Tap “Pair a new device” and scan the code
            shown by the device or web client.
          </Text>
        ) : (
          devices.map((d) => (
            <View key={d.id} className="flex-row items-center py-2">
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-text">{d.label}</Text>
                <Text className="mt-0.5 text-[13px] text-muted">
                  paired {new Date(d.paired_at).toLocaleDateString()}
                </Text>
              </View>
              <TouchableOpacity className="px-2 py-1" onPress={() => onRemove(d.id)}>
                <Text className="text-sm font-semibold" style={{ color: colors.warn }}>
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </Panel>
      <PrimaryButton label="Pair a new device" onPress={onPair} />
      <Text className="mt-3.5 text-xs leading-[17px] text-faint">
        Pairing stores the scanned code in this app only. Remove a device to
        forget it.
      </Text>
    </View>
  );
}

function AccountScreen({ accountNumber, onAccountChange }: { accountNumber: string; onAccountChange: (raw: string) => void }) {
  const storage = useStorage();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  // Real account creation: POST /v1/accounts returns a fresh 16-digit
  // number (no email, no personal data). The number is the only credential
  // and cannot be recovered — it is stored on this device.
  const createAccount = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.account_number) {
        onAccountChange(String(body.account_number).replace(/\s/g, ''));
        setOk(true);
        setMsg('Account created. Write the number down — it cannot be recovered.');
      } else {
        setOk(false);
        setMsg(body?.error || 'Could not create an account. Try again.');
      }
    } catch {
      setOk(false);
      setMsg('Network error. Is the device online?');
    } finally {
      setBusy(false);
    }
  };

  // Real payment surface: the site's /account page issues the invoices
  // (crypto live). The app does not handle payment details.
  const openTopUp = () => {
    Linking.openURL('https://rootmyandroid.com/account').catch(() => {});
  };

  return (
    <View>
      <Text className="mb-4 text-sm leading-5 text-muted">
        Mullvad-style: a 16-digit account number, no email, no personal data.
      </Text>
      <Panel title="Your account">
        {/* Real stored number (or "—" when none exists yet) — never a
            transplanted literal (F-Droid gates 5 + 9). */}
        <Row label="Account number" value={accountNumber ? formatAccount(accountNumber) : '—'} wide={Boolean(accountNumber)} />
        <Row label="Device storage used" value={storage ? fmtBytes(storage.used_bytes) : '—'} />
      </Panel>
      <Text className="mb-3.5 mt-3.5 text-xs leading-[17px] text-faint">
        {accountNumber
          ? 'This number is the only credential — it cannot be recovered. It stays on this device.'
          : 'No account connected yet. Create one below, or enter your 16-digit number when syncing an audit from the Scan tab.'}
      </Text>
      {msg ? (
        <Text className="mb-3 text-xs leading-[17px]" style={{ color: ok ? colors.good : colors.warn }}>
          {msg}
        </Text>
      ) : null}
      {/* fdroid flavor: no billing surface at all — account facts only
          (owner ruling 2026-11-13: everything free on the F-Droid build). */}
      {IS_FDROID_BUILD ? (
        <Text className="mt-3.5 text-xs leading-[17px] text-faint">
          Everything is free on this build — no billing, no upsell (F-Droid
          edition).
        </Text>
      ) : (
        <>
          <Panel title="Plan time">
            <Row label="Balance" value="—" />
            <Row label="Renewal" value="None — top up anytime" />
          </Panel>
          {MOCK_PLANS.map((plan) => (
            <Panel key={plan.id} title={`${plan.label} — ${plan.price} / ${plan.period}`}>
              {plan.features.map((feature) => (
                <Row key={feature} label="•" value={feature} />
              ))}
            </Panel>
          ))}
          <PrimaryButton label="Top up — from $5" onPress={openTopUp} />
          <GhostButton label={busy ? 'Creating…' : 'Create new account'} onPress={createAccount} />
          <Text className="mt-3.5 text-xs leading-[17px] text-faint">
            Plans are top-up subscriptions: add time whenever you like — no
            auto-renewal, no stored card. Your account number is the only
            credential. Keep it safe — it cannot be recovered.
          </Text>
        </>
      )}
    </View>
  );
}

/** Row shape returned by POST /v1/backups/list (measured against the live
 * API 2026-11-20: created_at, device_label, kind, r2_key, size_bytes — there
 * is NO `id` field, so the R2 key is the list key). */
type BackupRow = {
  r2_key?: string;
  device_label?: string | null;
  kind?: string | null;
  size_bytes: number;
  created_at?: string;
};

/**
 * Backups: the payload (the backup-audit snapshot) is serialized and
 * encrypted with the Keystore-held AES-256-GCM key (AuditModule
 * .encryptBackup) BEFORE it leaves the app; the API stores only the
 * ciphertext in R2 (POST /v1/backups). The list comes back from
 * POST /v1/backups/list.
 */
function BackupsScreen({ accountNumber }: { accountNumber: string }) {
  const storage = useStorage();
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [used, setUsed] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  const refresh = async (account: string) => {
    const res = await fetch(`${API_BASE}/backups/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account_number: account }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok) {
      setBackups(Array.isArray(body.backups) ? body.backups : []);
      setUsed(typeof body.used_bytes === 'number' ? body.used_bytes : null);
      setLimit(typeof body.limit_bytes === 'number' ? body.limit_bytes : null);
    }
  };

  useEffect(() => {
    if (!/^\d{16}$/.test(accountNumber)) return;
    refresh(accountNumber).catch(() => {});
  }, [accountNumber]);

  const runBackup = async () => {
    if (busy) return;
    const account = accountNumber.replace(/\s/g, '');
    if (!/^\d{16}$/.test(account)) {
      setOk(false);
      setMsg('Create or enter an account number first (Account → Create new account).');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const snapshot = await AuditModule.collectBackupAudit();
      const plaintext = JSON.stringify({ kind: 'backup', captured_at: new Date().toISOString(), snapshot });
      const enc = await AuditModule.encryptBackup(plaintext);
      const res = await fetch(`${API_BASE}/backups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account_number: account,
          device_label: await AuditModule.getDeviceName(),
          kind: 'backup',
          size_bytes: enc.size_bytes,
          data: enc.data_b64,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setOk(true);
        setMsg('Backup stored — encrypted on this device before upload.');
        await refresh(account);
      } else {
        setOk(false);
        setMsg(body?.error === 'storage_limit' ? 'Storage limit reached for this account.' : body?.error || 'Backup upload failed.');
      }
    } catch (e: any) {
      setOk(false);
      setMsg(e?.message || 'Backup failed on this device.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <ScreenTitle title="Backups" animation={backupsTitle} />
      <Text className="mb-4 text-sm leading-5 text-muted">
        Encrypted on this device with a key only you hold. We can't read or
        recover them.
      </Text>
      <Panel title="Device storage">
        {/* Real StatFs figures (AuditModule.getStorage) — "—" until the
            read lands, never a transplanted placeholder (gate 5). */}
        <Row label="Used" value={storage ? fmtBytes(storage.used_bytes) : '—'} />
        <Row label="Free" value={storage ? fmtBytes(storage.free_bytes) : '—'} />
        <Row label="Total" value={storage ? fmtBytes(storage.total_bytes) : '—'} />
      </Panel>
      <Panel title={`Backups (${backups.length})`}>
        {used !== null ? (
          <Row label="Account storage" value={`${fmtBytes(used)}${limit ? ` of ${fmtBytes(limit)}` : ''}`} />
        ) : null}
        {backups.length === 0 ? (
          <Text className="py-1 text-sm text-muted">
            No backups yet. Tap “New backup” to encrypt this device's audit
            snapshot and store it on your account.
          </Text>
        ) : (
          backups.map((b, i) => (
            <View key={b.r2_key || String(i)} className="flex-row items-center py-2">
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-text">
                  {b.device_label || 'This device'}
                </Text>
                <Text className="mt-0.5 text-[13px] text-muted">
                  {fmtBytes(b.size_bytes)} · encrypted
                  {b.created_at ? ` · ${new Date(b.created_at).toLocaleDateString()}` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </Panel>
      <PrimaryButton label={busy ? 'Encrypting…' : 'New backup'} onPress={runBackup} />
      {msg ? (
        <Text className="mt-3.5 text-xs leading-[17px]" style={{ color: ok ? colors.good : colors.warn }}>
          {msg}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Tool list row. F-Droid gate 10: a row without a handler renders disabled,
 * loses its "›" chevron (which promises navigation) and carries a note.
 */
function ToolRow({ name, desc, pro, onPress, note }: { name: string; desc: string; pro?: boolean; onPress?: () => void; note?: string }) {
  const enabled = typeof onPress === 'function';
  return (
    <TouchableOpacity
      className="flex-row items-center py-2.5"
      onPress={onPress}
      disabled={!enabled}
      accessibilityState={{ disabled: !enabled }}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className={`text-[15px] font-semibold ${enabled ? 'text-text' : 'text-muted'}`}>{name}</Text>
          {pro && !IS_FDROID_BUILD ? <Badge label="PRO" pro /> : null}
        </View>
        <Text className="mt-0.5 text-[13px] leading-[18px] text-muted">{desc}</Text>
        {note ? <Text className="mt-0.5 text-[11px] leading-[15px] text-faint">{note}</Text> : null}
      </View>
      {enabled ? <Text className="ml-3 text-[22px] text-faint">›</Text> : null}
    </TouchableOpacity>
  );
}

/** Opens a public page on rootmyandroid.com (guides are real pages in
 * apps/web/src/content/guides). */
const openSite = (path: string) => () => {
  Linking.openURL(`https://rootmyandroid.com${path}`).catch(() => {
    // No browser available — the row stays inert.
  });
};

function ToolsScreen({ onOpenStorage, onOpenScan }: { onOpenStorage: () => void; onOpenScan: () => void }) {
  const storage = useStorage();
  const [health, refreshHealth] = useHealth();
  return (
    <View>
      <ScreenTitle title="Tools" animation={toolsTitle} />
      <Text className="mb-4 text-sm leading-5 text-muted">
        {IS_FDROID_BUILD
          ? 'Advanced features. Everything is free on this build.'
          : 'Advanced features. PRO tools require time credit on your account.'}
      </Text>
      <Panel title="Root & ROM">
        <ToolRow
          name="Integrity auditor"
          desc="Audit bootloader state, root presence, and the derived integrity grade."
          onPress={onOpenScan}
        />
        <ToolRow
          name="Rooting guide"
          desc="What rooting does, and what it costs you."
          onPress={openSite('/guides/what-is-rooting')}
        />
        <ToolRow
          name="Bootloader guide"
          desc="How to read your device's bootloader status."
          onPress={openSite('/guides/check-bootloader-status')}
        />
        <ToolRow
          name="Logcat guide"
          desc="What logcat is and when to read it."
          onPress={openSite('/guides/what-is-logcat')}
        />
      </Panel>
      <Panel title="Device health">
        <ToolRow
          name="Health monitor"
          desc={
            health
              ? `Battery ${health.level_percent}%${
                  health.temperature_c >= 0 ? ` · ${health.temperature_c.toFixed(1)}°C` : ''
                } · ${health.health}`
              : 'Reading battery state…'
          }
          onPress={refreshHealth}
        />
        <ToolRow
          name="Storage manager"
          desc={
            storage
              ? `${fmtBytes(storage.used_bytes)} used of ${fmtBytes(storage.total_bytes)} on this device.`
              : 'Reading device storage…'
          }
          onPress={onOpenStorage}
        />
      </Panel>
    </View>
  );
}

export default App;
