import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components/Avatar';
import { CircleBackdrop } from '../../components/circles/CircleBackdrop';
import { EventAlbumMemoryCover } from '../../components/events/EventAlbumMemoryCover';
import { CircleThemeBoundary } from '../../theme/CircleThemeBoundary';
import { useThemeTokens } from '../../theme/ThemeProvider';
import { timeAgo } from '../../utils/timeAgo';
import {
  listConversationTimeline,
  subscribeToConversationChanges,
} from '../../services/conversationService';
import { listCircleEventMemories } from '../../services/eventService';
import {
  listTwoPersonPlans,
  subscribeToTwoPersonPlanChanges,
} from '../../services/twoPersonPlanService';
import {
  listTwoPersonImportantDates,
  subscribeToTwoPersonImportantDateChanges,
} from '../../services/twoPersonImportantDateService';
import {
  listTwoPersonThoughts,
  subscribeToTwoPersonThoughtChanges,
} from '../../services/twoPersonThoughtService';
import {
  listTwoPersonAlbums,
  subscribeToTwoPersonAlbumChanges,
} from '../../services/twoPersonAlbumService';
import { navigationCacheKeys, readNavigationCache, writeNavigationCache } from '../../services/navigationCacheService';
import { reconcileRowsById } from '../../utils/reconcileRows';

const TIMELINE_FOCUS_FRESH_MS = 12_000;
const TIMELINE_REALTIME_DEBOUNCE_MS = 220;

function sameTimelineItem(left, right) {
  return left?.id === right?.id
    && left?.messageId === right?.messageId
    && left?.senderId === right?.senderId
    && left?.senderName === right?.senderName
    && left?.senderAvatar === right?.senderAvatar
    && left?.messageBody === right?.messageBody
    && left?.createdAt === right?.createdAt
    && left?.url === right?.url
    && left?.storagePath === right?.storagePath
    && left?.mediaType === right?.mediaType
    && left?.width === right?.width
    && left?.height === right?.height
    && left?.durationMs === right?.durationMs
    && left?.sortOrder === right?.sortOrder;
}

function groupTimeline(items) {
  const groups = [];
  const byKey = new Map();

  (items || []).forEach((item) => {
    const key = item.messageId || item.id;
    let group = byKey.get(key);
    if (!group) {
      group = {
        id: key,
        senderId: item.senderId,
        senderName: item.senderName || 'Circle member',
        senderAvatar: item.senderAvatar || null,
        messageBody: item.messageBody || '',
        createdAt: item.createdAt,
        media: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.media.push(item);
  });

  return groups;
}

const TimelineFeedCard = React.memo(function TimelineFeedCard({ group, width, height, navigation, styles, theme }) {
  return (
    <View style={[styles.card, { height }]}>
      <Pressable
        onPress={() => group.senderId && navigation.navigate('Profile', { userId: group.senderId })}
        style={({ pressed }) => [styles.authorRow, pressed && styles.pressed]}
      >
        <Avatar size={40} name={group.senderName} uri={group.senderAvatar} />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>{group.senderName}</Text>
          <View style={styles.privateTimeRow}>
            <Ionicons name="time-outline" size={11} color={theme.colors.subtext} />
            <Text style={styles.time}>{timeAgo(group.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.archivePill}>
          <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.colors.text} />
          <Text style={styles.archiveLabel}>From Chat</Text>
        </View>
      </Pressable>

      <FlatList
        horizontal
        style={{ height: width, flexGrow: 0 }}
        pagingEnabled
        data={group.media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate('ConversationMedia', {
              items: group.media,
              startIndex: index,
            })}
            style={[styles.mediaPage, { width, height: width }]}
          >
            {item.mediaType === 'image' ? (
              <Image source={{ uri: item.url }} style={styles.media} resizeMode="cover" />
            ) : (
              <View style={styles.videoPage}>
                <Ionicons name="play-circle" size={62} color="#fff" />
              </View>
            )}
          </Pressable>
        )}
      />

      <View style={styles.details}>
        {group.media.length > 1 ? (
          <View style={styles.mediaCountPill}>
            <Ionicons name="copy-outline" size={11} color={theme.colors.text} />
            <Text style={styles.mediaCount}>{group.media.length} shared items</Text>
          </View>
        ) : null}
        {group.messageBody ? (
          <Text numberOfLines={3} style={styles.caption}>
            <Text style={styles.captionAuthor}>{group.senderName} </Text>
            {group.messageBody}
          </Text>
        ) : (
          <Text style={styles.captionMuted}>Shared in the private Circle chat.</Text>
        )}
      </View>
    </View>
  );
});

function formatMemoryDate(startsAt) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 'Past gathering';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

