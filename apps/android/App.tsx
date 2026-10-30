/**
 * Rooted — device scan, paired Guardian devices, encrypted backups, and tools.
 *
 * Dark, minimal UI matching rootmyandroid.com. Talks to the API at
 * rootmyandroid.com/v1. Backups are encrypted client-side with a user-held
 * key before upload; the API only ever sees ciphertext.
 *
 * Account lives behind the top-right header button (modal), not a tab.
 * The header also carries the Nitro energy bar: Nitro is the billing unit
 * users buy; accounts consume it to keep PRO features running. Nitro,
 * device scan, Devices, and Tools data is mocked for now; real probing and
 * API wiring come from native modules and the /v1 API.
 *
 * Styled with NativeWind (tailwind.config.js ↔ rootedColors in
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

// Shared Rooted/Guardian palette (packages/shared/src/theme.ts) — single
// source of truth for app + web colors (dynamic props only; static styling
// lives in NativeWind classes).
import { rootedColors as colors } from 'rootmyandroid-shared';

/** Mock Nitro level (0–100) until billing is wired to the API. */
const MOCK_NITRO = 62;

function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <SafeAreaProvider>
      {/* RN 0.88 types omit StatusBar's Android-only backgroundColor; spread-cast keeps the runtime behavior. */}
      <StatusBar barStyle="light-content" {...({ backgroundColor: colors.bg } as object)} />
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between border-b border-border px-5 pb-3 pt-5">
          <Text className="text-xl font-bold text-text">Rooted</Text>
          <NitroBar level={MOCK_NITRO} onPress={() => setAccountOpen(true)} />
          <TouchableOpacity
            className="rounded-lg border border-accent px-3 py-1.5"
            onPress={() => setAccountOpen(true)}
          >
            <Text className="text-sm font-semibold text-accent">Account</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
          {tab === 'scan' && <ScanScreen />}
          {tab === 'devices' && <DevicesScreen />}
          {tab === 'backups' && <BackupsScreen />}
          {tab === 'tools' && <ToolsScreen />}
        </ScrollView>

        <View className="flex-row border-t border-border bg-panel">
          <TabButton label="Scan" active={tab === 'scan'} onPress={() => setTab('scan')} />
          <TabButton label="Devices" active={tab === 'devices'} onPress={() => setTab('devices')} />
          <TabButton label="Backups" active={tab === 'backups'} onPress={() => setTab('backups')} />
          <TabButton label="Tools" active={tab === 'tools'} onPress={() => setTab('tools')} />
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

function NitroBar({ level, onPress }: { level: number; onPress: () => void }) {
  const fillColor = level <= 20 ? colors.warn : colors.accent;
  return (
    <TouchableOpacity className="mx-3.5 flex-1 flex-row items-center" onPress={onPress}>
      <Text className="mr-2 text-[10px] font-bold tracking-[1px] text-faint">NITRO</Text>
      <View className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-border">
        <View className="h-1.5 rounded-[3px]" style={{ width: `${level}%`, backgroundColor: fillColor }} />
      </View>
      <Text className="ml-2 min-w-[22px] text-right text-[13px] font-bold" style={{ color: fillColor }}>{level}</Text>
    </TouchableOpacity>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      className={`flex-1 items-center py-3.5 ${active ? 'border-t-2 border-accent' : ''}`}
      onPress={onPress}
    >
      <Text className={`text-sm font-medium ${active ? 'text-text' : 'text-muted'}`}>{label}</Text>
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

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  const valueColor = tone === 'good' ? colors.good : tone === 'warn' ? colors.warn : colors.text;
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

type ScanResult = {
  model: string;
  android: string;
  build: string;
  bootloader: string;
  rooted: string;
  rootedTone?: 'good' | 'warn';
  integrity: string;
  integrityTone?: 'good' | 'warn';
};

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

const API_BASE = 'https://rootmyandroid.com/v1';

function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [auditError, setAuditError] = useState('');
  const [auditAccount, setAuditAccount] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncOk, setSyncOk] = useState(false);
  const auditSnapshot = useRef<AuditSnapshot | null>(null);

  const runScan = () => {
    if (scanning) return;
    setScanning(true);
    // Mock scan — real probing will come from native modules.
    setTimeout(() => {
      setResult({
        model: 'Pixel 5 (redfin)',
        android: '14 (SDK 34)',
        build: 'UP1A.231005.007',
        bootloader: 'Unlocked',
        rooted: 'No',
        rootedTone: 'warn',
        integrity: 'Failing (unlocked bootloader)',
        integrityTone: 'warn',
      });
      setScanning(false);
    }, 1200);
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
      <Panel title="Device">
        <Row label="Model" value={result?.model ?? '—'} />
        <Row label="Android" value={result?.android ?? '—'} />
        <Row label="Build" value={result?.build ?? '—'} />
        <Row label="Bootloader" value={result?.bootloader ?? '—'} tone={result ? 'warn' : undefined} />
      </Panel>
      <Panel title="Root status">
        <Row label="Rooted" value={result?.rooted ?? '—'} tone={result?.rootedTone} />
        <Row label="Integrity" value={result?.integrity ?? '—'} tone={result?.integrityTone} />
      </Panel>
      <PrimaryButton label={scanning ? 'Scanning…' : 'Run scan'} onPress={runScan} />
      <Text className="mt-3.5 text-xs leading-[17px] text-faint">
        Scanning runs on-device. Nothing is sent until you choose to back up.
      </Text>
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
      <Panel title="Nitro">
        <Row label="Balance" value="62 / 100" />
        <Row label="Burn rate" value="1 Nitro / device / day" />
        <Row label="Est. remaining" value="31 days" />
      </Panel>
      <PrimaryButton label="Buy Nitro — $5 / 100" />
      <GhostButton label="Create new account" />
      <Text className="mt-3.5 text-xs leading-[17px] text-faint">
        Nitro is the energy your account burns to keep PRO features running.
        It is consumed automatically by active devices. Your account number
        is the only credential. Keep it safe — it cannot be recovered.
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
