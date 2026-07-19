import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { replaceWithMainTabs } from '../../navigation/navigationActions';
import { authStyles } from './authStyles';

export function SyncingScreen({ route, navigation }) {
  const summary = route.params?.summary || {};

  useEffect(() => {
    const timer = setTimeout(() => {
      replaceWithMainTabs(navigation);
    }, 900);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={authStyles.root} edges={['top']}>
      <Text style={authStyles.title}>All set</Text>
      <Text style={authStyles.caption}>
        Uploaded: {summary.uploaded ?? '—'} • New mutuals:{' '}
        {summary.mutuals ?? '—'}
      </Text>
      <ActivityIndicator style={{ marginTop: 14 }} />
    </SafeAreaView>
  );
}
