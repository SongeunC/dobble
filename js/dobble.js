// 도블 카드 구조, 기본 그림 세트, 원형 카드 배치와 그리기

export const ITEMS_PER_SET = 57;
export const ITEMS_PER_CARD = 8;

// 위수 7 유한 사영평면: 항목 57개 → 카드 57장, 카드당 8개, 어느 두 장이든 공통 항목은 정확히 1개
export function buildCards(n = 7) {
  const cards = [];
  const grid = (x, y) => x * n + y;
  const slope = (m) => n * n + m; // m = 0..n
  for (let m = 0; m < n; m++) {
    for (let b = 0; b < n; b++) {
      const card = [];
      for (let x = 0; x < n; x++) card.push(grid(x, (m * x + b) % n));
      card.push(slope(m));
      cards.push(card);
    }
  }
  for (let x = 0; x < n; x++) {
    const card = [];
    for (let y = 0; y < n; y++) card.push(grid(x, y));
    card.push(slope(n));
    cards.push(card);
  }
  const inf = [];
  for (let m = 0; m <= n; m++) inf.push(slope(m));
  cards.push(inf);
  return cards;
}

export const CARDS = buildCards();

export const DEFAULT_SET_NAME = '기본 그림 세트';
export const DEFAULT_ITEMS = [
  '🍎', '🍌', '🍇', '🍓', '🍉', '🍒', '🥕', '🌽', '🍔', '🍕',
  '🍦', '🍩', '🍪', '🎂', '🐶', '🐱', '🐭', '🐰', '🦊', '🐻',
  '🐼', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐢',
  '🐟', '🐬', '🦋', '🐞', '🌻', '🌳', '🌙', '⭐', '☀️', '🌈',
  '❄️', '🔥', '💧', '⚽', '🏀', '🎈', '🎁', '🚗', '🚲', '✈️',
  '🚀', '⏰', '📚', '✏️', '🎵', '🔑', '❤️',
].map((text) => ({ kind: 'word', text }));

export function isEmoji(text) {
  return /^\p{Extended_Pictographic}/u.test(text) && [...text].length <= 3;
}

// 도형 세트의 SVG 그림. 돌리면 정사각형이 마름모처럼 보여서 돌리지 않는다.
export function isShapeImage(url) {
  return typeof url === 'string' && url.startsWith('data:image/svg+xml');
}

export function isFilled(item) {
  return !!item && ((item.kind === 'word' && item.text && item.text.trim()) || (item.kind === 'image' && item.image));
}

// 항목 8개를 원 안에 겹치지 않게, 크기와 각도를 불규칙하게 놓는다. 좌표는 카드 반지름 1 기준.
export function layoutCard(count = ITEMS_PER_CARD) {
  let scale = 1;
  for (let attempt = 0; attempt < 60; attempt++) {
    // 실물 도블처럼 큰 것과 작은 것이 섞이게: 가장 작은 것은 가장 큰 것의 절반 정도
    const radii = Array.from({ length: count }, () => (0.14 + Math.random() * 0.16) * scale)
      .sort((a, b) => b - a);
    const placed = [];
    let ok = true;
    for (const r of radii) {
      let spot = null;
      for (let t = 0; t < 400 && !spot; t++) {
        const max = 0.94 - r;
        const d = Math.sqrt(Math.random()) * max;
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 0.03)) spot = { x, y, r };
      }
      if (!spot) { ok = false; break; }
      placed.push(spot);
    }
    if (ok) {
      // 큰 항목이 늘 같은 자리에 오지 않도록 섞는다
      for (let i = placed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [placed[i], placed[j]] = [placed[j], placed[i]];
      }
      return placed;
    }
    if (attempt % 10 === 9) scale *= 0.94;
  }
  throw new Error('카드 배치 실패');
}

const WORD_COLORS = ['#d92d20', '#2f6fed', '#1a9e5c', '#7a3fd1', '#c2410c', '#0e7490', '#b8337a', '#4d5b7c'];

// items: [{kind, text?, url?}] 8개. el 안에 원형 카드를 그린다.
export function renderCard(el, items) {
  const spots = layoutCard(items.length);
  el.innerHTML = '';
  el.classList.add('card');
  items.forEach((item, i) => {
    const s = spots[i];
    const box = document.createElement('div');
    box.className = 'card-item';
    const size = s.r * 2 * 50; // 카드 지름 대비 %
    box.style.width = box.style.height = `${size}%`;
    box.style.left = `${50 + s.x * 50 - size / 2}%`;
    box.style.top = `${50 + s.y * 50 - size / 2}%`;
    if (item.kind === 'image') {
      // 도형은 ±20도만 기울인다. 더 돌리면 정사각형이 마름모처럼 보인다.
      const deg = isShapeImage(item.url) ? Math.random() * 40 - 20 : Math.random() * 360;
      box.style.transform = `rotate(${Math.round(deg)}deg)`;
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = '';
      img.draggable = false;
      box.appendChild(img);
    } else if (isEmoji(item.text)) {
      box.style.transform = `rotate(${Math.round(Math.random() * 360)}deg)`;
      box.classList.add('emoji');
      box.style.fontSize = `${size * 0.62}cqw`;
      box.textContent = item.text;
    } else {
      // 글자는 읽을 수 있게 ±40도 안에서만 돌린다
      box.style.transform = `rotate(${Math.round(Math.random() * 80 - 40)}deg)`;
      box.classList.add('word');
      box.style.color = WORD_COLORS[i % WORD_COLORS.length];
      const len = [...item.text].length;
      box.style.fontSize = `${Math.min(size * 0.42, (size * 1.05) / Math.max(len, 1.6))}cqw`;
      box.textContent = item.text;
    }
    el.appendChild(box);
  });
}

// 시험용: 모든 카드 쌍의 공통 항목이 정확히 1개인지
export function verifyCards(cards = CARDS) {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const common = cards[i].filter((s) => cards[j].includes(s)).length;
      if (common !== 1) return false;
    }
  }
  return cards.length === ITEMS_PER_SET && new Set(cards.flat()).size === ITEMS_PER_SET;
}
