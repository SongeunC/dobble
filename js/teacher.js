import * as api from './backend.js';
import {
  CARDS, ITEMS_PER_SET, DEFAULT_ITEMS, DEFAULT_SET_NAME, isEmoji, isFilled, renderCard,
} from './dobble.js';
import { SHAPE_ITEMS, SHAPE_SET_NAME } from './shapes.js';

// 앱에 들어 있는 세트. 고칠 때는 복사본을 만든다.
const BUILTIN_SETS = [
  { id: null, builtin: true, name: DEFAULT_SET_NAME, meta: '기본 제공 · 이모지 57개', items: DEFAULT_ITEMS },
  { id: null, builtin: true, name: SHAPE_SET_NAME, meta: '기본 제공 · 서로 다른 도형 57가지', items: SHAPE_ITEMS },
];

const $ = (id) => document.getElementById(id);
const views = ['loginView', 'setsView', 'editorView', 'roomView', 'summaryView'];
const ROOM_KEY = 'dobble-room';
const ONLINE_MS = 25000;   // 이 시간 안에 신호가 있으면 접속 중 (학생은 10초마다 신호)

function show(name) {
  for (const v of views) $(v).hidden = v !== name;
  window.scrollTo(0, 0);
}
function showError(id, err) {
  $(id).textContent = err ? (err.message || String(err)) : '';
  $(id).hidden = !err;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================= 시작과 로그인 =================

let me = null; // { name }

async function boot() {
  if (api.MODE === 'demo') $('modeBadge').hidden = false;
  me = api.getTeacher();
  if (!me) return show('loginView');
  if (api.MODE !== 'demo') {
    $('who').textContent = me.name;
    $('logoutBtn').hidden = false;
  }
  if (restoreRoom()) return;
  await openSets();
}

$('loginView').onsubmit = async (e) => {
  e.preventDefault();
  showError('loginError', null);
  $('loginBtn').disabled = true;
  try {
    await api.signIn($('teamCode').value.trim(), $('teacherName').value.trim());
    await boot();
  } catch (err) {
    showError('loginError', err);
  } finally {
    $('loginBtn').disabled = false;
  }
};
$('logoutBtn').onclick = () => { api.signOut(); location.reload(); };

// 관리자가 모임 코드를 바꾸면 예전 코드로 들어온 선생님은 다시 입장해야 한다
function handleError(id, err) {
  if (err instanceof api.WrongCodeError) {
    api.signOut();
    show('loginView');
    showError('loginError', '모임 코드가 바뀌었어요. 관리자에게 새 코드를 받아 다시 들어와 주세요.');
    return;
  }
  showError(id, err);
}

// ================= 세트 목록 =================

async function openSets() {
  show('setsView');
  showError('setsError', null);
  const list = $('setList');
  list.innerHTML = '<p class="muted">불러오는 중…</p>';
  let sets = [];
  try { sets = await api.listSets(); } catch (e) { return handleError('setsError', e); }
  const rows = [...BUILTIN_SETS, ...sets];
  list.innerHTML = '';
  for (const s of rows) {
    const row = document.createElement('div');
    row.className = 'panel set-row';
    // 내가 만든 덱만 고치고 지운다. 기본 세트와 다른 선생님 덱은 복사해서 고친다.
    const mine = !s.builtin && s.author === me.name;
    const when = s.builtin ? '' : new Date(s.updated_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
    const meta = s.builtin ? s.meta : `${mine ? '내 덱' : `${s.author} 선생님`} · ${when}`;
    const edit = () => (mine ? openEditor(s.id) : openEditor(s.id, s.builtin ? s.items : null, true));
    row.innerHTML = `<div class="name" title="눌러서 고치기">${esc(s.name)}<span class="meta">${esc(meta)} · 눌러서 고치기</span></div>`;
    row.querySelector('.name').onclick = edit;
    row.append(button('이 세트로 방 열기', 'btn primary small', () => startRoomFromSet(s)));
    if (mine) {
      row.append(button('고치기', 'btn small', edit));
      row.append(button('삭제', 'btn small danger', async () => {
        if (!confirm(`'${s.name}' 덱을 지울까요? 모임의 다른 선생님도 더는 쓸 수 없고, 되돌릴 수 없어요.`)) return;
        try { await api.deleteSet(s.id); openSets(); } catch (e) { handleError('setsError', e); }
      }));
    } else {
      row.append(button('복사해서 고치기', 'btn small', edit));
    }
    list.append(row);
  }
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

$('newSetBtn').onclick = () => openEditor(null, DEFAULT_ITEMS);

// ================= 세트 편집기 =================

let editing = null; // { id, name, items: [item|null] × 57 }
let startIndex = 0;

const withUrls = (items) => items.map((i) => {
  if (!i) return null;
  return i.kind === 'image' ? { kind: 'image', image: i.image, url: i.image } : { kind: 'word', text: i.text };
});

// id만: 내 덱 고치기 / copy: 그 덱(또는 template 항목)을 복사해 새 덱으로 / 둘 다 없음: 새 덱
async function openEditor(id, template = null, copy = false) {
  showError('editorError', null);
  if (id && !template) {
    try {
      const set = await api.getSet(id);
      editing = copy
        ? { id: null, name: `${set.name} (복사)`.slice(0, 40), items: withUrls(set.items) }
        : { id: set.id, name: set.name, items: withUrls(set.items) };
    } catch (e) { return handleError('setsError', e); }
  } else {
    editing = {
      id: null,
      name: '',
      items: template ? withUrls(template) : Array(ITEMS_PER_SET).fill(null),
    };
  }
  startIndex = 0;
  $('setName').value = editing.name;
  show('editorView');
  renderGrid();
  $('setName').focus();
}

function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  const words = editing.items.map((i) => (i?.kind === 'word' ? i.text.trim().toLowerCase() : null));
  const dupSet = new Set(words.filter((w, i) => w && words.indexOf(w) !== i));
  editing.items.forEach((item, i) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    if (i === startIndex) tile.classList.add('start');
    let inner = `<span class="num">${i + 1}</span>`;
    if (!isFilled(item)) {
      tile.classList.add('empty');
      inner += '비어 있음';
    } else if (item.kind === 'image') {
      inner += `<img src="${esc(item.url)}" alt="">`;
    } else if (isEmoji(item.text)) {
      inner += `<span class="emo">${esc(item.text)}</span>`;
    } else {
      inner += esc(item.text);
      if (dupSet.has(words[i])) tile.classList.add('dup');
    }
    tile.innerHTML = inner;
    tile.onclick = () => { startIndex = i; renderGrid(); openItemDialog(i); };
    grid.append(tile);
  });
  const filled = editing.items.filter(isFilled).length;
  $('itemCount').textContent = `${filled} / ${ITEMS_PER_SET}`;
  $('itemCount').classList.toggle('done', filled === ITEMS_PER_SET);
  $('dupNotice').hidden = dupSet.size === 0;
  $('dupNotice').textContent = `같은 단어가 두 번 이상 있어요: ${[...dupSet].join(', ')}. 카드에서 공통 그림이 두 개로 보일 수 있어요.`;
}

// --- 칸 하나 고치기 ---
let dialogIndex = 0;
let dialogImage = null; // { image, url }

function openItemDialog(i) {
  dialogIndex = i;
  const item = editing.items[i];
  dialogImage = item?.kind === 'image' ? { image: item.image, url: item.url } : null;
  $('itemTitle').textContent = `${i + 1}번 칸`;
  $('itemWord').value = item?.kind === 'word' ? item.text : '';
  $('itemImageName').textContent = dialogImage ? '이미지가 들어 있어요' : '';
  $('itemDialog').showModal();
  $('itemWord').focus();
}

$('itemImageBtn').onclick = () => $('itemImageInput').click();
$('itemImageInput').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  $('itemImageName').textContent = '올리는 중…';
  try {
    const image = await api.uploadImage(file);
    dialogImage = { image, url: await api.imageUrl(image) };
    $('itemWord').value = '';
    $('itemImageName').textContent = file.name;
  } catch (err) {
    $('itemImageName').textContent = `실패: ${err.message}`;
  }
};
$('itemWord').oninput = () => {
  if ($('itemWord').value) { dialogImage = null; $('itemImageName').textContent = ''; }
};
$('itemForm').onsubmit = () => {
  const word = $('itemWord').value.trim();
  editing.items[dialogIndex] = word
    ? { kind: 'word', text: word }
    : dialogImage ? { kind: 'image', ...dialogImage } : null;
  startIndex = Math.min(dialogIndex + 1, ITEMS_PER_SET - 1);
  renderGrid();
};
$('itemClearBtn').onclick = () => {
  editing.items[dialogIndex] = null;
  $('itemDialog').close();
  renderGrid();
};
$('itemCancelBtn').onclick = () => $('itemDialog').close();

