type StorageAccessor = () => Storage;

const browserStorage: StorageAccessor = () => window.localStorage;

export function safeLocalStorage(accessStorage: StorageAccessor = browserStorage): Storage | null {
  try {
    return accessStorage();
  } catch {
    return null;
  }
}
