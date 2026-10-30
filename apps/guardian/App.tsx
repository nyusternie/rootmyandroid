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
 * Styled with NativeWind (tailwind.config.js ↔ rootedColors in
 * packages/shared/src/theme.ts).
 *
 * @format
 */

import './global.css';
import React, { useEffect, useState } from 'react';
import {
  AppState,
  NativeModules,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Shared Rooted/Guardian palette (packages/shared/src/theme.ts) — single
// source of truth for the mobile-app colors (dynamic props only; static
// styling lives in NativeWind classes).
import { rootedColors as colors } from 'rootmyandroid-shared';

const { Uninstall, LauncherIcon, SyncStore, DeviceAdmin } = NativeModules;

const API_BASE = 'https://rootmyandroid.com/v1';

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
      {/* RN 0.88 types omit StatusBar's Android-only backgroundColor; spread-cast keeps the runtime behavior. */}
      <StatusBar barStyle="light-content" {...({ backgroundColor: colors.bg } as object)} />
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="border-b border-border px-5 pb-3 pt-5">
          <Text className="text-xl font-bold text-text">Guardian Angel</Text>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
          {synced === null ? (
            <View>
              <Text className="mb-4 text-sm leading-5 text-muted">
                Sync this device to a Rooted account. Enter the 16-digit account
                number shown in the Rooted app.
              </Text>
              <TextInput
                className="mb-4 rounded-[10px] border border-border bg-panel px-4 py-3.5 text-lg tracking-[2px] text-text"
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
                className={`mt-1 items-center rounded-[10px] bg-accent py-3.5 ${!canSync ? 'opacity-40' : ''}`}
                onPress={onSync}
                disabled={!canSync}
              >
                <Text className="text-base font-semibold text-white">
                  {syncing ? 'Syncing…' : 'Sync with Rooted'}
                </Text>
              </TouchableOpacity>
              {syncError !== null && (
                <Text className="mt-3 text-[13px] leading-[18px] text-danger">{syncError}</Text>
              )}
            </View>
          ) : (
            <View>
              <View className="mb-4 rounded-xl border border-border bg-panel p-4">
                <Text className="mb-2.5 text-[15px] font-semibold text-text">Synced to Rooted</Text>
                <View className="flex-row justify-between py-1.5">
                  <Text className="text-sm text-muted">Account</Text>
                  <Text className="text-sm font-medium text-text">•••• {synced.last4}</Text>
                </View>
                <View className="flex-row justify-between py-1.5">
                  <Text className="text-sm text-muted">Name</Text>
                  <Text className="text-sm font-medium text-text">{synced.name ?? '—'}</Text>
                </View>
              </View>
              <Text className="mt-3.5 text-xs leading-[17px] text-faint">
                This device is managed from the Rooted app. All settings are
                controlled there.
              </Text>
              {actionError !== null && (
                <Text className="mt-3 text-[13px] leading-[18px] text-danger">{actionError}</Text>
              )}
              <TouchableOpacity className="mt-5 items-center rounded-[10px] border border-danger py-3.5" onPress={onUninstall}>
                <Text className="text-base font-semibold text-danger">Uninstall Guardian Angel</Text>
              </TouchableOpacity>
            </View>
          )}

          <View className="mb-4 rounded-xl border border-border bg-panel p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-semibold text-text">Device protection</Text>
              <Switch
                value={protectionActive}
                onValueChange={onToggleProtection}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            <Text className="mt-2.5 text-xs leading-[17px] text-faint">
              Device administrator access. While on, Guardian Angel cannot be
              uninstalled until protection is turned off.
            </Text>
          </View>

          <View className="mb-4 rounded-xl border border-border bg-panel p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-semibold text-text">Launcher icon</Text>
              <Switch
                value={iconVisible}
                onValueChange={onToggleIcon}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            <Text className="mt-2.5 text-xs leading-[17px] text-faint">
              When hidden, Guardian Angel keeps running and can be opened from
              the Rooted app or via ADB.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