// --- 단어 붙여넣기 ---
function parseWords(text) {
  return text.split(/[\n,\t]+/).map((w) => w.trim()).filter(Boolean);
}
$('pasteBtn').onclick = () => {
  $('pasteStart').textContent = `${startIndex + 1}번`;
  $('pasteText').value = '';
  $('pasteCount').textContent = '0개';
  $('pasteDialog').showModal();
  $('pasteText').focus();
};
$('pasteText').oninput = () => {
  const n = parseWords($('pasteText').value).length;
  const room = ITEMS_PER_SET - startIndex;
  $('pasteCount').textContent = n > room ? `${n}개 (앞의 ${room}개만 들어가요)` : `${n}개`;
};
$('pasteForm').onsubmit = () => {
  const words = parseWords($('pasteText').value).slice(0, ITEMS_PER_SET - startIndex);
  words.forEach((w, k) => { editing.items[startIndex + k] = { kind: 'word', text: w.slice(0, 12) }; });
  startIndex = Math.min(startIndex + words.length, ITEMS_PER_SET - 1);
  renderGrid();
};
$('pasteCancelBtn').onclick = () => $('pasteDialog').close();

// --- 이미지 여러 장 ---
$('imagesBtn').onclick = () => $('imagesInput').click();
$('imagesInput').onchange = async (e) => {
  const files = [...e.target.files].slice(0, ITEMS_PER_SET - startIndex);
  e.target.value = '';
  if (!files.length) return;
  showError('editorError', null);
  const hint = $('editorHint').textContent;
  let i = startIndex;
  let done = 0;
  for (const file of files) {
    $('editorHint').textContent = `이미지 올리는 중… ${done + 1} / ${files.length}`;
    try {
      const image = await api.uploadImage(file);
      editing.items[i] = { kind: 'image', image, url: await api.imageUrl(image) };
      i++;
      done++;
      renderGrid();
    } catch (err) {
      showError('editorError', `${file.name}: ${err.message}`);
    }
  }
  startIndex = Math.min(i, ITEMS_PER_SET - 1);
  $('editorHint').textContent = hint;
  renderGrid();
};

