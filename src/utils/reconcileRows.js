/**
 * Reuses existing row objects when a refresh returns render-equivalent data.
 *
 * React Native lists can then skip rerendering rows that did not actually
 * change, even when the backend returns a brand-new array/object graph.
 */
export function reconcileRowsById(
  currentRows,
  incomingRows,
  isEquivalent,
  getId = (row) => row?.id
) {
  const current = Array.isArray(currentRows) ? currentRows : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];

  if (current.length === 0) return incoming;
  if (incoming.length === 0) return incoming;

  const currentById = new Map(
    current.map((row) => [getId(row), row]).filter(([id]) => id != null)
  );

  let arrayChanged = current.length !== incoming.length;
  const reconciled = incoming.map((nextRow, index) => {
    const previousRow = currentById.get(getId(nextRow));
    if (previousRow && isEquivalent(previousRow, nextRow)) {
      if (current[index] !== previousRow) arrayChanged = true;
      return previousRow;
    }

    arrayChanged = true;
    return nextRow;
  });

  if (!arrayChanged) {
    for (let index = 0; index < reconciled.length; index += 1) {
      if (reconciled[index] !== current[index]) return reconciled;
    }
    return current;
  }

  return reconciled;
}
