// 데이터, 교사 입장, 실시간 통신. Supabase 설정이 없으면 브라우저 안에서 도는 데모 모드로 동작한다.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { hangulToKeys } from './hangul.js';

export const MODE = SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'demo';

let clientPromise = null;
function client() {
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } }));
  }
  return clientPromise;
}

// ---------- 교사 입장 (모임 코드 + 별명) ----------
// 관리자가 오프라인으로 알려 준 모임 코드를 서버 함수가 확인한다. 이메일은 받지 않는다.

const TEACHER_KEY = 'dobble-teacher';

function loadTeacher() {
  try { return JSON.parse(localStorage.getItem(TEACHER_KEY)); } catch { return null; }
}

export function getTeacher() {
  if (MODE === 'demo') return { name: '데모' };
  const t = loadTeacher();
  return t?.code && t?.name ? t : null;
}

export class WrongCodeError extends Error {
  constructor() { super('모임 코드가 맞지 않아요. 관리자에게 받은 코드를 확인해 주세요.'); }
}

async function rpc(fn, args = {}) {
  const sb = await client();
  const t = getTeacher();
  const { data, error } = await sb.rpc(fn, { p_code: t?.code ?? args.p_code, ...args });
  if (error) {
    if (error.message?.includes('wrong_code')) throw new WrongCodeError();
    if (error.message?.includes('deck_too_large')) throw new Error('덱이 너무 커요. 사진 수를 줄여 주세요.');
    if (error.message?.includes('deck_not_found')) throw new Error('덱을 찾을 수 없어요. 다른 선생님이 지웠을 수 있어요.');
    throw new Error(`서버 오류: ${error.message}`);
  }
  return data;
}

// 모임 코드는 영문 소문자로 맞춘다. 한글 상태로 치거나(원미) 대문자로 쳐도(DNJSAL) 같은 코드(dnjsal)가 된다.
export function normalizeTeamCode(code) {
  return hangulToKeys(code.trim()).toLowerCase();
}

export async function signIn(rawCode, name) {
  const code = normalizeTeamCode(rawCode);
  await rpc('team_login', { p_code: code });
  localStorage.setItem(TEACHER_KEY, JSON.stringify({ code, name }));
}

export function signOut() {
  try { localStorage.removeItem(TEACHER_KEY); } catch {}
}

// ---------- 덱 저장 ----------
// 덱 = { id, name, author, items: [{ kind: 'word', text } | { kind: 'image', image: dataURL } | null] × 57 }

const DEMO_KEY = 'dobble-demo-sets';
function demoSets() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || []; } catch { return []; }
}
function writeDemoSets(sets) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(sets));
  } catch {
    throw new Error('브라우저 저장 공간이 부족해요. 사진 수를 줄이거나 다른 덱을 지워 주세요.');
  }
}

export async function listSets() {
  if (MODE === 'demo') {
    return demoSets()
      .map(({ id, name, author, updated_at }) => ({ id, name, author: author || '데모', updated_at }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  return rpc('list_decks');
}

export async function getSet(id) {
  if (MODE === 'demo') {
    const set = demoSets().find((s) => s.id === id);
    if (!set) throw new Error('덱을 찾을 수 없어요.');
    return structuredClone({ author: '데모', ...set });
  }
  const rows = await rpc('get_deck', { p_id: id });
  if (!rows?.length) throw new Error('덱을 찾을 수 없어요. 다른 선생님이 지웠을 수 있어요.');
  return rows[0];
}

export async function saveSet(set) {
  const author = getTeacher().name;
  if (MODE === 'demo') {
    const sets = demoSets();
    const id = set.id || crypto.randomUUID();
    const next = { id, name: set.name, author, items: set.items, updated_at: new Date().toISOString() };
    const i = sets.findIndex((s) => s.id === id);
    if (i >= 0) sets[i] = next; else sets.push(next);
    writeDemoSets(sets);
    return id;
  }
  return rpc('save_deck', { p_id: set.id || null, p_name: set.name, p_author: author, p_items: set.items });
}

export async function deleteSet(id) {
  if (MODE === 'demo') {
    writeDemoSets(demoSets().filter((s) => s.id !== id));
    return;
  }
  await rpc('delete_deck', { p_id: id });
}

// ---------- 사진 ----------
// 사진은 작게 줄여 덱 안에 넣는다. 카드 한 장(사진 8장)이 실시간 메시지 하나로 넉넉히 전달되는 크기다.
export async function uploadImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 220 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/webp', 0.78);
}

export async function imageUrl(image) {
  return image;
}

// ---------- 실시간 통신 ----------
// 판 상태는 DB에 쓰지 않고 메시지로만 주고받는다. Supabase는 '받는 사람 수만큼' 메시지를 세므로
// 방 하나에 길을 세 개 둬서, 필요한 사람만 받게 한다.
//   방 전체:     교사 → 모든 학생 (판 상태)
//   교사 우편함: 학생 → 교사 (입장, 접속 확인, 찾았어요). 다른 학생은 받지 않는다.
//   학생 우편함: 교사 → 그 학생 (카드, 입장 확인). 다른 학생은 받지 않는다.
// 보내는 쪽은 채널에 들어가지 않고 HTTP로 보낸다(보낼 때 1개 + 받는 사람마다 1개로 셈).

const topics = (code) => ({
  room: `dobble-${code}`,
  inbox: `dobble-${code}-t`,
  student: (id) => `dobble-${code}-s-${id}`,
});

const demoSenders = new Map();

async function listen(names, onMessage) {
  if (MODE === 'demo') {
    const chans = names.map((name) => {
      const bc = new BroadcastChannel(name);
      bc.onmessage = (e) => onMessage(e.data.event, e.data.payload);
      return bc;
    });
    return () => chans.forEach((bc) => bc.close());
  }
  const sb = await client();
  const chans = await Promise.all(names.map((name) => new Promise((resolve, reject) => {
    const ch = sb.channel(name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: '*' }, (msg) => onMessage(msg.event, msg.payload));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve(ch);
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`실시간 연결 실패 (${status})`));
    });
  })));
  return () => chans.forEach((ch) => sb.removeChannel(ch));
}

function post(topic, event, payload) {
  if (MODE === 'demo') {
    if (!demoSenders.has(topic)) demoSenders.set(topic, new BroadcastChannel(topic));
    demoSenders.get(topic).postMessage({ event, payload });
    return Promise.resolve();
  }
  return fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic, event, payload }] }),
    keepalive: event === 'bye',
  }).catch(() => {}); // 한 번 놓쳐도 다음 접속 확인 때 다시 맞춰진다
}

// 교사: 교사 우편함을 듣고, 방 전체나 학생 한 명에게 보낸다
export async function openTeacherLink(code, onMessage) {
  const t = topics(code);
  const close = await listen([t.inbox], onMessage);
  return {
    broadcast: (event, payload) => post(t.room, event, payload),
    sendTo: (id, event, payload) => post(t.student(id), event, payload),
    close,
  };
}

// 학생: 방 전체와 내 우편함을 듣고, 교사 우편함으로 보낸다
export async function openStudentLink(code, id, onMessage) {
  const t = topics(code);
  const close = await listen([t.room, t.student(id)], onMessage);
  return {
    send: (event, payload) => post(t.inbox, event, payload),
    close,
  };
}

// 헷갈리는 글자(0 O 1 I L)를 뺀 6자리
export function makeRoomCode() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}