$('fillDefaultBtn').onclick = () => {
  const used = new Set(editing.items.filter((i) => i?.kind === 'word').map((i) => i.text));
  const spare = DEFAULT_ITEMS.filter((d) => !used.has(d.text));
  editing.items = editing.items.map((item) => (isFilled(item) ? item : spare.length ? { ...spare.shift() } : null));
  renderGrid();
};
$('clearBtn').onclick = () => {
  if (!confirm('57칸을 모두 비울까요?')) return;
  editing.items = Array(ITEMS_PER_SET).fill(null);
  startIndex = 0;
  renderGrid();
};

// --- 미리보기 ---
function drawPreview() {
  const card = CARDS[Math.floor(Math.random() * CARDS.length)];
  const items = card.map((s) => {
    const it = editing.items[s];
    if (!isFilled(it)) return { kind: 'word', text: `${s + 1}번?` };
    return it.kind === 'image' ? { kind: 'image', url: it.url } : { kind: 'word', text: it.text };
  });
  renderCard($('previewCard'), items);
}
$('previewBtn').onclick = () => { $('previewDialog').showModal(); drawPreview(); };
$('previewNextBtn').onclick = drawPreview;
$('previewCloseBtn').onclick = () => $('previewDialog').close();

// --- 저장 ---
$('saveSetBtn').onclick = async () => {
  const name = $('setName').value.trim();
  if (!name) { showError('editorError', '세트 이름을 적어 주세요.'); $('setName').focus(); return; }
  showError('editorError', null);
  $('saveSetBtn').disabled = true;
  try {
    const items = editing.items.map((i) => {
      if (!isFilled(i)) return null;
      return i.kind === 'image' ? { kind: 'image', image: i.image } : { kind: 'word', text: i.text.trim() };
    });
    editing.id = await api.saveSet({ id: editing.id, name, items });
    editing.name = name;
    const filled = items.filter(Boolean).length;
    $('editorHint').textContent = filled < ITEMS_PER_SET
      ? `저장했어요. 방을 열려면 ${ITEMS_PER_SET - filled}칸을 더 채워야 해요.`
      : '저장했어요.';
  } catch (e) {
    handleError('editorError', e);
  } finally {
    $('saveSetBtn').disabled = false;
  }
};
$('cancelEditBtn').onclick = () => openSets();

