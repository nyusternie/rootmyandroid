/**
 * RootMyAndroid (iOS edition) — parental monitoring for the Android devices
 * in your family.
 *
 * The iOS app is a CLIENT of the Root My Android API (rootmyandroid.com/v1):
 * it reads the audits + device state that the Rooted app (Android utility)
 * syncs from each monitored Android device. It cannot audit or monitor the
 * iPhone it runs on — monitoring targets are Android devices only.
 *
 * Store listing name: "Root My Android" (App Store Connect metadata).
 * Home-screen label: "RootMyAndroid" (CFBundleDisplayName, short enough to
 * avoid under-icon truncation).
 *
 * Dark, minimal UI matching rootmyandroid.com — colors come from
 * rootmyandroid-shared, never hard-coded per app.
 *
 * @format
 */

import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// Shared site-wide palette + typed /v1 API client (packages/shared).
import { colors, getAccount, listAudits } from 'rootmyandroid-shared';

type ConnectionState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'connected'; accountNumber: string }
  | { status: 'error'; message: string };

function App(): React.JSX.Element {
  const [accountNumber, setAccountNumber] = useState('');
  const [connection, setConnection] = useState<ConnectionState>({ status: 'idle' });
  const [deviceCount, setDeviceCount] = useState<number | null>(null);

  const connect = async () => {
    const trimmed = accountNumber.trim();
    if (!trimmed) {
      setConnection({ status: 'error', message: 'Enter your account number first.' });
      return;
    }
    setConnection({ status: 'checking' });
    try {
      const res = await getAccount(trimmed);
      if (!res.ok) {
        setConnection({ status: 'error', message: 'Account not found. Check the number and try again.' });
        return;
      }
      setConnection({ status: 'connected', accountNumber: trimmed });
      // Latest audit snapshot per synced device — each entry is one
      // monitored Android device.
      const audits = await listAudits({ accountNumber: trimmed });
      if (audits.ok && Array.isArray(audits.data)) {
        setDeviceCount(audits.data.length);
      }
    } catch {
      setConnection({ status: 'error', message: 'Network error. Is the API reachable?' });
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Root My Android</Text>
          <Text style={styles.subtitle}>Family monitoring for Android devices</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Account</Text>
          <Text style={styles.panelHint}>
            Sign in with the account number the monitored devices sync to. No email, no password.
          </Text>
          <TextInput
            style={styles.input}
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="1234 5678 9012 3456"
            placeholderTextColor={colors.faint}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            editable={connection.status !== 'checking'}
          />
          <TouchableOpacity
            style={[styles.button, connection.status === 'checking' && styles.buttonDisabled]}
            onPress={connect}
            disabled={connection.status === 'checking'}
          >
            <Text style={styles.buttonText}>
              {connection.status === 'checking' ? 'Connecting…' : 'Connect'}
            </Text>
          </TouchableOpacity>
          {connection.status === 'connected' && (
            <Text style={styles.statusOk}>Connected — {connection.accountNumber}</Text>
          )}
          {connection.status === 'error' && <Text style={styles.statusWarn}>{connection.message}</Text>}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Monitored devices</Text>
          {connection.status === 'connected' ? (
            <Text style={styles.panelHint}>
              {deviceCount === null
                ? 'Loading synced devices…'
                : deviceCount === 0
                  ? 'No devices syncing yet — install Rooted on an Android device and pair it with this account.'
                  : `${deviceCount} device${deviceCount === 1 ? '' : 's'} syncing to this account.`}
            </Text>
          ) : (
            <Text style={styles.panelHint}>Connect your account to see synced Android devices.</Text>
          )}
        </View>

        <Text style={styles.footer}>RootMyAndroid monitors Android devices only.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, gap: 16 },
  header: { marginTop: 12, marginBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 4 },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  panelHint: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 },
  input: {
    marginTop: 12,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  button: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: colors.accentDim },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  statusOk: { color: colors.good, fontSize: 13, marginTop: 10 },
  statusWarn: { color: colors.warn, fontSize: 13, marginTop: 10 },
  footer: { color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: 8 },
});

export default App;
