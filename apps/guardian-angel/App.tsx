/**
 * Guardian Angel — parental-control companion that runs in the background.
 * (Display name is "Guardian Angel"; package/IDs stay "guardian".)
 *
 * Guardian Angel is installed on the managed device and synced to a Root My
 * Android account. Its UI is intentionally minimal: the app title, a sync input, and
 * — once synced — the Root My Android account details plus an uninstall button.
 * Everything else is controlled from the Root My Android app.
 *
 * Device protection uses the device-administrator API: while active, the
 * package manager refuses to uninstall the app. True launcher hiding via
 * DevicePolicyManager.setApplicationHidden would require device/profile
 * owner and would suspend the app, so hiding stays on the alias toggle.
 *
 * Dark, minimal UI matching rootmyandroid.com and the Root My Android app.
 * Styled with NativeWind (tailwind.config.js ↔ rootzColors in
 * packages/shared/src/theme.ts).
 *
 * Makeover 2026-11-25 (owner order: same treatment as Rootz): brand header
 * (icon + 40px wordmark, 88dp bar), three titled cards with 16dp gaps, and
 * every text size +30% (12→15.6, 14→18.2, 16→20.8, 13→16.9, 16→20.8 for
 * the input). Sizes are px = dp on RN.
 *
 * Family-safety pass (owner order 2026-11-25, second round): the terminal
 * grid is gone — the backdrop is a night sky (deep indigo, a warm halo
 * top-right, cool light lower-left, fine stars, vignette). Bottom-right
 * carries the animated guardian: a Lottie "protection pulse" behind the
 * mascot, which breathes and bobs.
 *
 * Assistant sheet (2026-11-25, third round): tapping the mascot opens a
 * bottom sheet with the phone's Guardian state (protection, synced account)
 * and an inert "Ask the Guardian…" field — the future chat surface. The
 * sheet only shows real state and real actions (sync, turn on protection);
 * nothing here pretends to be a conversation yet.
 *
 * @format
 */

import './global.css';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Image,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Shared Rootz/Guardian palette (packages/shared/src/theme.ts) — single
// source of truth for the mobile-app colors (dynamic props only; static
// styling lives in NativeWind classes).
import { rootzColors as colors } from 'rootmyandroid-shared';

const { Uninstall, LauncherIcon, SyncStore, DeviceAdmin } = NativeModules;

const API_BASE = 'https://rootmyandroid.com/v1';

/** Top of the backdrop gradient (matches assets/backdrop@3x.png). */
const BACKDROP_TOP = '#171E3A';

type SyncedAccount = {
  /** Full 16-digit number is kept only to derive the last-4 display. */
  last4: string;
  /** Optional name/description set from the Root My Android app. */
  name: string | null;
};

function App() {
  return (
    <SafeAreaProvider>
      <GuardianScreen />
    </SafeAreaProvider>
  );
}