const EventMemoryFeedCard = React.memo(function EventMemoryFeedCard({ event, width, height, navigation, styles, theme, conversationId, circleName }) {
  const [pageIndex, setPageIndex] = useState(0);
  const cachedSummary = readNavigationCache(navigationCacheKeys.eventSummary(event.id));
  const cachedEvents = readNavigationCache(navigationCacheKeys.circleEvents(conversationId));
  const cachedListEvent = Array.isArray(cachedEvents)
    ? cachedEvents.find((candidate) => candidate?.id === event.id)
    : null;
  const eventTitle = String(
    event?.title
      || cachedSummary?.title
      || cachedSummary?.eventTitle
      || cachedListEvent?.title
      || ''
  ).trim() || 'Event memory';
  const attended = event.attendanceReviewedAt
    ? Number(event.attendedCount || 0)
    : Number(event.goingCount || 0);
  const photoCount = Number(event.photoCount || 0);
  const photoUrls = useMemo(() => Array.from(new Set([
    ...(event.timelineUrls || []),
    ...(event.previewUrls || []),
  ].filter(Boolean))).slice(0, 6), [event.previewUrls, event.timelineUrls]);
  const pages = useMemo(() => [
    { id: `event-summary:${event.id}`, kind: 'summary' },
    ...photoUrls.map((uri, index) => ({
      id: `event-photo:${event.id}:${index}:${uri}`,
      kind: 'photo',
      uri,
      photoIndex: index,
    })),
  ], [event.id, photoUrls]);

  const openEventDetails = useCallback(() => {
    writeNavigationCache(navigationCacheKeys.eventSummary(event.id), event);
    navigation.navigate('EventDetail', {
      eventId: event.id,
      eventTitle,
      conversationId,
      circleName,
    });
  }, [circleName, conversationId, event, eventTitle, navigation]);

  const openGallery = useCallback(() => {
    writeNavigationCache(navigationCacheKeys.eventSummary(event.id), event);
    navigation.navigate('EventPhotoGallery', {
      eventId: event.id,
      eventTitle,
      conversationId,
      circleName,
      appearanceKey: event.appearanceKey || 'circle',
      coverUri: event.coverUrl || null,
      eventStartsAt: event.startsAt || null,
      eventEndsAt: event.endsAt || null,
      eventLocation: event.locationName || '',
    });
  }, [circleName, conversationId, event, eventTitle, navigation]);

  const handlePageSettled = useCallback((scrollEvent) => {
    const x = Number(scrollEvent?.nativeEvent?.contentOffset?.x || 0);
    const nextIndex = width > 0 ? Math.round(x / width) : 0;
    setPageIndex(Math.max(0, Math.min(pages.length - 1, nextIndex)));
  }, [pages.length, width]);

  return (
    <View style={[styles.eventMemoryCard, { height }]}>
      <FlatList
        horizontal
        pagingEnabled
        data={pages}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={{ height: width, flexGrow: 0 }}
        onMomentumScrollEnd={handlePageSettled}
        renderItem={({ item }) => (
          item.kind === 'summary' ? (
            <View style={[styles.eventMemoryPage, { width, height: width }]}>
              <EventAlbumMemoryCover
                appearanceKey={event.appearanceKey || 'circle'}
                coverUri={event.coverUrl || null}
                previewUrls={event.previewUrls || []}
                height={width}
                borderRadius={0}
              >
                <View style={styles.eventMemoryHeroContent}>
                  <View style={styles.eventMemoryTopRow}>
                    <View style={styles.eventMemoryPill}>
                      <Ionicons name="sparkles" size={11} color="#fff" />
                      <Text style={styles.eventMemoryPillText}>SHARED MEMORY</Text>
                    </View>
                    <View style={styles.eventMemoryDatePill}>
                      <Text style={styles.eventMemoryDate}>{formatMemoryDate(event.startsAt)}</Text>
                    </View>
                  </View>

                  <View style={styles.eventMemoryTitlePlate}>
                    <Text style={styles.eventMemoryHeroTitle} numberOfLines={3}>{eventTitle}</Text>
                    {event.locationName ? (
                      <View style={styles.eventMemoryHeroLocationRow}>
                        <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.92)" />
                        <Text style={styles.eventMemoryHeroLocation} numberOfLines={1}>{event.locationName}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </EventAlbumMemoryCover>
            </View>
          ) : (
            <Pressable
              onPress={openGallery}
              style={({ pressed }) => [styles.eventMemoryPage, { width, height: width }, pressed && styles.pressed]}
            >
              <Image source={{ uri: item.uri }} style={styles.eventMemoryPhoto} resizeMode="cover" />
              <View style={styles.eventMemoryPhotoTopRow}>
                <View style={styles.eventMemoryPhotoPill}>
                  <Ionicons name="images-outline" size={11} color="#fff" />
                  <Text style={styles.eventMemoryPhotoPillText}>EVENT PHOTO</Text>
                </View>
                <View style={styles.eventMemoryPhotoCounterPill}>
                  <Text style={styles.eventMemoryPhotoCounterText}>
                    {item.photoIndex + 1}/{photoUrls.length}
                  </Text>
                </View>
              </View>
              {item.photoIndex === photoUrls.length - 1 && photoCount > photoUrls.length ? (
                <View style={styles.eventMemoryMorePhotosPill}>
                  <Ionicons name="add" size={13} color="#fff" />
                  <Text style={styles.eventMemoryMorePhotosText}>
                    {photoCount - photoUrls.length} more in the album
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )
        )}
      />

      <View style={styles.eventMemoryDetails}>
        <View style={styles.eventMemoryPagerRow}>
          <View style={styles.eventMemoryDots}>
            {pages.map((page, index) => (
              <View
                key={page.id}
                style={[
                  styles.eventMemoryDot,
                  index === pageIndex && styles.eventMemoryDotActive,
                ]}
              />
            ))}
          </View>
          <Text style={styles.eventMemoryPageLabel} numberOfLines={1}>
            {eventTitle}
          </Text>
        </View>

        <View style={styles.eventMemoryMetricRow}>
          <View style={styles.eventMemoryMetric}>
            <Ionicons name="people-outline" size={15} color={theme.colors.text} />
            <Text style={styles.eventMemoryMetricText}>{attended} {attended === 1 ? 'person' : 'people'} there</Text>
          </View>
          <View style={styles.eventMemoryMetric}>
            <Ionicons name="images-outline" size={15} color={theme.colors.text} />
            <Text style={styles.eventMemoryMetricText}>{photoCount} {photoCount === 1 ? 'photo' : 'photos'}</Text>
          </View>
        </View>

        <View style={styles.eventMemoryBottomRow}>
          <Text style={styles.eventMemoryBody} numberOfLines={2}>
            {event.description || 'A gathering your Circle chose to keep.'}
          </Text>
          <View style={styles.eventMemoryActions}>
            {photoCount > 0 ? (
              <Pressable
                onPress={openGallery}
                style={({ pressed }) => [styles.eventMemoryActionPill, pressed && styles.pressed]}
              >
                <Ionicons name="images-outline" size={13} color={theme.colors.text} />
                <Text style={styles.eventMemoryActionText}>All photos</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={openEventDetails}
              style={({ pressed }) => [styles.eventMemoryActionPill, pressed && styles.pressed]}
            >
              <Text style={styles.eventMemoryActionText}>Event details</Text>
              <Ionicons name="chevron-forward" size={13} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
});

function parseDateOnly(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function importantDateHasHappened(value) {
  const date = parseDateOnly(value);
  if (!date) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return date <= endOfToday;
}

function formatMilestoneDate(value) {
  const date = parseDateOnly(value);
  if (!date) return { month: 'DATE', day: '—', full: 'Shared milestone' };
  return {
    month: date.toLocaleDateString([], { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
    full: date.toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

const PlanMemoryFeedCard = React.memo(function PlanMemoryFeedCard({ plan, linkedAlbum, width, height, navigation, styles, theme, conversationId, circleName }) {
  const [pageIndex, setPageIndex] = useState(0);
  const photoUrls = useMemo(() => Array.from(new Set([
    ...(linkedAlbum?.timelineUrls || []),
    ...(linkedAlbum?.previewUrls || []),
  ].filter(Boolean))).slice(0, 6), [linkedAlbum?.previewUrls, linkedAlbum?.timelineUrls]);
  const photoCount = Math.max(0, Number(linkedAlbum?.photoCount || 0));
  const pages = useMemo(() => [
    { id: `plan-summary:${plan.id}`, kind: 'summary' },
    ...photoUrls.map((uri, index) => ({
      id: `plan-album-photo:${plan.id}:${index}:${uri}`,
      kind: 'photo',
      uri,
      photoIndex: index,
    })),
  ], [photoUrls, plan.id]);

  const openDetails = useCallback(() => {
    writeNavigationCache(navigationCacheKeys.plan(plan.id), plan);
    navigation.navigate('TwoPersonPlanDetail', {
      planId: plan.id,
      conversationId,
      circleName,
    });
  }, [circleName, conversationId, navigation, plan]);

  const openAlbum = useCallback(() => {
    if (!linkedAlbum?.id) return;
    writeNavigationCache(navigationCacheKeys.album(linkedAlbum.id), linkedAlbum);
    navigation.navigate('TwoPersonAlbumDetail', {
      albumId: linkedAlbum.id,
      conversationId,
      circleName,
    });
  }, [circleName, conversationId, linkedAlbum, navigation]);

  const handlePageSettled = useCallback((scrollEvent) => {
    const x = Number(scrollEvent?.nativeEvent?.contentOffset?.x || 0);
    const nextIndex = width > 0 ? Math.round(x / width) : 0;
    setPageIndex(Math.max(0, Math.min(pages.length - 1, nextIndex)));
  }, [pages.length, width]);

  const completedLabel = plan.completedAt
    ? new Date(plan.completedAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Completed together';

  return (
    <View style={[styles.storyMemoryCard, { height }]}>
      <FlatList
        horizontal
        pagingEnabled
        data={pages}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={{ height: width, flexGrow: 0 }}
        onMomentumScrollEnd={handlePageSettled}
        renderItem={({ item }) => (
          item.kind === 'summary' ? (
            <View style={[styles.planMemoryHero, { width, height: width }]}>
              <View style={styles.planMemoryOrbLarge} />
              <View style={styles.planMemoryOrbSmall} />
              <View style={styles.planMemoryHeroTopRow}>
                <View style={styles.softMemoryPill}>
                  <Ionicons name="sparkles" size={11} color={theme.colors.text} />
                  <Text style={styles.softMemoryPillText}>PLAN MEMORY</Text>
                </View>
                <Text style={styles.planMemoryCompletedDate}>{completedLabel}</Text>
              </View>
              <View style={styles.planMemoryHeroBottom}>
                <Text style={styles.planMemoryHeroTitle} numberOfLines={4}>{plan.title}</Text>
                {plan.locationName ? (
                  <View style={styles.planMemoryLocationRow}>
                    <Ionicons name="location-outline" size={14} color={theme.colors.subtext} />
                    <Text style={styles.planMemoryLocation} numberOfLines={1}>{plan.locationName}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <Pressable
              onPress={openAlbum}
              style={({ pressed }) => [styles.planMemoryPhotoPage, { width, height: width }, pressed && styles.pressed]}
            >
              <Image source={{ uri: item.uri }} style={styles.planMemoryPhoto} resizeMode="cover" />
              <View style={styles.planMemoryPhotoTopRow}>
                <View style={styles.planMemoryPhotoPill}>
                  <Ionicons name="images-outline" size={11} color="#fff" />
                  <Text style={styles.planMemoryPhotoPillText}>LINKED ALBUM</Text>
                </View>
                <View style={styles.planMemoryPhotoCounterPill}>
                  <Text style={styles.planMemoryPhotoCounterText}>
                    {item.photoIndex + 1}/{photoUrls.length}
                  </Text>
                </View>
              </View>
              {item.photoIndex === photoUrls.length - 1 && photoCount > photoUrls.length ? (
                <View style={styles.planMemoryMorePhotosPill}>
                  <Ionicons name="add" size={13} color="#fff" />
                  <Text style={styles.planMemoryMorePhotosText}>
                    {photoCount - photoUrls.length} more in the album
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )
        )}
      />

      <View style={styles.storyMemoryDetails}>
        {pages.length > 1 ? (
          <View style={styles.planMemoryPagerRow}>
            <View style={styles.eventMemoryDots}>
              {pages.map((page, index) => (
                <View
                  key={page.id}
                  style={[
                    styles.eventMemoryDot,
                    index === pageIndex && styles.eventMemoryDotActive,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.planMemoryAlbumLabel} numberOfLines={1}>
              {linkedAlbum?.title || 'Linked album'}
            </Text>
          </View>
        ) : null}

        <Text style={styles.storyMemoryBody} numberOfLines={4}>
          {plan.memoryNote || plan.note || 'A plan you completed and chose to keep in your shared history.'}
        </Text>
        <View style={styles.storyMemoryBottomRow}>
          <View style={styles.storyMemorySignals}>
            {plan.memoryAlbumId ? (
              <View style={styles.storyMemorySignalPill}>
                <Ionicons name="images-outline" size={12} color={theme.colors.text} />
                <Text style={styles.storyMemorySignalText}>
                  {photoCount > 0 ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : 'Album linked'}
                </Text>
              </View>
            ) : null}
            {plan.memoryPostId ? (
              <View style={styles.storyMemorySignalPill}>
                <Ionicons name="grid-outline" size={12} color={theme.colors.text} />
                <Text style={styles.storyMemorySignalText}>Post linked</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.planMemoryActions}>
            {linkedAlbum?.id ? (
              <Pressable onPress={openAlbum} style={({ pressed }) => [styles.storyMemoryAction, pressed && styles.pressed]}>
                <Text style={styles.storyMemoryActionText}>{photoCount > 0 ? 'All photos' : 'Album'}</Text>
                <Ionicons name="images-outline" size={13} color={theme.colors.text} />
              </Pressable>
            ) : null}
            <Pressable onPress={openDetails} style={({ pressed }) => [styles.storyMemoryAction, pressed && styles.pressed]}>
              <Text style={styles.storyMemoryActionText}>Memory details</Text>
              <Ionicons name="chevron-forward" size={13} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
});

const ImportantDateMemoryFeedCard = React.memo(function ImportantDateMemoryFeedCard({ item, width, height, navigation, styles, theme, conversationId, circleName }) {
  const date = formatMilestoneDate(item.dateValue);
  const categoryLabel = String(item.category || 'meaningful').replace(/_/g, ' ');
  const openDates = useCallback(() => {
    navigation.navigate('TwoPersonImportantDates', { conversationId, circleName });
  }, [circleName, conversationId, navigation]);

  return (
    <View style={[styles.storyMemoryCard, { height }]}>
      <View style={[styles.importantDateHero, { width, height: width }]}>
        <View style={styles.importantDateRingOuter} />
        <View style={styles.importantDateRingInner} />
        <View style={styles.importantDateHeroTopRow}>
          <View style={styles.softMemoryPill}>
            <Ionicons name="heart-outline" size={11} color={theme.colors.text} />
            <Text style={styles.softMemoryPillText}>MILESTONE</Text>
          </View>
          <Text style={styles.importantDateCategory}>{categoryLabel.toUpperCase()}</Text>
        </View>
        <View style={styles.importantDateCalendarBlock}>
          <Text style={styles.importantDateMonth}>{date.month}</Text>
          <Text style={styles.importantDateDay}>{date.day}</Text>
        </View>
        <View style={styles.importantDateHeroBottom}>
          <Text style={styles.importantDateHeroTitle} numberOfLines={3}>{item.title}</Text>
          <Text style={styles.importantDateFullDate}>{date.full}</Text>
        </View>
      </View>
      <View style={styles.storyMemoryDetails}>
        <Text style={styles.storyMemoryBody} numberOfLines={4}>
          {item.note || 'A date you chose to keep as part of your shared story.'}
        </Text>
        <View style={styles.storyMemoryBottomRow}>
          <View style={styles.storyMemorySignals}>
            {item.recurrence === 'yearly' ? (
              <View style={styles.storyMemorySignalPill}>
                <Ionicons name="repeat-outline" size={12} color={theme.colors.text} />
                <Text style={styles.storyMemorySignalText}>Yearly</Text>
              </View>
            ) : null}
          </View>
          <Pressable onPress={openDates} style={({ pressed }) => [styles.storyMemoryAction, pressed && styles.pressed]}>
            <Text style={styles.storyMemoryActionText}>Important Dates</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const ThoughtMemoryFeedCard = React.memo(function ThoughtMemoryFeedCard({ thought, width, height, navigation, styles, theme, conversationId, circleName }) {
  const openThought = useCallback(() => {
    writeNavigationCache(navigationCacheKeys.thought(thought.id), thought);
    navigation.navigate('TwoPersonThoughtDetail', {
      thoughtId: thought.id,
      conversationId,
      circleName,
    });
  }, [circleName, conversationId, navigation, thought]);

  return (
    <View style={[styles.storyMemoryCard, { height }]}>
      <View style={[styles.thoughtMemoryHero, { width, height: width }]}>
        <View style={styles.thoughtMemoryAccentOne} />
        <View style={styles.thoughtMemoryAccentTwo} />
        <View style={styles.thoughtMemoryHeader}>
          <View style={styles.thoughtMemoryAuthorRow}>
            <Avatar size={40} name={thought.authorName || 'Someone'} uri={thought.authorAvatarUrl || null} />
            <View style={styles.thoughtMemoryAuthorText}>
              <Text style={styles.thoughtMemoryEyebrow}>SHARED NOTE</Text>
              <Text style={styles.thoughtMemoryAuthorName} numberOfLines={1}>
                {thought.isAuthor ? 'Shared by you' : `Shared by ${thought.authorName || 'someone'}`}
              </Text>
            </View>
          </View>
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.circle.accent} />
        </View>
        <View style={styles.thoughtMemoryNote}>
          <Text style={styles.thoughtMemoryQuoteMark}>“</Text>
          <Text style={styles.thoughtMemoryTitle} numberOfLines={2}>{thought.title || 'A shared thought'}</Text>
          <Text style={styles.thoughtMemoryBody} numberOfLines={9}>{thought.body}</Text>
        </View>
      </View>
      <View style={styles.storyMemoryDetails}>
        <View style={styles.storyMemoryBottomRow}>
          <Text style={styles.thoughtMemorySharedAt}>
            {thought.sharedAt ? `Shared ${timeAgo(thought.sharedAt)}` : 'Shared with your Circle'}
          </Text>
          <Pressable onPress={openThought} style={({ pressed }) => [styles.storyMemoryAction, pressed && styles.pressed]}>
            <Text style={styles.storyMemoryActionText}>Read full note</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

function CircleTimelineFeedContent({ route, navigation }) {
  const {
    conversationId,
    initialMediaId,
    initialEventId,
    initialPlanId,
    initialImportantDateId,
    initialThoughtId,
    circleName = 'Circle',
    isTwoPersonCircle: routeTwoPersonCircle,
  } = route.params || {};
  const cachedDetails = readNavigationCache(navigationCacheKeys.conversationDetails(conversationId));
  const isTwoPersonCircle = typeof routeTwoPersonCircle === 'boolean'
    ? routeTwoPersonCircle
    : cachedDetails?.conversation?.kind === 'direct';
  const cachedItems = readNavigationCache(navigationCacheKeys.circleTimeline(conversationId));
  const hasInitialItems = Array.isArray(cachedItems);
  const initialItems = hasInitialItems ? cachedItems : [];
  const cachedMemories = readNavigationCache(navigationCacheKeys.circleEventMemories(conversationId));
  const hasInitialMemories = Array.isArray(cachedMemories);
  const initialMemories = hasInitialMemories ? cachedMemories : [];
  const cachedPlans = readNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId));
  const hasInitialPlans = Array.isArray(cachedPlans);
  const initialPlans = hasInitialPlans ? cachedPlans : [];
  const cachedDates = readNavigationCache(navigationCacheKeys.twoPersonDates(conversationId));
  const hasInitialDates = Array.isArray(cachedDates);
  const initialDates = hasInitialDates ? cachedDates : [];
  const cachedThoughts = readNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId));
  const hasInitialThoughts = Array.isArray(cachedThoughts);
  const initialThoughts = hasInitialThoughts ? cachedThoughts : [];
  const cachedAlbums = readNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId));
  const hasInitialAlbums = Array.isArray(cachedAlbums);
  const initialAlbums = hasInitialAlbums ? cachedAlbums : [];
  const hasAnyInitialMemory = isTwoPersonCircle
    ? hasInitialPlans || hasInitialDates || hasInitialThoughts
    : hasInitialMemories;
  const hasCompleteWarmState = hasInitialItems && (
    isTwoPersonCircle
      ? hasInitialPlans && hasInitialDates && hasInitialThoughts && hasInitialAlbums
      : hasInitialMemories
  );
  const theme = useThemeTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const stageWidth = Math.min(width - 24, 696);
  const cardHeight = stageWidth + 186;
  const [items, setItems] = useState(initialItems);
  const itemsRef = useRef(initialItems);
  const [eventMemories, setEventMemories] = useState(initialMemories);
  const [plans, setPlans] = useState(initialPlans);
  const [importantDates, setImportantDates] = useState(initialDates);
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [albums, setAlbums] = useState(initialAlbums);
  const [loading, setLoading] = useState(!hasInitialItems && !hasAnyInitialMemory);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(hasCompleteWarmState);
  const lastRefreshAtRef = useRef(hasCompleteWarmState ? Date.now() : 0);
  const loadInFlightRef = useRef(null);
  const realtimeTimerRef = useRef(null);

  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (loadInFlightRef.current) return loadInFlightRef.current;
    if (refresh) setRefreshing(true);
    else if (!quiet) setLoading(true);
    setError('');

    const request = (async () => {
      try {
        const jobs = [listConversationTimeline(conversationId)];
        if (isTwoPersonCircle) {
          jobs.push(
            listTwoPersonPlans(conversationId),
            listTwoPersonImportantDates(conversationId),
            listTwoPersonThoughts(conversationId),
            listTwoPersonAlbums(conversationId)
          );
        } else {
          jobs.push(listCircleEventMemories(conversationId));
        }

        const results = await Promise.allSettled(jobs);
        const timelineResult = results[0];
        let additiveMemoryCount = 0;

        if (isTwoPersonCircle) {
          const [plansResult, datesResult, thoughtsResult, albumsResult] = results.slice(1);

          if (plansResult?.status === 'fulfilled') {
            const rows = plansResult.value || [];
            setPlans(rows);
            writeNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId), rows);
            rows.forEach((plan) => writeNavigationCache(navigationCacheKeys.plan(plan.id), plan));
            additiveMemoryCount += rows.filter((plan) => plan.status === 'completed').length;
          }
          if (datesResult?.status === 'fulfilled') {
            const rows = datesResult.value || [];
            setImportantDates(rows);
            writeNavigationCache(navigationCacheKeys.twoPersonDates(conversationId), rows);
            rows.forEach((item) => writeNavigationCache(navigationCacheKeys.importantDate(item.id), item));
            additiveMemoryCount += rows.filter((item) => importantDateHasHappened(item.dateValue)).length;
          }
          if (thoughtsResult?.status === 'fulfilled') {
            const rows = thoughtsResult.value || [];
            setThoughts(rows);
            writeNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId), rows);
            rows.forEach((thought) => writeNavigationCache(navigationCacheKeys.thought(thought.id), thought));
            additiveMemoryCount += rows.filter((thought) => thought.status === 'shared').length;
          }
          if (albumsResult?.status === 'fulfilled') {
            const rows = albumsResult.value || [];
            setAlbums(rows);
            writeNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId), rows);
            rows.forEach((album) => writeNavigationCache(navigationCacheKeys.album(album.id), album));
          }
        } else {
          const memoriesResult = results[1];
          if (memoriesResult?.status === 'fulfilled') {
            const rows = memoriesResult.value || [];
            setEventMemories(rows);
            writeNavigationCache(navigationCacheKeys.circleEventMemories(conversationId), rows);
            rows.forEach((event) => {
              writeNavigationCache(navigationCacheKeys.eventSummary(event.id), event);
            });
            additiveMemoryCount += rows.length;
          } else {
            setEventMemories([]);
            writeNavigationCache(navigationCacheKeys.circleEventMemories(conversationId), []);
          }
        }

        if (timelineResult.status === 'fulfilled') {
          const reconciled = reconcileRowsById(
            itemsRef.current,
            timelineResult.value,
            sameTimelineItem
          );
          itemsRef.current = reconciled;
          setItems(reconciled);
          writeNavigationCache(navigationCacheKeys.circleTimeline(conversationId), reconciled);
        } else if (additiveMemoryCount > 0) {
          setError('Some shared media could not be refreshed. Your saved memories are still available.');
        } else {
          throw timelineResult.reason;
        }

        lastRefreshAtRef.current = Date.now();
      } catch (loadError) {
        setError(loadError?.message || 'Could not load this Circle Timeline.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();

    loadInFlightRef.current = request.finally(() => {
      loadInFlightRef.current = null;
    });
    return loadInFlightRef.current;
  }, [conversationId, isTwoPersonCircle]);

  useFocusEffect(
    useCallback(() => {
      if (isTwoPersonCircle) {
        const warmPlans = readNavigationCache(navigationCacheKeys.twoPersonPlans(conversationId));
        const warmDates = readNavigationCache(navigationCacheKeys.twoPersonDates(conversationId));
        const warmThoughts = readNavigationCache(navigationCacheKeys.twoPersonThoughts(conversationId));
        const warmAlbums = readNavigationCache(navigationCacheKeys.twoPersonAlbums(conversationId));
        if (Array.isArray(warmPlans)) setPlans(warmPlans);
        if (Array.isArray(warmDates)) setImportantDates(warmDates);
        if (Array.isArray(warmThoughts)) setThoughts(warmThoughts);
        if (Array.isArray(warmAlbums)) setAlbums(warmAlbums);
      } else {
        const warmMemories = readNavigationCache(navigationCacheKeys.circleEventMemories(conversationId));
        if (Array.isArray(warmMemories)) setEventMemories(warmMemories);
      }

      const warmMemories = !isTwoPersonCircle
        ? readNavigationCache(navigationCacheKeys.circleEventMemories(conversationId))
        : [];
      const needsTimelineMedia = !isTwoPersonCircle
        && Array.isArray(warmMemories)
        && warmMemories.some((event) => {
          const photoCount = Math.max(0, Number(event?.photoCount || 0));
          const inlineCount = Array.isArray(event?.timelineUrls) ? event.timelineUrls.length : 0;
          if (event?.timelineMediaSupported === false) return false;
          return photoCount > 0 && inlineCount < Math.min(photoCount, 6);
        });
      const isFresh = hasLoadedRef.current
        && !needsTimelineMedia
        && Date.now() - lastRefreshAtRef.current < TIMELINE_FOCUS_FRESH_MS;
      if (!isFresh) {
        void load({ quiet: hasLoadedRef.current || hasInitialItems || hasAnyInitialMemory }).finally(() => {
          hasLoadedRef.current = true;
        });
      }

      const scheduleRealtimeLoad = () => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => {
          realtimeTimerRef.current = null;
          void load({ quiet: true });
        }, TIMELINE_REALTIME_DEBOUNCE_MS);
      };

      const unsubscribers = [
        subscribeToConversationChanges({
          conversationId,
          onMessage: scheduleRealtimeLoad,
          onMediaChange: scheduleRealtimeLoad,
        }),
      ];

      if (isTwoPersonCircle) {
        unsubscribers.push(
          subscribeToTwoPersonPlanChanges({ conversationId, onChange: scheduleRealtimeLoad }),
          subscribeToTwoPersonImportantDateChanges({ conversationId, onChange: scheduleRealtimeLoad }),
          subscribeToTwoPersonThoughtChanges({ conversationId, onChange: scheduleRealtimeLoad }),
          subscribeToTwoPersonAlbumChanges({ conversationId, onChange: scheduleRealtimeLoad })
        );
      }

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe?.());
        if (realtimeTimerRef.current) {
          clearTimeout(realtimeTimerRef.current);
          realtimeTimerRef.current = null;
        }
      };
    }, [conversationId, hasAnyInitialMemory, hasInitialItems, isTwoPersonCircle, load])
  );

  const groups = useMemo(() => groupTimeline(items), [items]);
  const completedPlans = useMemo(
    () => plans.filter((plan) => plan.status === 'completed'),
    [plans]
  );
  const milestoneDates = useMemo(
    () => importantDates.filter((item) => importantDateHasHappened(item.dateValue)),
    [importantDates]
  );
  const sharedThoughts = useMemo(
    () => thoughts.filter((thought) => thought.status === 'shared'),
    [thoughts]
  );
  const albumsById = useMemo(
    () => new Map(albums.map((album) => [album.id, album])),
    [albums]
  );
  const feedItems = useMemo(() => [
    ...groups.map((group) => ({ ...group, kind: 'media_group', sortAt: group.createdAt })),
    ...eventMemories.map((event) => ({
      ...event,
      kind: 'event_memory',
      sortAt: event.completedAt || event.endsAt || event.startsAt,
    })),
    ...completedPlans.map((plan) => ({
      ...plan,
      linkedAlbum: plan.memoryAlbumId ? (albumsById.get(plan.memoryAlbumId) || null) : null,
      kind: 'plan_memory',
      sortAt: plan.completedAt || plan.updatedAt,
    })),
    ...milestoneDates.map((item) => ({
      ...item,
      kind: 'important_date_memory',
      sortAt: item.dateValue,
    })),
    ...sharedThoughts.map((thought) => ({
      ...thought,
      kind: 'thought_memory',
      sortAt: thought.sharedAt || thought.updatedAt,
    })),
  ].sort((left, right) => new Date(right.sortAt || 0) - new Date(left.sortAt || 0)), [
    albumsById,
    completedPlans,
    eventMemories,
    groups,
    milestoneDates,
    sharedThoughts,
  ]);

  const initialIndex = useMemo(() => {
    const index = feedItems.findIndex((item) => {
      if (item.kind === 'event_memory') return Boolean(initialEventId && item.id === initialEventId);
      if (item.kind === 'plan_memory') return Boolean(initialPlanId && item.id === initialPlanId);
      if (item.kind === 'important_date_memory') return Boolean(initialImportantDateId && item.id === initialImportantDateId);
      if (item.kind === 'thought_memory') return Boolean(initialThoughtId && item.id === initialThoughtId);
      return item.media.some((media) => media.id === initialMediaId);
    });
    return index >= 0 ? index : 0;
  }, [feedItems, initialEventId, initialImportantDateId, initialMediaId, initialPlanId, initialThoughtId]);

  const renderTimelineGroup = useCallback(({ item }) => {
    if (item.kind === 'event_memory') {
      return (
        <EventMemoryFeedCard
          event={item}
          width={stageWidth}
          height={cardHeight}
          navigation={navigation}
          styles={styles}
          theme={theme}
          conversationId={conversationId}
          circleName={circleName}
        />
      );
    }
    if (item.kind === 'plan_memory') {
      return (
        <PlanMemoryFeedCard
          plan={item}
          linkedAlbum={item.linkedAlbum}
          width={stageWidth}
          height={cardHeight}
          navigation={navigation}
          styles={styles}
          theme={theme}
          conversationId={conversationId}
          circleName={circleName}
        />
      );
    }
    if (item.kind === 'important_date_memory') {
      return (
        <ImportantDateMemoryFeedCard
          item={item}
          width={stageWidth}
          height={cardHeight}
          navigation={navigation}
          styles={styles}
          theme={theme}
          conversationId={conversationId}
          circleName={circleName}
        />
      );
    }
    if (item.kind === 'thought_memory') {
      return (
        <ThoughtMemoryFeedCard
          thought={item}
          width={stageWidth}
          height={cardHeight}
          navigation={navigation}
          styles={styles}
          theme={theme}
          conversationId={conversationId}
          circleName={circleName}
        />
      );
    }
    return (
      <TimelineFeedCard
        group={item}
        width={stageWidth}
        height={cardHeight}
        navigation={navigation}
        styles={styles}
        theme={theme}
      />
    );
  }, [cardHeight, circleName, conversationId, navigation, stageWidth, styles, theme]);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <CircleBackdrop conversationId={conversationId} />
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.circle.accent} />
          <Text style={styles.stateText}>Opening Timeline…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <CircleBackdrop conversationId={conversationId} />

      {error && !feedItems.length ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="alert-circle-outline" size={28} color={theme.colors.text} />
          </View>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          initialScrollIndex={feedItems.length ? initialIndex : undefined}
          getItemLayout={(_, index) => ({
            length: cardHeight + 12,
            offset: (cardHeight + 12) * index,
            index,
          })}
          renderItem={renderTimelineGroup}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          updateCellsBatchingPeriod={45}
          windowSize={6}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ refresh: true })}
              tintColor={theme.circle.accent}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.centerState}>
              <View style={styles.stateIcon}>
                <Ionicons name="images-outline" size={28} color={theme.colors.text} />
              </View>
              <Text style={styles.errorText}>No Circle memories yet.</Text>
              <Text style={styles.emptyBody}>
                Shared media, completed plans, milestones, notes, and gatherings will collect here as your history grows.
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

export function CircleTimelineFeedScreen(props) {
  const conversationId = props.route?.params?.conversationId;
  return (
    <CircleThemeBoundary conversationId={conversationId}>
      <CircleTimelineFeedContent {...props} />
    </CircleThemeBoundary>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.circle.profileBackground },
    listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 34, flexGrow: 1 },
    card: {
      width: '100%',
      maxWidth: 696,
      alignSelf: 'center',
      marginBottom: 12,
      backgroundColor: 'rgba(255,255,255,0.91)',
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      overflow: 'hidden',
      shadowColor: theme.circle.accent,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    authorRow: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
    authorText: { flex: 1, marginLeft: 10 },
    authorName: { fontFamily: 'Manrope_700Bold', color: theme.colors.text },
    privateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    time: { fontFamily: 'Manrope_400Regular', color: theme.colors.subtext, fontSize: 11 },
    archivePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
    },
    archiveLabel: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9 },
    mediaPage: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
    media: { width: '100%', height: '100%' },
    videoPage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c1e' },
    details: { flex: 1, paddingHorizontal: 13, paddingVertical: 12 },
    mediaCountPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 7,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
    },
    mediaCount: { color: theme.colors.text, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
    caption: { color: theme.colors.text, fontFamily: 'Manrope_400Regular', lineHeight: 19 },
    captionAuthor: { fontFamily: 'Manrope_700Bold' },
    captionMuted: { color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    eventMemoryCard: {
      width: '100%',
      maxWidth: 696,
      alignSelf: 'center',
      marginBottom: 12,
      backgroundColor: 'rgba(255,255,255,0.91)',
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      overflow: 'hidden',
      shadowColor: theme.circle.accent,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    eventMemoryPage: {
      backgroundColor: '#111',
      overflow: 'hidden',
    },
    eventMemoryHeroContent: { flex: 1, padding: 15, justifyContent: 'space-between' },
    eventMemoryTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    eventMemoryPill: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(10,18,42,0.48)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    eventMemoryPillText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.7 },
    eventMemoryDatePill: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    eventMemoryDate: { color: 'rgba(255,255,255,0.88)', fontFamily: 'Manrope_700Bold', fontSize: 10, textShadowColor: 'rgba(0,0,0,0.24)', textShadowRadius: 4 },
    eventMemoryTitlePlate: {
      alignSelf: 'flex-start',
      maxWidth: '92%',
      backgroundColor: 'transparent',
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    eventMemoryHeroTitle: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 27, lineHeight: 31, textShadowColor: 'rgba(0,0,0,0.28)', textShadowRadius: 6 },
    eventMemoryHeroLocationRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '92%' },
    eventMemoryHeroLocation: { flex: 1, color: 'rgba(255,255,255,0.9)', fontFamily: 'Manrope_600SemiBold', fontSize: 11, textShadowColor: 'rgba(0,0,0,0.24)', textShadowRadius: 4 },
    eventMemoryPhoto: { width: '100%', height: '100%' },
    eventMemoryPhotoTopRow: {
      position: 'absolute',
      left: 13,
      right: 13,
      top: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    eventMemoryPhotoPill: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(10,18,42,0.48)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    eventMemoryPhotoPillText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.65 },
    eventMemoryPhotoCounterPill: {
      minHeight: 27,
      minWidth: 44,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(10,18,42,0.48)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventMemoryPhotoCounterText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9.5 },
    eventMemoryMorePhotosPill: {
      position: 'absolute',
      right: 13,
      bottom: 13,
      minHeight: 32,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(10,18,42,0.58)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    eventMemoryMorePhotosText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9.5 },
    eventMemoryDetails: { flex: 1, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 11 },
    eventMemoryPagerRow: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    eventMemoryDots: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
    eventMemoryDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: 'rgba(19,32,51,0.16)' },
    eventMemoryDotActive: { width: 14, backgroundColor: theme.circle.accent },
    eventMemoryPageLabel: { flex: 1, textAlign: 'right', color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
    eventMemoryMetricRow: { marginTop: 8, flexDirection: 'row', gap: 7 },
    eventMemoryMetric: {
      minHeight: 32,
      paddingHorizontal: 9,
      borderRadius: 12,
      backgroundColor: theme.circle.accentSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    eventMemoryMetricText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9.8 },
    eventMemoryBottomRow: { flex: 1, marginTop: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    eventMemoryBody: { flex: 1, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 11.5, lineHeight: 16.5 },
    eventMemoryActions: { alignItems: 'flex-end', gap: 6 },
    eventMemoryActionPill: {
      minHeight: 31,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    eventMemoryActionText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9.2 },
    storyMemoryCard: {
      width: '100%',
      maxWidth: 696,
      alignSelf: 'center',
      marginBottom: 12,
      backgroundColor: 'rgba(255,255,255,0.91)',
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.circle.accentSoft,
      overflow: 'hidden',
      shadowColor: theme.circle.accent,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    storyMemoryDetails: { flex: 1, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 12 },
    storyMemoryBody: {
      color: theme.colors.text,
      fontFamily: 'Manrope_400Regular',
      fontSize: 12,
      lineHeight: 18,
    },
    storyMemoryBottomRow: {
      flex: 1,
      marginTop: 9,
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 10,
    },
    storyMemorySignals: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    storyMemorySignalPill: {
      minHeight: 29,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    storyMemorySignalText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9 },
    storyMemoryAction: {
      minHeight: 31,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: theme.circle.accentSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    storyMemoryActionText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9.2 },
    softMemoryPill: {
      minHeight: 28,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.58)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.78)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    softMemoryPillText: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.65 },
    planMemoryHero: {
      overflow: 'hidden',
      padding: 16,
      justifyContent: 'space-between',
      backgroundColor: theme.circle.accentSoft,
    },
    planMemoryOrbLarge: {
      position: 'absolute',
      width: 224,
      height: 224,
      borderRadius: 112,
      right: -62,
      top: -58,
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    planMemoryOrbSmall: {
      position: 'absolute',
      width: 112,
      height: 112,
      borderRadius: 56,
      left: -30,
      bottom: 28,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.42)',
    },
    planMemoryHeroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    planMemoryCompletedDate: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 10 },
    planMemoryHeroBottom: { maxWidth: '88%' },
    planMemoryHeroTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 30, lineHeight: 35 },
    planMemoryLocationRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
    planMemoryLocation: { flex: 1, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 12 },
    planMemoryPhotoPage: { backgroundColor: '#111', overflow: 'hidden' },
    planMemoryPhoto: { width: '100%', height: '100%' },
    planMemoryPhotoTopRow: {
      position: 'absolute',
      left: 13,
      right: 13,
      top: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    planMemoryPhotoPill: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(8,18,30,0.52)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    planMemoryPhotoPillText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.7 },
    planMemoryPhotoCounterPill: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(8,18,30,0.52)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    planMemoryPhotoCounterText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 10 },
    planMemoryMorePhotosPill: {
      position: 'absolute',
      right: 13,
      bottom: 13,
      minHeight: 30,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(8,18,30,0.6)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    planMemoryMorePhotosText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 10 },
    planMemoryPagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
    planMemoryAlbumLabel: { flex: 1, textAlign: 'right', color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 10 },
    planMemoryActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7 },
    importantDateHero: {
      overflow: 'hidden',
      padding: 16,
      backgroundColor: theme.circle.accentSoft,
    },
    importantDateRingOuter: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
      right: -105,
      top: -74,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.42)',
    },
    importantDateRingInner: {
      position: 'absolute',
      width: 178,
      height: 178,
      borderRadius: 89,
      right: -28,
      top: 14,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.46)',
    },
    importantDateHeroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    importantDateCategory: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.85 },
    importantDateCalendarBlock: { marginTop: 34 },
    importantDateMonth: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 16, letterSpacing: 2.1 },
    importantDateDay: { marginTop: -6, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 88, lineHeight: 98 },
    importantDateHeroBottom: { marginTop: 'auto', maxWidth: '88%' },
    importantDateHeroTitle: { color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 25, lineHeight: 30 },
    importantDateFullDate: { marginTop: 6, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
    thoughtMemoryHero: {
      overflow: 'hidden',
      padding: 16,
      backgroundColor: 'rgba(255,255,255,0.76)',
    },
    thoughtMemoryAccentOne: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      right: -42,
      top: -52,
      backgroundColor: theme.circle.accentSoft,
      opacity: 0.72,
    },
    thoughtMemoryAccentTwo: {
      position: 'absolute',
      width: 74,
      height: 74,
      borderRadius: 37,
      left: -22,
      bottom: 32,
      borderWidth: 2,
      borderColor: theme.circle.accentSoft,
    },
    thoughtMemoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    thoughtMemoryAuthorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
    thoughtMemoryAuthorText: { flex: 1, minWidth: 0 },
    thoughtMemoryEyebrow: { color: theme.colors.subtext, fontFamily: 'Manrope_700Bold', fontSize: 9, letterSpacing: 0.8 },
    thoughtMemoryAuthorName: { marginTop: 2, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 11 },
    thoughtMemoryNote: {
      flex: 1,
      marginTop: 22,
      paddingHorizontal: 16,
      paddingTop: 22,
      paddingBottom: 18,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.72)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.92)',
      shadowColor: theme.circle.accent,
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    thoughtMemoryQuoteMark: { color: theme.circle.accent, fontFamily: 'Manrope_700Bold', fontSize: 44, lineHeight: 40 },
    thoughtMemoryTitle: { marginTop: -2, color: theme.colors.text, fontFamily: 'Manrope_700Bold', fontSize: 22, lineHeight: 28 },
    thoughtMemoryBody: { marginTop: 10, color: theme.colors.text, fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 21 },
    thoughtMemorySharedAt: { flex: 1, color: theme.colors.subtext, fontFamily: 'Manrope_600SemiBold', fontSize: 10.5 },
    centerState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: 'transparent' },
    stateIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: theme.circle.accentSoft },
    stateText: { marginTop: 10, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular' },
    errorText: { marginTop: 12, color: theme.colors.text, fontFamily: 'Manrope_700Bold', textAlign: 'center' },
    emptyBody: { maxWidth: 320, marginTop: 6, color: theme.colors.subtext, fontFamily: 'Manrope_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
    retryButton: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: theme.welcome.brandInk },
    retryText: { color: '#fff', fontFamily: 'Manrope_700Bold' },
    pressed: { opacity: 0.72 },
  });
}
