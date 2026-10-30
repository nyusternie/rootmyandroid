// apps/ios/App.tsx
import './global.css';
import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {colors, getAccount, listAudits} from 'rootmyandroid-shared';

type ConnState =
  | {kind: 'idle'}
  | {kind: 'busy'}
  | {kind: 'error'; message: string}
  | {kind: 'ok'; accountNumber: string; nitro: number; audits: number};

function App(): React.JSX.Element {
  const [accountNumber, setAccountNumber] = useState('');
  const [state, setState] = useState<ConnState>({kind: 'idle'});

  const connect = useCallback(async () => {
    const acct = accountNumber.trim();
    if (acct.length === 0 || state.kind === 'busy') {
      return;
    }
    setState({kind: 'busy'});
    const account = await getAccount<{nitro_balance?: number}>(acct);
    if (!account.ok) {
      setState({
        kind: 'error',
        message: `Could not reach rootmyandroid.com (HTTP ${account.status}).`,
      });
      return;
    }
    const audits = await listAudits<unknown[]>({accountNumber: acct});
    setState({
      kind: 'ok',
      accountNumber: acct,
      nitro: account.data?.nitro_balance ?? 0,
      audits: audits.ok ? (audits.data ?? []).length : 0,
    });
  }, [accountNumber, state.kind]);

  const statusColor =
    state.kind === 'ok'
      ? colors.accent
      : state.kind === 'error'
        ? colors.danger
        : colors.warn;
  const statusText =
    state.kind === 'ok'
      ? 'Connected'
      : state.kind === 'busy'
        ? 'Connecting…'
        : state.kind === 'error'
          ? 'Connection failed'
          : 'Not connected';

  return (
    <SafeAreaView className="flex-1 bg-page">
      <ScrollView contentContainerStyle={{padding: 20, gap: 16}}>
        <View className="rounded-2xl border border-line bg-raise p-5">
          <View className="flex-row items-center gap-2.5">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{backgroundColor: statusColor}}
            />
            <Text className="text-[28px] font-bold tracking-[-0.5px] text-ink">
              RootMyAndroid
            </Text>
          </View>
          <Text className="mt-1.5 text-sm leading-5 text-dim">
            Family monitoring for your rooted Android devices. Sign in with
            your account number to see synced devices and audit reports.
          </Text>
        </View>

        <View className="rounded-2xl border border-line bg-raise p-4">
          <Text className="text-[11px] font-semibold uppercase tracking-[1.2px] text-dim">
            Account number
          </Text>
          <TextInput
            className="mt-3 rounded-xl border border-line bg-inset px-3.5 py-3 text-base text-ink"
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="e.g. 1234 5678 9012 3456"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            className={`mt-3 items-center rounded-xl bg-accent py-3.5 ${state.kind === 'busy' ? 'opacity-60' : ''}`}
            onPress={connect}
            disabled={state.kind === 'busy'}
            activeOpacity={0.8}>
            {state.kind === 'busy' ? (
              <ActivityIndicator color="#06121d" />
            ) : (
              <Text className="text-base font-bold text-[#06121d]">
                Connect
              </Text>
            )}
          </TouchableOpacity>
          {state.kind === 'ok' ? (
            <TouchableOpacity
              className="mt-3 items-center rounded-xl border border-accent py-2.5"
              activeOpacity={0.8}>
              <Text className="text-sm font-semibold text-accent">
                Copy pairing link
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="gap-1 rounded-xl border border-line bg-inset p-3">
          <Text className="text-sm font-medium text-ink">{statusText}</Text>
          {state.kind === 'ok' ? (
            <Text className="text-[13px] leading-[18px] text-dim">
              {state.nitro} Nitro · {state.audits} synced device
              {state.audits === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>

        {state.kind === 'error' ? (
          <View className="rounded-xl border border-danger bg-[#e05e5e22] p-3">
            <Text className="text-sm leading-5 text-danger">{state.message}</Text>
          </View>
        ) : null}

        {state.kind === 'ok' ? (
          <View className="gap-2">
            <View className="rounded-xl border border-line bg-raise px-3.5 py-3">
              <Text className="text-[15px] font-semibold text-ink">
                No devices paired yet
              </Text>
              <Text className="mt-0.5 text-[13px] text-dim">
                Install the Rooted app on an Android device and pair it with
                this account to start monitoring.
              </Text>
            </View>
          </View>
        ) : null}

        <View className="mt-2 items-center">
          <Text className="text-xs text-dim">
            RootMyAndroid monitors Android devices only.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default App;