function GuardianScreen() {
  // Absolute children position against the parent's border box, not its
  // safe-area padding — the avatar needs the real inset to clear the
  // gesture bar (measured on redfin 2026-11-25).
  const insets = useSafeAreaInsets();
  const [accountInput, setAccountInput] = useState('');
  const [synced, setSynced] = useState<SyncedAccount | null>(null);
  const [iconVisible, setIconVisible] = useState(true);
  const [protectionActive, setProtectionActive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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
      // The API route is /v1/guardian/sync (rootmyandroid-api route table).
      // The old /guardian-angel/sync path 404s — it never matched a route.
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

  // Guardian avatar bob (native driver — runs off the JS thread so the
  // Lottie pulse and this float never fight for frames).
  const bob = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [3, -3] });

  return (
    <>
      {/* RN 0.88 types omit StatusBar's Android-only backgroundColor; spread-cast keeps the runtime behavior. */}
      <StatusBar barStyle="light-content" {...({ backgroundColor: BACKDROP_TOP } as object)} />
      <SafeAreaView className="flex-1 bg-[#0A0D14]" edges={['top', 'bottom']}>
        {/* Backdrop (owner order 2026-11-25: same treatment as Rootz — the
            flat fill read as empty). One baked 1080x2340 image: vertical
            gradient plus a 64dp grid (176px at 440dpi). Baked rather than
            layered because RN draws assets at their intrinsic dp size —
            a 16px-wide gradient stretched by cover showed only its top
            slice, and the repeated tile never appeared (measured on
            redfin). The parent bg matches the gradient's bottom so the
            navigation-bar inset blends. */}
        <Image
          source={require('./assets/backdrop.png')}
          className="absolute h-full w-full"
          resizeMode="cover"
        />

        {/* Brand bar: icon + 40px wordmark, 88dp tall (Rootz parity). */}
        <View className="h-[88px] flex-row items-center gap-3 border-b border-border px-5">
          <Image
            source={require('./assets/brand-angel.png')}
            className="h-11 w-11 rounded-[10px]"
            accessibilityIgnoresInvertColors
          />
          <Text className="text-[40px] font-bold tracking-[-0.01em] text-text">
            Guardian Angel
          </Text>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 170 }}>
          {/* Section 1 — ACCOUNT: sync input until paired, then the
              account card and the uninstall escape hatch. */}
          <View className="mb-4 rounded-xl border border-border bg-panel p-4">
            <Text className="mb-3 text-[20.8px] font-bold text-text">Account</Text>
            {synced === null ? (
              <View>
                <Text className="mb-4 text-[18.2px] leading-[26px] text-muted">
                  Sync this device to a Root My Android account. Enter the 16-digit account
                  number shown in the Root My Android app.
                </Text>
                <TextInput
                  testID="account-input"
                  className="mb-4 rounded-[10px] border border-border bg-bg px-4 py-3.5 text-[20.8px] tracking-[2px] text-text"
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
                  testID="sync-button"
                  className={`items-center rounded-[10px] bg-accent py-4 ${!canSync ? 'opacity-40' : ''}`}
                  onPress={onSync}
                  disabled={!canSync}
                >
                  <Text className="text-[18.2px] font-semibold text-white">
                    {syncing ? 'Syncing…' : 'Sync with Root My Android'}
                  </Text>
                </TouchableOpacity>
                {syncError !== null && (
                  <Text className="mt-3 text-[16.9px] leading-[24px] text-danger">{syncError}</Text>
                )}
              </View>
            ) : (
              <View>
                <View className="flex-row justify-between py-2">
                  <Text className="text-[18.2px] text-muted">Account</Text>
                  <Text className="text-[18.2px] font-medium text-text">•••• {synced.last4}</Text>
                </View>
                <View className="flex-row justify-between py-2">
                  <Text className="text-[18.2px] text-muted">Name</Text>
                  <Text className="text-[18.2px] font-medium text-text">{synced.name ?? '—'}</Text>
                </View>
                <Text className="mt-2 text-[15.6px] leading-[22px] text-faint">
                  This device is managed from the Root My Android app. All settings are
                  controlled there.
                </Text>
                {actionError !== null && (
                  <Text className="mt-3 text-[16.9px] leading-[24px] text-danger">{actionError}</Text>
                )}
                <TouchableOpacity
                  className="mt-4 items-center rounded-[10px] border border-danger py-4"
                  onPress={onUninstall}
                >
                  <Text className="text-[18.2px] font-semibold text-danger">
                    Uninstall Guardian Angel
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Section 2 — DEVICE PROTECTION. */}
          <View className="mb-4 rounded-xl border border-border bg-panel p-4">
            <Text className="mb-3 text-[20.8px] font-bold text-text">Device protection</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-[18.2px] font-semibold text-text">Administrator access</Text>
              <Switch
                value={protectionActive}
                onValueChange={onToggleProtection}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            <Text className="mt-2.5 text-[15.6px] leading-[22px] text-faint">
              Device administrator access. While on, Guardian Angel cannot be
              uninstalled until protection is turned off.
            </Text>
          </View>

          {/* Section 3 — LAUNCHER ICON. */}
          <View className="mb-4 rounded-xl border border-border bg-panel p-4">
            <Text className="mb-3 text-[20.8px] font-bold text-text">Launcher icon</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-[18.2px] font-semibold text-text">Show in launcher</Text>
              <Switch
                value={iconVisible}
                onValueChange={onToggleIcon}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            <Text className="mt-2.5 text-[15.6px] leading-[22px] text-faint">
              When hidden, Guardian Angel keeps running and can be opened from
              the Root My Android app or via ADB.
            </Text>
          </View>
        </ScrollView>

        {/* Guardian avatar — bottom right. The Lottie ring is the
            "protection pulse" (inert: box-none on the container, none on the
            pulse) and the mascot badge is the assistant trigger. Only the
            76dp badge takes touches, so the switch cards underneath stay
            reachable. */}
        <View
          className="absolute h-[150px] w-[150px] items-center justify-center"
          style={{ bottom: insets.bottom + 10, right: 6 }}
          pointerEvents="box-none"
        >
          <View pointerEvents="none" style={{ position: 'absolute', width: 150, height: 150 }}>
            <LottieView
              source={require('./assets/guardian-pulse.json')}
              autoPlay
              loop
              style={{ width: 150, height: 150 }}
            />
          </View>
          <Pressable
            testID="guardian-avatar"
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open the Guardian assistant"
            className="h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-2 border-[#FFD27A]/70 bg-[#14181d]"
          >
            <Animated.View
              style={{ transform: [{ translateY: bobY }] }}
              className="h-full w-full"
            >
              <Image source={require('./assets/brand-angel.png')} className="h-full w-full" />
            </Animated.View>
          </Pressable>
        </View>

        {/* Assistant sheet — real state, real actions, and an inert field
            that marks where the conversation will live. */}
        <Modal
          visible={sheetOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setSheetOpen(false)}
        >
          <View className="flex-1 justify-end bg-black/60">
            <Pressable className="flex-1" onPress={() => setSheetOpen(false)} />
            <View
              testID="guardian-sheet"
              className="rounded-t-2xl border-t border-border bg-panel px-5 pb-8 pt-5"
            >
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-[26px] font-bold text-text">Guardian</Text>
                <Pressable
                  onPress={() => setSheetOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close the Guardian assistant"
                  className="rounded-lg border border-border px-3 py-1.5"
                >
                  <Text className="text-[16.9px] font-semibold text-muted">Close</Text>
                </Pressable>
              </View>
              <Text className="mb-4 text-[16.9px] leading-[24px] text-muted">
                I watch over this phone's Guardian Angel setup. Ask me things here
                soon — for now I can show you what's on and turn it on.
              </Text>

              <View className="mb-4 rounded-xl border border-border bg-bg p-4">
                <View className="flex-row justify-between py-1.5">
                  <Text className="text-[18.2px] text-muted">Protection</Text>
                  <Text className="text-[18.2px] font-medium text-text">
                    {protectionActive ? 'On' : 'Off'}
                  </Text>
                </View>
                <View className="flex-row justify-between py-1.5">
                  <Text className="text-[18.2px] text-muted">Account</Text>
                  <Text className="text-[18.2px] font-medium text-text">
                    {synced ? `•••• ${synced.last4}` : 'Not synced'}
                  </Text>
                </View>
                <View className="flex-row justify-between py-1.5">
                  <Text className="text-[18.2px] text-muted">Launcher icon</Text>
                  <Text className="text-[18.2px] font-medium text-text">
                    {iconVisible ? 'Visible' : 'Hidden'}
                  </Text>
                </View>
              </View>

              <View className="mb-4 flex-row items-center gap-2 rounded-xl border border-border bg-bg px-4 py-3">
                <Text className="flex-1 text-[18.2px] text-faint">Ask the Guardian… (coming soon)</Text>
                <View className="rounded-lg bg-accent/30 px-3 py-2">
                  <Text className="text-[16.9px] font-semibold text-white">Send</Text>
                </View>
              </View>

              {!protectionActive && (
                <TouchableOpacity
                  testID="sheet-protection"
                  className="items-center rounded-[10px] bg-accent py-4"
                  onPress={() => {
                    setSheetOpen(false);
                    onToggleProtection(true);
                  }}
                >
                  <Text className="text-[18.2px] font-semibold text-white">Turn on protection</Text>
                </TouchableOpacity>
              )}
              {!synced && (
                <TouchableOpacity
                  testID="sheet-sync"
                  className="mt-3 items-center rounded-[10px] border border-border py-4"
                  onPress={() => setSheetOpen(false)}
                >
                  <Text className="text-[18.2px] font-semibold text-text">Sync this phone</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

export default App;
