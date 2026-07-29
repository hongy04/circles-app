import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '../../theme/colors';
import { listCirclePosts } from '../../services/circlePostService';
import { listTwoPersonAlbums } from '../../services/twoPersonAlbumService';
import {
  getTwoPersonPlan,
  updateTwoPersonPlanMemoryAlbum,
  updateTwoPersonPlanMemoryPost,
} from '../../services/twoPersonPlanService';

function dateOnly(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function memoryCaption(plan) {
  const parts = [plan?.title, plan?.memoryNote].filter(Boolean);
  return parts.join('\n\n').slice(0, 2200);
}

function AlbumRow({ album, selected, disabled, onPress, onOpen }) {
  return (
    <View style={[styles.optionRow, selected && styles.selectedRow]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.optionMain, pressed && styles.pressed]}
      >
        {album.coverUrl ? (
          <Image source={{ uri: album.coverUrl }} style={styles.optionImage} />
        ) : (
          <View style={[styles.optionImage, styles.optionPlaceholder]}>
            <Ionicons name="images-outline" size={20} color={COLORS.subtext} />
          </View>
        )}
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle} numberOfLines={1}>{album.title}</Text>
          <Text style={styles.optionMeta} numberOfLines={1}>
            {album.photoCount} photo{album.photoCount === 1 ? '' : 's'}
            {album.occurredOn ? ` · ${album.occurredOn}` : ''}
          </Text>
        </View>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'link-outline'}
          size={21}
          color={selected ? COLORS.primary : COLORS.subtext}
        />
      </Pressable>
      {selected ? (
        <Pressable onPress={onOpen} hitSlop={8} style={styles.openButton}>
          <Text style={styles.openButtonText}>Open</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PostRow({ post, selected, disabled, onPress, onOpen }) {
  const firstMedia = post.media?.[0];
  return (
    <View style={[styles.optionRow, selected && styles.selectedRow]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.optionMain, pressed && styles.pressed]}
      >
        {firstMedia?.mediaType === 'image' ? (
          <Image source={{ uri: firstMedia.url }} style={styles.optionImage} />
        ) : (
          <View style={[styles.optionImage, styles.optionPlaceholder]}>
            <Ionicons
              name={firstMedia?.mediaType === 'video' ? 'videocam-outline' : 'document-text-outline'}
              size={20}
              color={COLORS.subtext}
            />
          </View>
        )}
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle} numberOfLines={2}>
            {post.caption || 'Shared Circle post'}
          </Text>
          <Text style={styles.optionMeta} numberOfLines={1}>
            {post.authorName} · {new Date(post.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'link-outline'}
          size={21}
          color={selected ? COLORS.primary : COLORS.subtext}
        />
      </Pressable>
      {selected ? (
        <Pressable onPress={onOpen} hitSlop={8} style={styles.openButton}>
          <Text style={styles.openButtonText}>Open</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TwoPersonPlanMemoryScreen({ route, navigation }) {
  const {
    planId,
    conversationId,
    circleName = 'Our Circle',
  } = route.params || {};
  const [plan, setPlan] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!planId || !conversationId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [nextPlan, nextAlbums, nextPosts] = await Promise.all([
        getTwoPersonPlan(planId),
        listTwoPersonAlbums(conversationId).catch(() => []),
        listCirclePosts(conversationId),
      ]);
      if (nextPlan.status !== 'completed') {
        throw new Error('Only a completed plan can be built into a richer memory.');
      }
      setPlan(nextPlan);
      setAlbums(nextAlbums);
      setPosts(nextPosts);
    } catch (loadError) {
      setError(loadError?.message || 'Could not open this shared memory.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, planId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const setAlbum = async (albumId) => {
    if (workingKey) return;
    setWorkingKey(`album-${albumId || 'none'}`);
    setError('');
    try {
      setPlan(await updateTwoPersonPlanMemoryAlbum(planId, albumId));
    } catch (actionError) {
      setError(actionError?.message || 'Could not update the linked album.');
    } finally {
      setWorkingKey('');
    }
  };

  const setPost = async (postId) => {
    if (workingKey) return;
    setWorkingKey(`post-${postId || 'none'}`);
    setError('');
    try {
      setPlan(await updateTwoPersonPlanMemoryPost(planId, postId));
    } catch (actionError) {
      setError(actionError?.message || 'Could not update the linked post.');
    } finally {
      setWorkingKey('');
    }
  };

  const confirmUnlink = (kind) => {
    Alert.alert(
      `Unlink this ${kind}?`,
      `The ${kind} stays in ${circleName}. Only its connection to this plan memory is removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: () => (kind === 'album' ? setAlbum(null) : setPost(null)),
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.stateText}>Opening memory connections…</Text>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.centerState}>
        <Ionicons name="alert-circle-outline" size={38} color={COLORS.subtext} />
        <Text style={styles.errorState}>{error || 'This memory is unavailable.'}</Text>
        <Pressable onPress={() => load()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const linkedAlbum = albums.find((album) => album.id === plan.memoryAlbumId) || null;
  const linkedPost = posts.find((post) => post.id === plan.memoryPostId) || null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.contextRow}>
          <Ionicons name="lock-closed" size={11} color={COLORS.subtext} />
          <Text style={styles.contextText}>{circleName} · deliberate memory links</Text>
        </View>
        <Text style={styles.heading}>Build this memory</Text>
        <Text style={styles.helper}>
          Link content that already belongs to this Our Circle, or deliberately create something new. Nothing is copied or published automatically.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionIcon}>
              <Ionicons name="images-outline" size={19} color={COLORS.text} />
            </View>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Shared album</Text>
              <Text style={styles.sectionBody}>Keep the photos from this plan together.</Text>
            </View>
          </View>

          <Pressable
            onPress={() => navigation.navigate('TwoPersonAlbumEditor', {
              conversationId,
              circleName,
              memoryPlanId: planId,
              initialTitle: plan.title,
              initialOccurredOn: dateOnly(plan.startsAt || plan.completedAt),
              initialNote: plan.memoryNote,
            })}
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createButtonText}>Create a New Album for This Memory</Text>
          </Pressable>

          {linkedAlbum ? (
            <Pressable
              onPress={() => confirmUnlink('album')}
              style={({ pressed }) => [styles.unlinkButton, pressed && styles.pressed]}
            >
              <Text style={styles.unlinkText}>Unlink current album</Text>
            </Pressable>
          ) : null}

          <Text style={styles.listLabel}>
            {albums.length ? 'Or link an existing album' : 'No shared albums yet'}
          </Text>
          {albums.slice(0, 20).map((album) => (
            <AlbumRow
              key={album.id}
              album={album}
              selected={album.id === plan.memoryAlbumId}
              disabled={Boolean(workingKey) || album.id === plan.memoryAlbumId}
              onPress={() => setAlbum(album.id)}
              onOpen={() => navigation.navigate('TwoPersonAlbumDetail', {
                albumId: album.id,
                conversationId,
                circleName,
              })}
            />
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionIcon}>
              <Ionicons name="grid-outline" size={19} color={COLORS.text} />
            </View>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Shared post</Text>
              <Text style={styles.sectionBody}>Deliberately share the memory on your Circle profile.</Text>
            </View>
          </View>

          <Pressable
            onPress={() => navigation.navigate('CreateCirclePost', {
              conversationId,
              circleName,
              memoryPlanId: planId,
              initialCaption: memoryCaption(plan),
            })}
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.createButtonText}>Create a New Post for This Memory</Text>
          </Pressable>

          {linkedPost ? (
            <Pressable
              onPress={() => confirmUnlink('post')}
              style={({ pressed }) => [styles.unlinkButton, pressed && styles.pressed]}
            >
              <Text style={styles.unlinkText}>Unlink current post</Text>
            </Pressable>
          ) : null}

          <Text style={styles.listLabel}>
            {posts.length ? 'Or link an existing shared post' : 'No shared posts yet'}
          </Text>
          {posts.slice(0, 20).map((post) => (
            <PostRow
              key={post.id}
              post={post}
              selected={post.id === plan.memoryPostId}
              disabled={Boolean(workingKey) || post.id === plan.memoryPostId}
              onPress={() => setPost(post.id)}
              onOpen={() => navigation.navigate('CirclePostDetail', {
                conversationId,
                postId: post.id,
              })}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingBottom: 70 },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  contextText: { color: COLORS.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
  heading: { marginTop: 10, color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 27 },
  helper: { marginTop: 7, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 13.5, lineHeight: 20 },
  errorText: { marginTop: 13, color: '#b42318', fontFamily: 'Manrope_600SemiBold', fontSize: 12, lineHeight: 17 },
  section: { marginTop: 20, padding: 14, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: '#fff' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center' },
  sectionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f0f5' },
  sectionHeadingCopy: { flex: 1, marginLeft: 11 },
  sectionTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 15 },
  sectionBody: { marginTop: 2, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 17 },
  createButton: { minHeight: 46, marginTop: 14, borderRadius: 13, backgroundColor: COLORS.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  createButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 12.5, textAlign: 'center' },
  unlinkButton: { minHeight: 38, marginTop: 7, alignItems: 'center', justifyContent: 'center' },
  unlinkText: { color: '#b42318', fontFamily: 'Manrope_700Bold', fontSize: 11.5 },
  listLabel: { marginTop: 17, marginBottom: 7, color: COLORS.subtext, fontFamily: 'Manrope_700Bold', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  optionRow: { marginTop: 7, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, overflow: 'hidden', backgroundColor: '#fafafa' },
  selectedRow: { borderColor: '#b8aaca', backgroundColor: '#f6f2fa' },
  optionMain: { minHeight: 70, flexDirection: 'row', alignItems: 'center', padding: 9 },
  optionImage: { width: 52, height: 52, borderRadius: 11, backgroundColor: '#eee' },
  optionPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, marginHorizontal: 10 },
  optionTitle: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 12.5, lineHeight: 17 },
  optionMeta: { marginTop: 3, color: COLORS.subtext, fontFamily: 'Manrope_400Regular', fontSize: 10.5 },
  openButton: { minHeight: 35, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  openButtonText: { color: COLORS.text, fontFamily: 'Manrope_700Bold', fontSize: 11.5 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: COLORS.bg },
  stateText: { marginTop: 10, color: COLORS.subtext, fontFamily: 'Manrope_400Regular' },
  errorState: { marginTop: 12, color: COLORS.text, fontFamily: 'Manrope_600SemiBold', textAlign: 'center' },
  retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.primary },
  retryButtonText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
  pressed: { opacity: 0.68 },
});
