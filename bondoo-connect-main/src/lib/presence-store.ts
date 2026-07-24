// Shared, module-level online-presence store. `PresenceTracker` writes to it
// as the `presence:global` channel emits sync/join/leave; other components
// (chat header, etc.) read from it via `subscribePresence` without opening
// a second channel on the same topic (which would throw
// "cannot add `presence` callbacks ... after `subscribe()`").

type Listener = (online: Set<string>) => void;

let onlineUsers: Set<string> = new Set();
const listeners = new Set<Listener>();

export function setPresenceOnline(next: Set<string>) {
  onlineUsers = next;
  listeners.forEach((l) => l(onlineUsers));
}

export function getPresenceOnline(): Set<string> {
  return onlineUsers;
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

export function subscribePresence(listener: Listener): () => void {
  listeners.add(listener);
  // Fire immediately so subscribers get current state.
  listener(onlineUsers);
  return () => {
    listeners.delete(listener);
  };
}