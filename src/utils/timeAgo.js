export function timeAgo(iso) {
  const timestamp = new Date(iso).getTime();

  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 1000)
  );

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(timestamp).toLocaleDateString();
}
