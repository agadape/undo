// Acknowledged alerts ("yes, that was me"), kept per browser in localStorage.
// Keys: "<account>:<transfer id>" for an outgoing transfer, "<account>:recovery:<new id>:<at>" for a recovery change.
const STORE = "undo.alerts.ack.v1";
export const ACK_EVENT = "undo:alerts-ack";

export const ackKey = (account: string, transferId: string) => `${account}:${transferId}`;
export const recoveryAckKey = (account: string, pending: [string, string]) => `${account}:recovery:${pending[0]}:${pending[1]}`;

export function loadAcks(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function ack(keys: string[]) {
  const all = loadAcks();
  keys.forEach((k) => all.add(k));
  try {
    // Keep the newest 500 so the list cannot grow forever.
    localStorage.setItem(STORE, JSON.stringify([...all].slice(-500)));
  } catch {
    /* private mode: the alert simply shows again after a reload */
  }
  window.dispatchEvent(new Event(ACK_EVENT));
}
