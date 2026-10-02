// 도형 세트: 서로 다른 도형 57가지. 모양마다 딱 한 번씩만 나오므로, 두 카드에서 모양이 같은 그림은 정확히 하나다.
// 실물 도블처럼 헷갈리게 비슷한 모양(삼각형 여러 개, 사각형 여러 개)을 섞고, 색은 8가지로 꾸민다(색은 정답 판단에 쓰지 않음).
// 그림은 SVG로 만들어 data URL로 넣는다. 정사각형을 많이 돌리면 마름모와 헷갈리므로 ±20도만 기울인다(dobble.js의 isShapeImage).
import { CARDS } from './dobble.js';

export const SHAPE_SET_NAME = '도형 세트';

const poly = (pts) => `<polygon points="${pts}"/>`;

function regular(n, r = 46, startDeg = -90) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return poly(pts.join(' '));
}

function star(points, outer, inner, cy = 52) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return poly(pts.join(' '));
}

export const SHAPES = [
  // 삼각형 6
  { name: '정삼각형', svg: poly('50,9 96,88 4,88') },
  { name: '뾰족한 삼각형', svg: poly('50,3 76,95 24,95') },
  { name: '납작한 삼각형', svg: poly('50,30 98,74 2,74') },
  { name: '직각삼각형', svg: poly('12,8 12,92 88,92') },
  { name: '둔각삼각형', svg: poly('30,80 98,80 3,28') },
  { name: '삐뚤삼각형', svg: poly('8,90 92,70 62,6') },
  // 사각형 12
  { name: '정사각형', svg: '<rect x="10" y="10" width="80" height="80"/>' },
  { name: '둥근 사각형', svg: '<rect x="8" y="8" width="84" height="84" rx="22"/>' },
  { name: '가로 직사각형', svg: '<rect x="3" y="29" width="94" height="42"/>' },
  { name: '세로 직사각형', svg: '<rect x="29" y="3" width="42" height="94"/>' },
  { name: '캡슐', svg: '<rect x="3" y="30" width="94" height="40" rx="20"/>' },
  { name: '마름모', svg: poly('50,3 82,50 50,97 18,50') },
  { name: '납작한 마름모', svg: poly('50,22 97,50 50,78 3,50') },
  { name: '평행사변형', svg: poly('28,24 96,24 72,76 4,76') },
  { name: '사다리꼴', svg: poly('30,22 70,22 96,78 4,78') },
  { name: '직각사다리꼴', svg: poly('10,20 60,20 92,80 10,80') },
  { name: '연꼴', svg: poly('50,4 84,38 50,96 16,38') },
  { name: '삐뚤사각형', svg: poly('10,18 78,8 92,84 22,70') },
  // 다각형 7
  { name: '오각형', svg: regular(5, 47, -90) },
  { name: '집 모양', svg: poly('50,5 93,40 93,95 7,95 7,40') },
  { name: '보석', svg: poly('26,10 74,10 96,36 50,94 4,36') },
  { name: '육각형', svg: regular(6, 46, 0) },
  { name: '납작한 육각형', svg: poly('26,26 74,26 98,50 74,74 26,74 2,50') },
  { name: '팔각형', svg: regular(8, 46, 22.5) },
  { name: '화살촉', svg: poly('50,5 95,94 50,70 5,94') },
  // 곡선 13
  { name: '원', svg: '<circle cx="50" cy="50" r="44"/>' },
  { name: '반원', svg: '<path d="M6,72 A44,44 0 0 1 94,72 Z"/>' },
  { name: '타원', svg: '<ellipse cx="50" cy="50" rx="47" ry="27"/>' },
  { name: '부채꼴', svg: '<path d="M14,88 L14,10 A78,78 0 0 1 92,88 Z"/>' },
  { name: '입 벌린 원', svg: '<path d="M50,50 L81.1,81.1 A44,44 0 1 1 81.1,18.9 Z"/>' },
  { name: '초승달', svg: '<path d="M72,6 A44,44 0 0 0 72,94 A26,44 0 0 1 72,6 Z"/>' },
  { name: '고리', svg: '<path fill-rule="evenodd" d="M50,6 A44,44 0 1 0 50,94 A44,44 0 1 0 50,6 Z M50,29 A21,21 0 1 1 50,71 A21,21 0 1 1 50,29 Z"/>' },
  { name: '물방울', svg: '<path d="M50,4 C62,22 86,44 86,62 A36,36 0 0 1 14,62 C14,44 38,22 50,4 Z"/>' },
  { name: '아치', svg: '<path d="M14,96 V48 A36,36 0 0 1 86,48 V96 Z"/>' },
  { name: '무지개', svg: '<path d="M3,80 A47,47 0 0 1 97,80 H73 A23,23 0 0 0 27,80 Z"/>' },
  { name: '말굽', svg: '<path d="M8,6 H34 V56 A16,16 0 0 0 66,56 V6 H92 V56 A42,42 0 0 1 8,56 Z"/>' },
  { name: '구름', svg: '<path d="M22,80 A17,17 0 0 1 20,46 A22,22 0 0 1 58,30 A20,20 0 0 1 90,52 A15,15 0 0 1 80,80 Z"/>' },
  { name: '네잎꽃', svg: '<circle cx="50" cy="27" r="23"/><circle cx="73" cy="50" r="23"/><circle cx="50" cy="73" r="23"/><circle cx="27" cy="50" r="23"/>' },
  // 별 4
  { name: '별', svg: star(5, 48, 20) },
  { name: '반짝별', svg: star(4, 48, 15, 50) },
  { name: '육각별', svg: star(6, 48, 26, 50) },
  { name: '톱니별', svg: star(12, 48, 36, 50) },
  // 기호와 글자 모양 15
  { name: '하트', svg: '<path d="M50,90 C20,68 4,50 4,31 C4,15 16,7 28,7 C38,7 46,13 50,21 C54,13 62,7 72,7 C84,7 96,15 96,31 C96,50 80,68 50,90 Z"/>' },
  { name: '방패', svg: '<path d="M50,4 L92,18 V48 C92,72 72,88 50,96 C28,88 8,72 8,48 V18 Z"/>' },
  { name: '십자', svg: poly('36,6 64,6 64,36 94,36 94,64 64,64 64,94 36,94 36,64 6,64 6,36 36,36') },
  { name: '엑스', svg: poly('20,6 50,36 80,6 94,20 64,50 94,80 80,94 50,64 20,94 6,80 36,50 6,20') },
  { name: '화살표', svg: poly('4,38 54,38 54,12 96,50 54,88 54,62 4,62') },
  { name: '양쪽 화살표', svg: poly('2,50 28,18 28,38 72,38 72,18 98,50 72,82 72,62 28,62 28,82') },
  { name: '꺾쇠', svg: poly('14,6 44,6 86,50 44,94 14,94 56,50') },
  { name: '체크', svg: poly('4,52 18,38 38,58 82,10 96,24 38,86') },
  { name: '번개', svg: poly('60,2 16,56 46,56 34,98 86,38 56,38 72,2') },
  { name: 'L자', svg: poly('14,6 40,6 40,70 90,70 90,94 14,94') },
  { name: 'T자', svg: poly('6,8 94,8 94,34 63,34 63,94 37,94 37,34 6,34') },
  { name: '계단', svg: poly('6,94 6,66 34,66 34,38 62,38 62,10 94,10 94,94') },
  { name: '리본', svg: poly('4,14 50,42 96,14 96,86 50,58 4,86') },
  { name: '모래시계', svg: poly('12,4 88,4 56,50 88,96 12,96 44,50') },
  { name: '깃발', svg: poly('12,4 90,26 20,48 20,96 12,96') },
];

