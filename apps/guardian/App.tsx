/**
 * Guardian Angel — parental-control companion that runs in the background.
 * (Display name is "Guardian Angel"; package/IDs stay "guardian".)
 *
 * Guardian Angel is installed on the managed device and synced to a Rooted
 * account. Its UI is intentionally minimal: the app title, a sync input, and
 * — once synced — the Rooted account details plus an uninstall button.
 * Everything else is controlled from the Rooted app.
 *
 * Device protection uses the device-administrator API: while active, the
 * package manager refuses to uninstall the app. True launcher hiding via
 * DevicePolicyManager.setApplicationHidden would require device/profile
 * owner and would suspend the app, so hiding stays on the alias toggle.
 *
 * Dark, minimal UI matching rootmyandroid.com and the Rooted app.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  AppState,
  NativeModules,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const { Uninstall, LauncherIcon, SyncStore, DeviceAdmin } = NativeModules;

const API_BASE = 'https://rootmyandroid.com/v1';

const colors = {
  bg: '#0b0e11',
  panel: '#14181d',
  border: '#232a32',
  text: '#e6edf3',
  muted: '#8b98a5',
  faint: '#5b6670',
  accent: '#4c8dff',
  danger: '#e5534b',
};

type SyncedAccount = {
  /** Full 16-digit number is kept only to derive the last-4 display. */
  last4: string;
  /** Optional name/description set from the Rooted app. */
  name: string | null;
};

function App() {
  const [accountInput, setAccountInput] = useState('');
  const [synced, setSynced] = useState<SyncedAccount | null>(null);
  const [iconVisible, setIconVisible] = useState(true);
  const [protectionActive, setProtectionActive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    LauncherIcon?.isLauncherIconVisible?.()
      .then(setIconVisible)
      .catch(() => {});
    // Read device-admin state now and whenever the app returns to the
    // foreground (e.g. back from the system consent screen).
    const refreshProtection = () => {
      DeviceAdmin?.isActive?.()
        .then(setProtectionActive)
        .catch(() => {});
    };
    refreshProtection();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshProtection();
    });
    // Restore a previously saved pairing so sync survives restarts.
    SyncStore?.getSync?.()
      .then((saved: { accountNumber: string } | null) => {
        if (saved?.accountNumber) {
          setSynced({ last4: saved.accountNumber.slice(-4), name: null });
        }
      })
      .catch(() => {});
    return () => sub.remove();
  }, []);

  const digits = accountInput.replace(/\D/g, '');
  const canSync = digits.length === 16 && !syncing;

  const onSync = async () => {
    if (!canSync) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const deviceName: string | null = await (SyncStore?.getDeviceName?.() ??
        Promise.resolve(null)
      ).catch(() => null);
      const res = await fetch(`${API_BASE}/guardian/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_number: digits, device_name: deviceName }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok && body.device_id) {
        await SyncStore?.saveSync?.(digits, body.device_id)?.catch(() => {});
        setSynced({ last4: digits.slice(-4), name: null });
      } else if (res.status === 400 || res.status === 404) {
        setSyncError('Account number not found. Check the 16 digits and try again.');
      } else {
        setSyncError('Sync failed. Please try again.');
      }
    } catch {
      setSyncError('Could not reach rootmyandroid.com. Check the connection and try again.');
    } finally {
      setSyncing(false);
    }
  };

  const onUninstall = () => {
    setActionError(null);
    Promise.resolve(Uninstall?.requestUninstall?.()).catch((e: any) => {
      if (e?.code === 'E_PROTECTED') {
        setActionError('Device protection is active. Turn it off before uninstalling.');
      } else {
        setActionError('Could not start the uninstaller. Try again.');
      }
    });
  };

  const onToggleProtection = (value: boolean) => {
    setActionError(null);
    if (value) {
      // Opens the system consent screen; real state is re-read on resume.
      Promise.resolve(DeviceAdmin?.requestActivation?.()).catch(() => {
        setActionError('Could not open the device admin consent screen.');
      });
    } else {
      Promise.resolve(DeviceAdmin?.deactivate?.())
        .then((removed: boolean) => {
          if (removed) setProtectionActive(false);
        })
        .catch(() => {});
    }
  };

  const onToggleIcon = (value: boolean) => {
    setIconVisible(value);
    LauncherIcon?.setLauncherIconVisible?.(value).catch(() => {
      setIconVisible(!value);
    });
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Guardian Angel</Text>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad}>
          {synced === null ? (
            <View>
              <Text style={styles.muted}>
                Sync this device to a Rooted account. Enter the 16-digit account
                number shown in the Rooted app.
              </Text>
              <TextInput
                style={styles.input}
                value={accountInput}
                onChangeText={setAccountInput}
                placeholder="0000 0000 0000 0000"
                placeholderTextColor={colors.faint}
                keyboardType="number-pad"
                maxLength={19}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.primaryBtn, !canSync && styles.primaryBtnDisabled]}
                onPress={onSync}
                disabled={!canSync}
              >
                <Text style={styles.primaryBtnText}>
                  {syncing ? 'Syncing…' : 'Sync with Rooted'}
                </Text>
              </TouchableOpacity>
              {syncError !== null && (
                <Text style={styles.errorText}>{syncError}</Text>
              )}
            </View>
          ) : (
            <View>
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Synced to Rooted</Text>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Account</Text>
                  <Text style={styles.rowValue}>•••• {synced.last4}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Name</Text>
                  <Text style={styles.rowValue}>{synced.name ?? '—'}</Text>
                </View>
              </View>
              <Text style={styles.faint}>
                This device is managed from the Rooted app. All settings are
                controlled there.
              </Text>
              {actionError !== null && (
                <Text style={styles.errorText}>{actionError}</Text>
              )}
              <TouchableOpacity style={styles.dangerBtn} onPress={onUninstall}>
                <Text style={styles.dangerBtnText}>Uninstall Guardian Angel</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.panel}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Device protection</Text>
              <Switch
                value={protectionActive}
                onValueChange={onToggleProtection}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            <Text style={styles.toggleHint}>
              Device administrator access. While on, Guardian Angel cannot be
              uninstalled until protection is turned off.
            </Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Launcher icon</Text>
              <Switch
                value={iconVisible}
                onValueChange={onToggleIcon}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            <Text style={styles.toggleHint}>
              When hidden, Guardian Angel keeps running and can be opened from
              the Rooted app or via ADB.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  body: { flex: 1 },
  bodyPad: { padding: 20, paddingBottom: 32 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  faint: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 14 },
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 18,
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  dangerBtnText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 12 },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  toggleHint: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 10 },
});

export default App;