// ================= 방 진행 =================
// 교사 기기가 판의 진행자다. 카드 배정과 점수는 여기서만 계산하고, 새로고침에 대비해 탭 저장소에 남긴다.

let room = null;
// room = { code, setName, items: [{kind,text?,url?}] × 57, status, sound, endReason,
//          groupCount, groupMode: 'random' | 'join' | 'manual', groups: [{ pile: [카드 번호], pileStart, done }],
//          students: { id: { nick, score, cardId, group, lastSeen, joinedAt } } }
let channel = null;
let ticker = null;

async function startRoomFromSet(s) {
  showError('setsError', null);
  let items;
  try {
    const raw = s.builtin ? s.items : (await api.getSet(s.id)).items;
    if (raw.filter(isFilled).length < ITEMS_PER_SET) {
      throw new Error(`'${s.name}' 세트가 아직 ${ITEMS_PER_SET}칸을 다 채우지 않았어요. 고치기에서 채워 주세요.`);
    }
    items = await Promise.all(raw.map(async (i) => (i.kind === 'image'
      ? { kind: 'image', url: await api.imageUrl(i.image) }
      : { kind: 'word', text: i.text })));
  } catch (e) { return handleError('setsError', e); }
  room = {
    code: api.makeRoomCode(), setName: s.name, items, status: 'lobby', sound: false, endReason: null,
    groupCount: null, groupMode: 'random', groups: [], students: {},
  };
  await enterRoom();
}

function saveRoom() {
  try { sessionStorage.setItem(ROOM_KEY, JSON.stringify(room)); } catch {}
}

function restoreRoom() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ROOM_KEY));
    if (!saved?.code) return false;
    room = saved;
    enterRoom();
    return true;
  } catch { return false; }
}

