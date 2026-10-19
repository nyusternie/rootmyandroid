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
 * @format
 */

import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'scan' | 'devices' | 'backups' | 'tools';

const colors = {
  bg: '#0b0e11',
  panel: '#14181d',
  border: '#232a32',
  text: '#e6edf3',
  muted: '#8b98a5',
  faint: '#5b6670',
  accent: '#4c8dff',
  accentDim: '#2b4a7a',
  good: '#3fb950',
  warn: '#d29922',
};

/** Mock Nitro level (0–100) until billing is wired to the API. */
const MOCK_NITRO = 62;

function App() {
  const [tab, setTab] = useState<Tab>('scan');
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Rooted</Text>
          <NitroBar level={MOCK_NITRO} onPress={() => setAccountOpen(true)} />
          <TouchableOpacity
            style={styles.accountBtn}
            onPress={() => setAccountOpen(true)}
          >
            <Text style={styles.accountBtnText}>Account</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad}>
          {tab === 'scan' && <ScanScreen />}
          {tab === 'devices' && <DevicesScreen />}
          {tab === 'backups' && <BackupsScreen />}
          {tab === 'tools' && <ToolsScreen />}
        </ScrollView>

        <View style={styles.tabBar}>
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
          <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Account</Text>
              <TouchableOpacity
                style={styles.accountBtn}
                onPress={() => setAccountOpen(false)}
              >
                <Text style={styles.accountBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad}>
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
    <TouchableOpacity style={styles.nitroWrap} onPress={onPress}>
      <Text style={styles.nitroLabel}>NITRO</Text>
      <View style={styles.nitroTrack}>
        <View style={[styles.nitroFill, { width: `${level}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={[styles.nitroValue, { color: fillColor }]}>{level}</Text>
    </TouchableOpacity>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  const valueColor = tone === 'good' ? colors.good : tone === 'warn' ? colors.warn : colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.ghostBtn} onPress={onPress}>
      <Text style={styles.ghostBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ label, pro }: { label: string; pro?: boolean }) {
  return (
    <Text style={[styles.badge, pro ? styles.badgePro : styles.badgeFree]}>{label}</Text>
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

function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

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

  return (
    <View>
      <Text style={styles.screenTitle}>Device scan</Text>
      <Text style={styles.muted}>
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
      <Text style={styles.faint}>
        Scanning runs on-device. Nothing is sent until you choose to back up.
      </Text>
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
      <Text style={styles.screenTitle}>Devices</Text>
      <Text style={styles.muted}>
        Guardian devices synced to this account. Pairing is done from the
        Guardian app on the managed device.
      </Text>
      <Panel title="Paired devices">
        {mockDevices.map((d) => (
          <View key={d.name} style={styles.deviceRow}>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{d.name}</Text>
              <Text style={styles.deviceDetail}>{d.detail}</Text>
            </View>
            <Badge label={d.pro ? 'PRO' : 'FREE'} pro={d.pro} />
          </View>
        ))}
      </Panel>
      <PrimaryButton label="Pair a new device" />
      <Text style={styles.faint}>
        Open Guardian on the device you want to manage and enter this
        account's 16-digit number.
      </Text>
    </View>
  );
}

function AccountScreen() {
  return (
    <View>
      <Text style={styles.muted}>
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
      <Text style={styles.faint}>
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
      <Text style={styles.screenTitle}>Backups</Text>
      <Text style={styles.muted}>
        Encrypted on this device with a key only you hold. We can't read or
        recover them.
      </Text>
      <Panel title="Storage">
        <Row label="Used" value="1.2 GB" />
        <Row label="Included" value="5 GB" />
      </Panel>
      <Panel title="Backups">
        <View style={styles.deviceRow}>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>Full backup</Text>
            <Text style={styles.deviceDetail}>Oct 15, 2026 · 1.2 GB · encrypted</Text>
          </View>
        </View>
      </Panel>
      <PrimaryButton label="New backup" />
    </View>
  );
}

function ToolRow({ name, desc, pro }: { name: string; desc: string; pro?: boolean }) {
  return (
    <TouchableOpacity style={styles.toolRow}>
      <View style={styles.deviceInfo}>
        <View style={styles.toolHeader}>
          <Text style={styles.deviceName}>{name}</Text>
          {pro ? <Badge label="PRO" pro /> : null}
        </View>
        <Text style={styles.toolDesc}>{desc}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function ToolsScreen() {
  return (
    <View>
      <Text style={styles.screenTitle}>Tools</Text>
      <Text style={styles.muted}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  headerSub: { color: colors.accent, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  accountBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accountBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  nitroWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 14 },
  nitroLabel: { color: colors.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginRight: 8 },
  nitroTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  nitroFill: { height: 6, borderRadius: 3 },
  nitroValue: { fontSize: 13, fontWeight: '700', marginLeft: 8, minWidth: 22, textAlign: 'right' },
  body: { flex: 1 },
  bodyPad: { padding: 20, paddingBottom: 32 },
  screenTitle: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 6 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  faint: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 14 },
  panel: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  ghostBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgePro: { color: colors.accent, backgroundColor: colors.accentDim },
  badgeFree: { color: colors.muted, backgroundColor: colors.border },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  deviceInfo: { flex: 1 },
  deviceName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  deviceDetail: { color: colors.muted, fontSize: 13, marginTop: 2 },
  toolRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  toolHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolDesc: { color: colors.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  chevron: { color: colors.faint, fontSize: 22, marginLeft: 12 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
  },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderTopWidth: 2, borderTopColor: colors.accent },
  tabBtnText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  tabBtnTextActive: { color: colors.text },
});

export default App;
