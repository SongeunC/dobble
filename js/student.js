import { openStudentLink } from './backend.js';
import { renderCard } from './dobble.js';
import { chime } from './sound.js';
import { hangulToKeys } from './hangul.js';

const $ = (id) => document.getElementById(id);
const views = ['joinView', 'waitView', 'playView', 'endView'];
const SESSION_KEY = 'dobble-student';

let channel = null;
let me = null; // { code, id, nick }
let status = 'lobby';
let sound = false;
let cardId = null;
let lastHeard = 0;
let welcomed = false;
let foundTimer = null;
let group = null;      // 내 모둠 번호
let groupDone = false; // 우리 모둠 카드가 다 떨어졌는지

function show(name) {
  for (const v of views) $(v).hidden = v !== name;
}

function saveSession() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(me)); } catch {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

function render() {
  $('pauseView').hidden = status !== 'paused' || groupDone;
  $('nickTag').innerHTML = '';
  $('nickTag').append(me?.nick || '');
  if (group) {
    const tag = document.createElement('span');
    tag.className = 'group-tag';
    tag.textContent = ` · ${group}모둠`;
    $('nickTag').append(tag);
  }
  if (status === 'ended') {
    $('endTitle').textContent = '끝! 수고했어요.';
    $('endNote').textContent = '선생님 화면을 봐 주세요.';
    return show('endView');
  }
  if (groupDone && (status === 'playing' || status === 'paused')) {
    $('endTitle').textContent = '우리 모둠 끝!';
    $('endNote').textContent = '카드를 다 찾았어요. 다른 모둠이 끝날 때까지 기다려요.';
    return show('endView');
  }
  if ((status === 'playing' || status === 'paused') && cardId !== null) return show('playView');
  // 기다리는 동안: 모둠이 정해지면 크게 보여 준다
  $('waitGroup').hidden = !group;
  $('waitGroup').textContent = group ? `${group}모둠` : '';
  $('waitTitle').textContent = group ? '우리 모둠은' : '들어왔어요!';
  $('waitNote').textContent = group
    ? '모둠 친구들과 모여 앉으세요. 선생님이 시작하면 카드가 나와요.'
    : '선생님이 시작하면 카드가 나와요.';
  show('waitView');
}

const TEACHER_EVENTS = new Set(['welcome', 'reject', 'state', 'card']);

function onMessage(event, p) {
  // 다른 학생이 보낸 신호와 다른 학생에게 간 카드는 무시한다
  if (!TEACHER_EVENTS.has(event) || (p?.to && p.to !== me.id)) return;
  lastHeard = Date.now();
  $('lostView').hidden = true;

  if (event === 'welcome') {
    welcomed = true;
  } else if (event === 'reject') {
    leave(p.reason || '들어갈 수 없어요.');
    return;
  } else if (event === 'state') {
    if (!welcomed) return;
    const wasStatus = status;
    status = p.status;
    sound = !!p.sound;
    group = p.groups?.[me.id] ?? null;
    groupDone = !!group && (p.done || []).includes(group);
    if (groupDone) clearTimeout(foundTimer);
    if (status === 'lobby' || status === 'ended') cardId = null;
    // 판이 진행 중인데 카드가 없으면 다시 인사해서 카드를 받는다
    if (status === 'playing' && cardId === null && wasStatus !== 'playing') send('hello');
  } else if (event === 'card') {
    clearTimeout(foundTimer);
    showCard(p.cardId, p.items);
  }
  render();
}

function showCard(id, items) {
  const el = $('card');
  const isNew = cardId !== null && id !== cardId;
  cardId = id;
  $('foundBtn').disabled = false;
  if (isNew) {
    el.classList.remove('swap-in');
    el.classList.add('swap-out');
    setTimeout(() => {
      renderCard(el, items);
      el.classList.remove('swap-out');
      el.classList.add('swap-in');
    }, 180);
  } else {
    renderCard(el, items);
  }
}

function send(event, extra = {}) {
  channel?.send(event, { id: me.id, nick: me.nick, ...extra });
}

async function join(code, nick, id = crypto.randomUUID()) {
  $('joinError').hidden = true;
  $('joinBtn').disabled = true;
  me = { code, nick, id };
  welcomed = false;
  try {
    channel = await openStudentLink(code, id, onMessage);
  } catch (e) {
    return leave(e.message);
  }
  // 교사 화면이 답할 때까지 몇 번 인사한다
  for (let i = 0; i < 6 && !welcomed; i++) {
    send('hello');
    await new Promise((r) => setTimeout(r, 900));
  }
  if (!welcomed) return leave('방을 찾을 수 없어요. 코드를 확인해 주세요.');
  saveSession();
  $('nickTag').textContent = nick;
  $('nickTag').hidden = false;
  render();
  startHeartbeat();
}

function leave(message) {
  channel?.close();
  channel = null;
  clearSession();
  cardId = null;
  status = 'lobby';
  $('nickTag').hidden = true;
  $('joinBtn').disabled = false;
  show('joinView');
  if (message) {
    $('joinError').textContent = message;
    $('joinError').hidden = false;
  }
}

let heartbeat = null;
function startHeartbeat() {
  clearInterval(heartbeat);
  lastHeard = Date.now();
  heartbeat = setInterval(() => {
    if (!channel) return clearInterval(heartbeat);
    send('ping', { cardId });
    if (Date.now() - lastHeard > 30000) {
      $('lostView').hidden = false;
      send('hello');
    }
  }, 10000); // 10초마다 접속 확인 (교사는 12초마다 판 상태를 알림)
}

$('foundBtn').addEventListener('click', () => {
  if (status !== 'playing' || cardId === null) return;
  $('foundBtn').disabled = true;
  if (sound) chime();
  send('found', { cardId });
  // 새 카드가 오지 않으면 다시 누를 수 있게 한다
  clearTimeout(foundTimer);
  foundTimer = setTimeout(() => {
    $('foundBtn').disabled = false;
    send('hello');
  }, 3000);
});

$('joinView').addEventListener('submit', (e) => {
  e.preventDefault();
  cleanCode({ target: $('code') });
  const code = $('code').value;
  const nick = $('nick').value.trim();
  if (code.length !== 6 || !nick) return;
  join(code, nick);
});

function cleanCode(e) {
  if (e.isComposing) return; // 글자를 조합하는 중에 바꾸면 겹쳐 들어가므로 조합이 끝난 뒤 바꾼다
  const clean = hangulToKeys(e.target.value).toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
  if (clean !== e.target.value) e.target.value = clean;
}
$('code').addEventListener('input', cleanCode);
$('code').addEventListener('compositionend', cleanCode);

window.addEventListener('pagehide', () => send('bye'));

// 시작: QR로 들어왔으면 코드를 채우고, 새로고침이면 같은 자리로 다시 들어간다
const params = new URLSearchParams(location.search);
const roomParam = (params.get('room') || '').toUpperCase();
const saved = loadSession();
if (saved && (!roomParam || roomParam === saved.code)) {
  $('code').value = saved.code;
  $('nick').value = saved.nick;
  join(saved.code, saved.nick, saved.id);
} else {
  show('joinView');
  if (roomParam) {
    $('code').value = roomParam;
    $('nick').focus();
  }
}