async function enterRoom() {
  saveRoom();
  try {
    channel = await api.openTeacherLink(room.code, onMessage);
  } catch (e) {
    alert(e.message);
    room = null;
    sessionStorage.removeItem(ROOM_KEY);
    return openSets();
  }
  const url = new URL('index.html', location.href);
  url.searchParams.set('room', room.code);
  $('roomCode').textContent = room.code;
  $('joinUrl').textContent = url.href;
  $('qr').innerHTML = '';
  if (window.QRCode) new QRCode($('qr'), { text: url.href, width: 440, height: 440, correctLevel: QRCode.CorrectLevel.M });
  $('roomSetName').textContent = room.setName;
  $('soundToggle').checked = room.sound;
  clearInterval(ticker);
  // 화면은 4초마다 다시 그리고, 판 상태는 10초마다 다시 알린다(메시지 수를 아끼려고)
  let tick = 0;
  ticker = setInterval(() => { if (++tick % 3 === 0) broadcastState(); renderRoom(); }, 4000);
  broadcastState();
  if (room.status === 'ended') showSummary(); else { show('roomView'); renderRoom(); }
}

// 받는 학생(to)이 있으면 그 학생에게만, 없으면 방 전체에 보낸다
function send(event, payload) {
  if (!channel) return;
  if (payload?.to) channel.sendTo(payload.to, event, payload);
  else channel.broadcast(event, payload);
}

// 판 상태와 함께 누가 몇 모둠인지, 어느 모둠이 끝났는지 알린다
function broadcastState() {
  const groups = {};
  for (const [id, st] of Object.entries(room.students)) if (st.group) groups[id] = st.group;
  const done = (room.groups || []).map((g, i) => (g.done ? i + 1 : 0)).filter(Boolean);
  send('state', { status: room.status, sound: room.sound, groups, done });
}

function isOnline(st) { return Date.now() - st.lastSeen < ONLINE_MS; }

// ---------- 모둠 ----------
// 모둠마다 57장 더미를 따로 둔다. 학생은 같은 모둠 친구와만 카드를 비교하므로,
// 모둠 안에서만 카드가 겹치지 않으면 된다.

const groupNos = () => Array.from({ length: room.groupCount }, (_, i) => i + 1);
const members = (g, onlineOnly = false) => Object.entries(room.students)
  .filter(([, st]) => st.group === g && (!onlineOnly || isOnline(st)));
const onlineStudents = () => Object.entries(room.students)
  .filter(([, st]) => isOnline(st))
  .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

// 4명 안팎이 한 모둠이 되도록 제안한다
function suggestGroupCount(n) {
  return Math.max(1, Math.min(10, Math.round(n / 4) || 1));
}

// 인원이 가장 적은 모둠. activeOnly면 판이 진행 중인(더미가 남은) 모둠만 본다.
function smallestGroup(activeOnly) {
  const candidates = groupNos().filter((g) => !activeOnly || (room.groups[g - 1] && !room.groups[g - 1].done));
  if (!candidates.length) return null;
  return candidates.reduce((best, g) => (members(g, true).length < members(best, true).length ? g : best));
}

