// 키보드가 한글 상태여도 코드가 입력되게, 한글을 같은 자리의 영문 자판 글자로 바꾼다 (ㄱ→r, 가→rk)
const JAMO_KEYS = 'r R rt s sw sg e E f fr fa fq ft fx fv fg a q Q qt t T d w W c z x v g k o i O j p u P h hk ho hl y n nj np nl b m ml l'.split(' ');
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const FINALS = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
function jamoKey(c) {
  const i = c.charCodeAt(0) - 0x3131;
  return i >= 0 && i < JAMO_KEYS.length ? JAMO_KEYS[i] : c;
}
export function hangulToKeys(text) {
  return [...text].map((c) => {
    const s = c.charCodeAt(0) - 0xac00;
    if (s < 0 || s > 11171) return jamoKey(c);
    const f = FINALS[s % 28];
    return jamoKey(INITIALS[Math.floor(s / 588)]) + jamoKey(MEDIALS[Math.floor(s / 28) % 21]) + (f === ' ' ? '' : jamoKey(f));
  }).join('');
}
