/**
 * Local-first storage for chat-driven contract drafts.
 * Drafts and chat sessions live in IndexedDB until the user clicks Deploy.
 * The server only sees finalized contracts via POST /api/v1/contracts.
 */

export interface DraftContract {
  id: string;                          // client_draft_id (uuid v4)
  template: string | null;             // 'a1-service-purchase' | 'd1-general-auth' | 'c1-api-access' | null
  params: Record<string, unknown>;     // extracted params so far
  principal: {                         // who's deploying
    wallet?: string;
    name?: string;
    email?: string;
  };
  ready_to_deploy: boolean;
  missing_params: string[];
  intent_summary: string | null;       // one-line summary of what the user asked for (for Drafts list)
  created_at: number;                  // unix ms
  updated_at: number;
}

export interface ChatSession {
  id: string;                          // matches DraftContract.id
  turns: { role: 'user' | 'assistant'; content: string; ts: number }[];
}

const DB_NAME = 'ambr_local';
const DB_VERSION = 1;
const DRAFTS_STORE = 'draft_contracts';
const SESSIONS_STORE = 'chat_sessions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const store = db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
    };
  });
}

export function newDraftId(): string {
  // crypto.randomUUID is available in modern browsers + Node 19+; fall back to
  // a simple time-based id if not present (extremely rare in our target).
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveDraft(draft: DraftContract): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(DRAFTS_STORE).put({ ...draft, updated_at: Date.now() });
  });
  db.close();
}

export async function loadDraft(id: string): Promise<DraftContract | null> {
  const db = await openDb();
  const result = await new Promise<DraftContract | null>((resolve, reject) => {
    const tx = db.transaction(DRAFTS_STORE, 'readonly');
    const req = tx.objectStore(DRAFTS_STORE).get(id);
    req.onsuccess = () => resolve((req.result as DraftContract | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function listDrafts(): Promise<DraftContract[]> {
  const db = await openDb();
  const result = await new Promise<DraftContract[]>((resolve, reject) => {
    const tx = db.transaction(DRAFTS_STORE, 'readonly');
    const req = tx.objectStore(DRAFTS_STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as DraftContract[]) ?? [];
      all.sort((a, b) => b.updated_at - a.updated_at);
      resolve(all);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([DRAFTS_STORE, SESSIONS_STORE], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(DRAFTS_STORE).delete(id);
    tx.objectStore(SESSIONS_STORE).delete(id);
  });
  db.close();
}

export async function saveSession(session: ChatSession): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(SESSIONS_STORE).put(session);
  });
  db.close();
}

export async function loadSession(id: string): Promise<ChatSession | null> {
  const db = await openDb();
  const result = await new Promise<ChatSession | null>((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const req = tx.objectStore(SESSIONS_STORE).get(id);
    req.onsuccess = () => resolve((req.result as ChatSession | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}