// 랜덤 또는 입장 순으로 고르게 나눈다: 22명 5모둠이면 5·4·5·4·4명
function assignGroups(mode) {
  const list = onlineStudents();
  if (mode === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const G = room.groupCount;
  list.forEach(([, st], i) => { st.group = Math.floor((i * G) / list.length) + 1; });
}

// ---------- 카드 더미 ----------
// 실물 도블처럼 카드 더미로 진행한다. 시작할 때 모둠마다 57장을 섞어 한 장씩 나눠 주고 나머지는 더미로 둔다.
// 찾으면 더미 맨 위 카드를 받고 쓰던 카드는 버린다(다시 나오지 않음). 모둠 더미가 바닥나면 그 모둠은 끝난다.

function drawCard(g) {
  const pile = room.groups[g - 1]?.pile;
  return pile?.length ? pile.pop() : null;
}

function sendCard(id) {
  const st = room.students[id];
  if (st?.cardId == null) return;
  send('card', { to: id, cardId: st.cardId, items: CARDS[st.cardId].map((s) => room.items[s]) });
}

// 카드가 없으면 한 장 주고, 있으면 다시 보내 준다. 모둠이 없으면(늦게 온 학생) 인원이 적은 모둠에 넣는다.
function ensureCard(id) {
  const st = room.students[id];
  if (!st.group || !room.groups[st.group - 1]) {
    st.group = smallestGroup(true);
    if (!st.group) return false;
    broadcastState();
  }
  if (room.groups[st.group - 1].done) return true; // 모둠이 이미 끝났으면 카드 없이 끝 화면
  if (st.cardId === null) st.cardId = drawCard(st.group);
  if (st.cardId === null) return false;
  sendCard(id);
  return true;
}

function endGame(reason) {
  room.endReason = reason;
  setStatus('ended');
  showSummary();
}

function onMessage(event, p) {
  if (!p?.id || !['hello', 'ping', 'found', 'bye'].includes(event)) return;
  let st = room.students[p.id];

  if (event === 'bye') {
    if (st) { st.lastSeen = Date.now() - ONLINE_MS; saveRoom(); renderRoom(); }
    return;
  }
  if (!st) {
    if (event === 'found') return;
    st = room.students[p.id] = { nick: String(p.nick || '학생').slice(0, 10), score: 0, cardId: null, group: null, lastSeen: 0, joinedAt: Date.now() };
  }
  st.lastSeen = Date.now();

  if (event === 'hello') {
    send('welcome', { to: p.id });
    broadcastState();
    if ((room.status === 'playing' || room.status === 'paused') && !ensureCard(p.id)) {
      send('reject', { to: p.id, reason: '모든 모둠의 카드가 다 떨어져서 이번 판에는 들어올 수 없어요. 다음 판에 들어와 주세요.' });
      delete room.students[p.id];
    }
  } else if (event === 'ping') {
    if (room.status === 'playing' && p.cardId !== st.cardId) ensureCard(p.id);
  } else if (event === 'found') {
    if (room.status !== 'playing' || !st.group) return;
    const grp = room.groups[st.group - 1];
    if (!grp || grp.done) return;
    if (p.cardId !== st.cardId) { sendCard(p.id); return; } // 이미 바뀐 카드로 누른 신호는 무시
    st.score += 1;
    const next = drawCard(st.group);
    if (next !== null) {
      st.cardId = next;
      sendCard(p.id);
    }
    if (!grp.pile.length) {
      grp.done = true;
      broadcastState();
      if (room.groups.every((g) => g.done)) endGame('deck');
    }
  }
  saveRoom();
  renderRoom();
}

// ---------- 방 화면 ----------

const STATUS_LABEL = { lobby: '입장 중', playing: '진행 중', paused: '일시정지', ended: '종료' };
const MODE_HINT = {
  random: '‘모둠 나누기’를 누르면 접속한 학생을 무작위로 고르게 나눠요. 나눈 뒤 아래 표에서 한 명씩 바꿀 수 있어요.',
  join: '‘모둠 나누기’를 누르면 들어온 순서대로 앞에서부터 나눠요. 나눈 뒤 아래 표에서 한 명씩 바꿀 수 있어요.',
  manual: '아래 표에서 학생마다 모둠을 골라 주세요.',
};

function renderRoom() {
  if (!room || $('roomView').hidden) return;
  const s = room.status;
  const lobby = s === 'lobby';
  $('statusPill').textContent = STATUS_LABEL[s];
  $('statusPill').className = `status-pill ${s}`;
  $('startBtn').hidden = !lobby;
  $('pauseBtn').hidden = s !== 'playing';
  $('resumeBtn').hidden = s !== 'paused';
  $('endBtn').hidden = lobby;
  $('closeRoomBtn').hidden = !lobby;

  const list = Object.entries(room.students).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const online = list.filter(([, st]) => isOnline(st));
  // 선생님이 손대기 전까지는 들어온 학생 수에 맞춰 모둠 수를 제안한다
  if (lobby && !room.groupTouched) room.groupCount = suggestGroupCount(online.length);
  $('studentCount').textContent = `학생 ${list.length}명 · 접속 ${online.length}명 · ${room.groupCount}모둠`;
  $('noStudents').hidden = list.length > 0;
  $('startBtn').disabled = online.length < 2;

  // 모둠 나누기(시작 전에만)
  $('groupingBox').hidden = !lobby;
  $('studentTableBox').hidden = !lobby;
  if (lobby) {
    if (document.activeElement !== $('groupCount')) $('groupCount').value = room.groupCount;
    for (const b of $('groupModeSeg').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === room.groupMode);
    $('assignBtn').hidden = room.groupMode === 'manual';
    $('groupHint').textContent = MODE_HINT[room.groupMode];
    // 고르는 중인 목록은 다시 그리지 않는다(드롭다운이 닫히지 않게)
    if (!$('studentRows').contains(document.activeElement)) {
      const options = (g) => ['<option value="">미정</option>', ...groupNos().map((n) => `<option value="${n}"${g === n ? ' selected' : ''}>${n}모둠</option>`)].join('');
      $('studentRows').innerHTML = list.map(([id, st]) => `
        <tr>
          <td>${esc(st.nick)}</td>
          <td><span class="dot ${isOnline(st) ? '' : 'off'}"></span>${isOnline(st) ? '접속' : '끊김'}</td>
          <td><select class="group-select ${st.group ? '' : 'unset'}" data-id="${esc(id)}">${options(st.group)}</select></td>
        </tr>`).join('');
    }
  }
  const unassigned = online.filter(([, st]) => !st.group);
  $('unassigned').textContent = lobby && unassigned.length
    ? `모둠 미정 ${unassigned.length}명 (시작하면 인원이 적은 모둠에 들어가요)` : '';

  renderBoards();
}

function renderBoards() {
  const playing = room.status !== 'lobby';
  $('boards').innerHTML = groupNos().map((g) => {
    const mem = members(g).sort((a, b) => (playing ? b[1].score - a[1].score : a[1].joinedAt - b[1].joinedAt));
    const grp = room.groups?.[g - 1];
    let meta = `${mem.length}명`;
    let bar = '';
    if (playing && grp) {
      meta = grp.done ? '카드를 다 찾았어요!' : `남은 카드 ${grp.pile.length}장`;
      bar = `<div class="board-track"><div class="board-bar" style="width:${grp.pileStart ? (grp.pile.length / grp.pileStart) * 100 : 0}%"></div></div>`;
    }
    const rows = mem.length
      ? `<ul>${mem.map(([, st]) => `<li><span class="dot ${isOnline(st) ? '' : 'off'}"></span>${esc(st.nick)}${playing ? `<span class="pts">${st.score}</span>` : ''}</li>`).join('')}</ul>`
      : '<div class="empty-note">아직 아무도 없어요</div>';
    return `<div class="board ${playing && grp?.done ? 'done' : ''}">
      <div class="board-head"><span class="board-name">${g}모둠</span><span class="board-meta">${meta}</span></div>
      ${bar}${rows}
    </div>`;
  }).join('');
}

function setStatus(status) {
  room.status = status;
  broadcastState();
  saveRoom();
  renderRoom();
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

$('groupCount').onchange = () => {
  const n = Math.max(1, Math.min(10, Number($('groupCount').value) || 1));
  room.groupCount = n;
  room.groupTouched = true;
  for (const st of Object.values(room.students)) if (st.group > n) st.group = null;
  broadcastState();
  saveRoom();
  renderRoom();
};
$('groupModeSeg').onclick = (e) => {
  const mode = e.target.closest('button')?.dataset.mode;
  if (!mode) return;
  room.groupMode = mode;
  saveRoom();
  renderRoom();
};
$('assignBtn').onclick = () => {
  room.groupTouched = true;
  assignGroups(room.groupMode);
  broadcastState();
  saveRoom();
  renderRoom();
};
$('studentRows').onchange = (e) => {
  const sel = e.target.closest('select');
  const st = sel && room.students[sel.dataset.id];
  if (!st) return;
  st.group = Number(sel.value) || null;
  room.groupTouched = true;
  sel.blur();
  broadcastState();
  saveRoom();
  renderRoom();
};

$('startBtn').onclick = () => {
  showError('roomError', null);
  // 모둠이 없는 학생은 인원이 적은 모둠에 넣는다
  for (const [, st] of onlineStudents()) if (!st.group || st.group > room.groupCount) st.group = smallestGroup(false);
  const alone = groupNos().filter((g) => members(g, true).length === 1);
  if (alone.length) {
    renderRoom();
    return showError('roomError', `${alone.join(', ')}모둠에 학생이 한 명뿐이에요. 혼자서는 카드를 비교할 수 없어요. 모둠 수를 줄이거나 다시 나눠 주세요.`);
  }
  room.groups = groupNos().map((g) => ({ pile: shuffled(CARDS.length), pileStart: 0, done: members(g, true).length === 0 }));
  room.endReason = null;
  for (const st of Object.values(room.students)) { st.score = 0; st.cardId = null; }
  setStatus('playing');
  for (const [id] of onlineStudents()) ensureCard(id);
  for (const g of room.groups) g.pileStart = g.pile.length;
  saveRoom();
  renderRoom();
};
$('pauseBtn').onclick = () => setStatus('paused');
$('resumeBtn').onclick = () => setStatus('playing');
$('endBtn').onclick = () => {
  if (!confirm('판을 끝낼까요?')) return;
  endGame('manual');
};
$('soundToggle').onchange = (e) => {
  room.sound = e.target.checked;
  broadcastState();
  saveRoom();
};
$('closeRoomBtn').onclick = () => closeRoom();
$('finishBtn').onclick = () => closeRoom();
$('againBtn').onclick = () => {
  for (const st of Object.values(room.students)) { st.score = 0; st.cardId = null; }
  room.groups = [];
  setStatus('lobby');
  show('roomView');
  renderRoom();
};

function showSummary() {
  show('summaryView');
  const all = Object.values(room.students);
  const found = all.reduce((n, st) => n + st.score, 0);
  $('summaryTitle').textContent = room.endReason === 'deck' ? '모든 모둠이 카드를 다 찾았어요!' : '판 결과';
  $('summaryNote').textContent = `모두 합쳐 ${found}번 찾았어요. `;
  const sections = groupNos()
    .map((g) => ({ g, list: all.filter((st) => st.group === g).sort((a, b) => b.score - a.score), grp: room.groups?.[g - 1] }))
    .filter(({ list }) => list.length);
  $('summaryGroups').innerHTML = sections.length
    ? sections.map(({ g, list, grp }) => {
      let rank = 0;
      let prev = null;
      const rows = list.map((st, i) => {
        if (st.score !== prev) { rank = i + 1; prev = st.score; }
        return `<tr><td class="num" style="width:44px">${rank}</td><td>${esc(st.nick)}</td><td class="num score">${st.score}</td></tr>`;
      }).join('');
      const sum = list.reduce((n, st) => n + st.score, 0);
      return `<div class="panel">
        <h3>${g}모둠</h3>
        <p class="muted" style="margin:0 0 8px">${grp?.done ? '카드를 다 찾았어요' : '진행 중에 끝냄'} · ${sum}번 찾음</p>
        <table><thead><tr><th class="num">순위</th><th>닉네임</th><th class="num">찾은 횟수</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    }).join('')
    : '<div class="panel muted">참여한 학생이 없어요.</div>';
}

function closeRoom() {
  if (room.status !== 'lobby' && room.status !== 'ended' && !confirm('방을 닫을까요?')) return;
  room.status = 'ended';
  broadcastState();
  clearInterval(ticker);
  channel?.close();
  channel = null;
  room = null;
  sessionStorage.removeItem(ROOM_KEY);
  openSets();
}

window.addEventListener('beforeunload', (e) => {
  if (room?.status === 'playing' || room?.status === 'paused') { e.preventDefault(); e.returnValue = ''; }
});

boot();
