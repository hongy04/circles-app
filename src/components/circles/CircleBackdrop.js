import React, { useEffect, useState } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

import { fetchCircleDecoration } from '../../services/circleDecorationService';
import {
  navigationCacheKeys,
  readNavigationCache,
  writeNavigationCache,
} from '../../services/navigationCacheService';

/**
 * Fixed shared-Circle wallpaper for secondary Circle surfaces.
 *
 * The Circle profile already writes its resolved decoration into the
 * navigation continuity cache, so normal Profile -> Posts/Timeline navigation
 * paints the wallpaper immediately without another network round trip.
 * Direct/cold entry falls back to one quiet decoration fetch.
 */
export function CircleBackdrop({ conversationId, imageTintOpacity = 0.1 }) {
  const cachedDecoration = conversationId
    ? readNavigationCache(navigationCacheKeys.circleDecoration(conversationId))
    : null;
  const [decoration, setDecoration] = useState(cachedDecoration);

  useEffect(() => {
    let active = true;

    if (!conversationId) {
      setDecoration(null);
      return () => {
        active = false;
      };
    }

    const warmDecoration = readNavigationCache(
      navigationCacheKeys.circleDecoration(conversationId)
    );

    setDecoration(warmDecoration || null);

    if (warmDecoration) {
      return () => {
        active = false;
      };
    }

    void fetchCircleDecoration(conversationId)
      .then((nextDecoration) => {
        if (!active) return;
        setDecoration(nextDecoration);
        writeNavigationCache(
          navigationCacheKeys.circleDecoration(conversationId),
          nextDecoration
        );
      })
      .catch(() => {
        // The Circle theme remains a complete fallback. A decoration lookup
        // should never block Posts/Timeline from opening.
      });

    return () => {
      active = false;
    };
  }, [conversationId]);

  if (decoration?.circle_background_url) {
    return (
      <View pointerEvents="none" style={styles.layer}>
        <ImageBackground
          source={{ uri: decoration.circle_background_url }}
          resizeMode="cover"
          style={styles.layer}
        >
          <View
            style={[
              styles.layer,
              { backgroundColor: `rgba(255,255,255,${imageTintOpacity})` },
            ]}
          />
        </ImageBackground>
      </View>
    );
  }

  if (decoration?.circle_background_color) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.layer,
          { backgroundColor: decoration.circle_background_color },
        ]}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
});