export const SHAPE_COLORS = [
  { name: '빨간', fill: '#e63946', stroke: '#9d1c26' },
  { name: '주황', fill: '#f77f00', stroke: '#a35400' },
  { name: '노란', fill: '#ffc300', stroke: '#a67f00' },
  { name: '초록', fill: '#2a9d4b', stroke: '#1a6230' },
  { name: '하늘색', fill: '#4cc9f0', stroke: '#1b87a8' },
  { name: '파란', fill: '#2f5fe0', stroke: '#1a3a94' },
  { name: '보라', fill: '#8e44c9', stroke: '#5b2585' },
  { name: '분홍', fill: '#f472b6', stroke: '#b03a7a' },
];

export function shapeDataUrl(shape, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="${color.fill}" stroke="${color.stroke}" stroke-width="3" stroke-linejoin="round">${shape.svg}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 고정 시드 난수: 매번 같은 세트가 나온다
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 색은 8가지를 고르게 돌려 쓰고, 한 카드에 같은 색이 몰리지 않게 칸 순서를 고른다
function buildItems(rand) {
  const colorOf = shuffle(SHAPES.map((_, i) => i % SHAPE_COLORS.length), rand);
  const items = SHAPES.map((shape, i) => ({
    kind: 'image',
    image: shapeDataUrl(shape, SHAPE_COLORS[colorOf[i]]),
    label: `${SHAPE_COLORS[colorOf[i]].name} ${shape.name}`,
    color: colorOf[i],
  }));
  const order = shuffle(items.map((_, i) => i), rand);
  const cost = () => {
    let total = 0;
    for (const card of CARDS) {
      const seen = new Map();
      let pairs = 0;
      for (const slot of card) {
        const c = items[order[slot]].color;
        pairs += seen.get(c) || 0;
        seen.set(c, (seen.get(c) || 0) + 1);
      }
      total += pairs * pairs;
    }
    return total;
  };
  let best = cost();
  for (let step = 0; step < 20000; step++) {
    const a = Math.floor(rand() * order.length);
    const b = Math.floor(rand() * order.length);
    [order[a], order[b]] = [order[b], order[a]];
    const c = cost();
    if (c <= best) best = c;
    else [order[a], order[b]] = [order[b], order[a]];
  }
  return order.map((i) => items[i]);
}

export const SHAPE_ITEMS = buildItems(seeded(20261002));
