// Which panel is showing. No DOM here on purpose: the view owns the aria
// attributes and classes, this owns the answer to "which one" and the fact
// that the answer survives a reload.

export function initialTab(names, stored) {
  return names.includes(stored) ? stored : names[0];
}

export function createTabs({
  names,
  storage = globalThis.localStorage,
  storageKey = 'fc:tab',
  onChange = () => {},
}) {
  const read = () => {
    try {
      return storage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  };

  let current = initialTab(names, read());

  return {
    names,
    current: () => current,
    select(name) {
      if (!names.includes(name) || name === current) return;
      current = name;
      try {
        // Storage being full or blocked is not a reason to refuse to switch
        // tabs; it only costs us the memory of which one.
        storage?.setItem(storageKey, name);
      } catch { /* not worth reporting */ }
      onChange(name);
    },
  };
}
