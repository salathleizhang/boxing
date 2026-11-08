import { useEffect, useRef, useState } from 'react';
import type { FightState } from '../game/arena';
import { OPPONENTS, type OpponentId, type OpponentProfile } from '../game/opponents';
import { GAME_TITLE } from '../game/branding';

type Action = { id: string; label: string; x: number; y: number; w: number; h: number; run: () => void; disabled?: boolean; hold?: boolean; selected?: boolean };
type Props = {
  modelLoading: boolean; choosing: boolean; opponent: OpponentProfile; selectOpponent: (id: OpponentId) => void; chooseOpponent: () => void;
  fight: FightState; cameraOn: boolean; trackingText: string; error: string;
  settings: boolean; help: boolean; duration: number; sensitivity: number; sound: boolean;
  start: () => void; pause: () => void; openHelp: () => void; openSettings: () => void;
  toggleCamera: () => void; close: () => void; home: () => void;
  setDuration: (v: number) => void; setSensitivity: (v: number) => void; setSound: (v: boolean) => void;
  punch: (side: number) => void; block: (v: boolean) => void;
};
const ROOT = '/ui/';
export function CanvasHUD(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: innerWidth, h: Math.max(620, innerHeight) });
  const [hover, setHover] = useState('');
  const [assets, setAssets] = useState<HTMLImageElement[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const latest = useRef(p); latest.current = p;
  useEffect(() => {
    const resize = () => setSize({ w: innerWidth, h: Math.max(620, innerHeight) });
    window.addEventListener('resize', resize);
    let active = true;
    const images = ['yanjunjie-main-event-wide.png', 'ringside-metal-atlas.png', 'yanjunjie-main-event-portrait-v2.png'].map(name => {
      const image = new Image(); image.src = ROOT + name; return image;
    });
    Promise.all(images.map(image => image.decode())).then(() => { if (active) setAssets(images); }).catch(() => {
      if (active) latest.current.openHelp();
    });
    return () => { active = false; window.removeEventListener('resize', resize); };
  }, []);
  const modalOpen = p.settings || p.help;
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.hotspots button')?.focus());
    return () => { cancelAnimationFrame(frame); previous?.focus(); };
  }, [modalOpen]);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const { w, h } = size, mobile = w < 700, pad = mobile ? 16 : 40;
    const dpr = Math.min(devicePixelRatio, 2); el.width = w * dpr; el.height = h * dpr;
    const c = el.getContext('2d')!; c.scale(dpr, dpr);
    const a: Action[] = [], s = p.fight, modal = p.settings || p.help;
    const text = (value: string, x: number, y: number, font = 12, color = '#fff', align: CanvasTextAlign = 'left', weight = 500, maxWidth?: number) => {
      c.fillStyle = color; c.font = `${weight} ${font}px ${font > 26 ? 'Impact, "Arial Narrow",' : ''} "Arial", "PingFang SC", sans-serif`; c.textAlign = align; c.fillText(value, x, y, maxWidth ?? w);
    };
    const panel = (row: number, x: number, y: number, pw: number, ph: number) => {
      if (assets[1]) c.drawImage(assets[1], 0, row * assets[1].height / 4, assets[1].width, assets[1].height / 4, x, y, pw, ph);
      else { c.fillStyle = row === 0 ? '#b20e26' : '#17171c'; c.fillRect(x, y, pw, ph); }
    };
    const button = (id: string, label: string, x: number, y: number, bw: number, bh: number, run: () => void, row = 1, disabled = false, hold = false) => {
      const hot = hover === id;
      c.save(); c.globalAlpha = disabled ? .32 : 1;
      if (hot && !disabled) c.filter = 'brightness(1.45)';
      panel(row, x, y, bw, bh); c.filter = 'none';
      text(label, x + bw / 2, y + bh / 2 + 5, mobile ? 12 : 13, '#fff', 'center', 700);
      c.restore();
      if (!modal || id.startsWith('modal')) a.push({ id, label, x, y, w: bw, h: bh, run, disabled, hold });
    };
    c.fillStyle = '#08090c'; c.fillRect(0, 0, w, h);
    const top = mobile ? 68 : 86, bottom = mobile ? 194 : 156;
    const stageH = h - top - bottom, stageW = w - pad * 2;
    // Clear only the live arena viewport: the WebGL game remains visible underneath.
    c.clearRect(pad, top, stageW, stageH);
    if (p.choosing) {
      // The same metal atlas as the existing HUD; the live model stays visible in the preview window.
      const leftW = mobile ? stageW : stageW * .5;
      const fade = c.createLinearGradient(pad, 0, w - pad, 0);
      fade.addColorStop(0, '#08090cf5'); fade.addColorStop(.48, '#08090ce8'); fade.addColorStop(1, '#08090c10');
      c.fillStyle = mobile ? '#08090c22' : fade; c.fillRect(pad, top, stageW, stageH);
      text('CHOOSE YOUR OPPONENT', pad + 12, top + 20, 10, '#d8bf7e', 'left', 700);
      text('今晚，谁来应战？', pad + 12, top + (mobile ? 47 : 62), mobile ? 23 : 34, '#fff', 'left', 900);
      const cardTop = mobile ? top + stageH - 204 : top + 88;
      const gap = mobile ? 8 : 12, cardW = (leftW - 24 - gap) / 2;
      const cardH = mobile ? 44 : Math.min(86, (stageH - 168) / 3);
      OPPONENTS.forEach((opponent, i) => {
        const x = pad + 12 + i % 2 * (cardW + gap), y = cardTop + Math.floor(i / 2) * (cardH + gap);
        const selected = p.opponent.id === opponent.id, id = `opponent-${opponent.id}`;
        c.save();
        if (hover === id) c.filter = 'brightness(1.3)';
        panel(selected ? 2 : 1, x, y, cardW, cardH); c.filter = 'none';
        c.strokeStyle = selected ? '#e4c77e' : '#50454b'; c.lineWidth = selected ? 2 : 1; c.strokeRect(x + 1, y + 1, cardW - 2, cardH - 2);
        c.fillStyle = opponent.gloves; c.fillRect(x + 2, y + 9, 3, cardH - 18);
        text(`0${i + 1}`, x + 13, y + (mobile ? 27 : cardH / 2 + 5), mobile ? 12 : 20, selected ? '#edcf89' : '#8a818a');
        text(opponent.name, x + (mobile ? 38 : 49), y + cardH / 2 + (mobile ? 4 : -2), mobile ? 12 : 16, '#fff', 'left', 700, cardW - (mobile ? 51 : 62));
        if (!mobile) text(opponent.title, x + 49, y + cardH / 2 + 19, 9, '#b3a5ad');
        if (selected) text('●', x + cardW - 14, y + 17, 8, '#ebce88', 'right');
        c.restore();
        if (!modal) a.push({ id, label: `选择${opponent.name}`, x, y, w: cardW, h: cardH, run: () => p.selectOpponent(opponent.id), selected });
      });
      if (!mobile) {
        const px = pad + stageW * .76;
        text('FIGHTER PREVIEW / 3D 拳手', px, top + 25, 10, '#baa888', 'center');
        text(p.opponent.name, px, top + stageH - 90, 32, '#fff', 'center', 900);
        text(p.opponent.note, px, top + stageH - 61, 11, '#c1b5ba', 'center');
      } else text(`${p.opponent.name}  /  ${p.opponent.title} · 3D 拳手`, w / 2, top + 68, 10, '#d7c18b', 'center');
      button('confirm-opponent', p.modelLoading ? '正在载入模型…' : `迎战${p.opponent.name}  →`, pad + 12, top + stageH - 48, leftW - 24, 44, p.start, 0, p.modelLoading);
    } else if (s.phase === 'ready') {
      let artX = pad, artY = top, artW = stageW, artH = stageH;
      if (assets[0]) {
        // Use the panoramic composition on wide screens, the portrait composition on narrower ones.
        const image = stageW / stageH >= 2.15 ? assets[0] : assets[2];
        const scale = (mobile ? Math.min : Math.max)(stageW / image.naturalWidth, stageH / image.naturalHeight);
        artW = image.naturalWidth * scale;
        artH = image.naturalHeight * scale;
        artX = pad + (stageW - artW) / 2;
        artY = top + (stageH - artH) * (mobile ? .2 : .5);
        c.save();
        c.beginPath(); c.rect(pad, top, stageW, stageH); c.clip();
        if (mobile) { c.fillStyle = '#110c10'; c.fillRect(pad, top, stageW, stageH); }
        c.drawImage(image, artX, artY, artW, artH);
        c.restore();
      } else { c.fillStyle = '#110c10'; c.fillRect(pad, top, stageW, stageH); text(GAME_TITLE, pad + 24, top + stageH * .42, mobile ? 36 : 64); }
      const bx = pad + (mobile ? 22 : stageW * .06);
      const by = top + stageH * .72;
      text('你的主场。你的冠军之路。', bx, by - 23, mobile ? 14 : 17, '#e4e1df', 'left', 600);
      button('start', '进入擂台   /   ENTER THE RING  →', bx, by, mobile ? Math.min(280, stageW - 44) : 320, 60, p.chooseOpponent, 0);
      text(`${p.duration / 60} 分钟回合    /    键盘 · 触屏 · 体感`, bx + 6, by + 81, 10, '#bab6ba');
      if (!mobile) {
        text('FIGHT NIGHT', w - pad - 36, top + stageH - 64, 26, '#fff', 'right');
        text('01  /  自由对战     ·     FIRST PERSON', w - pad - 36, top + stageH - 40, 10, '#c6c0c3', 'right');
      }
    } else {
      const gradient = c.createLinearGradient(0, top, 0, top + stageH); gradient.addColorStop(0, '#05060bbf'); gradient.addColorStop(.35, '#05060b00'); gradient.addColorStop(.7, '#05060b00'); gradient.addColorStop(1, '#05060bc9'); c.fillStyle = gradient; c.fillRect(pad, top, stageW, stageH);
      const nw = mobile ? (stageW - 82) / 2 : Math.min(345, stageW * .32), nh = mobile ? 62 : 76;
      const nameplate = (x: number, name: string, subtitle: string, health: number, right: boolean) => {
        panel(1, x, top + 18, nw, nh);
        text(name, x + (right ? nw - 17 : 17), top + 42, mobile ? 13 : 21, '#fff', right ? 'right' : 'left', 800);
        if (!mobile) text(subtitle, x + (right ? nw - 17 : 17), top + 60, 9, '#b4adb5', right ? 'right' : 'left');
        c.fillStyle = '#363038'; c.fillRect(x + 16, top + nh + 2, nw - 32, 5);
        c.fillStyle = right ? '#dc233e' : '#d6b66c'; c.fillRect(x + 16 + (right ? (nw - 32) * (1 - health / 100) : 0), top + nh + 2, (nw - 32) * health / 100, 5);
      };
      nameplate(pad + 8, 'YOU', 'THE CHALLENGER / 挑战者', s.health, false);
      nameplate(w - pad - nw - 8, p.opponent.name, p.opponent.title, s.opponentHealth, true);
      const seconds = Math.ceil(s.remaining), time = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
      text('ROUND 01', w / 2, top + 35, mobile ? 8 : 10, '#c9b47c', 'center');
      text(time, w / 2, top + (mobile ? 62 : 76), mobile ? 25 : 40, '#fff', 'center');
      button('pause', s.phase === 'paused' ? '继续  ▶' : '暂停  Ⅱ', w / 2 - 38, top + 90, 76, 32, p.pause, 1, s.phase === 'finished');
      if (!mobile) text(`${GAME_TITLE}  /  MAIN EVENT`, pad + 20, top + stageH - 22, 10, '#ded9db');
      const guards = Number(s.guarding[0]) + Number(s.guarding[1]);
      if (s.phase === 'playing') {
        text(guards === 2 ? '双拳防守' : guards === 1 ? '单手防守' : '防守未举起', w / 2, top + stageH - 52, 13, guards === 2 ? '#bce9c6' : '#d9bf80', 'center', 700);
        text(`左 ${s.guarding[0] ? '●' : '○'}   /   右 ${s.guarding[1] ? '●' : '○'}   ·   成功格挡 ${s.blocks}`, w / 2, top + stageH - 30, 10, '#c8c3cb', 'center');
      }
      if (performance.now() - s.lastHitAt < 1000 && s.phase === 'playing') {
        text(s.lastHit, w / 2, top + stageH * .36, 23, '#f4d78c', 'center', 800);
        if (s.combo > 1) text(`${s.combo}  COMBO`, w / 2, top + stageH * .36 + 38, 34, '#fff', 'center');
      }
      if (s.phase === 'paused' || s.phase === 'finished') {
        c.fillStyle = '#05060bbb'; c.fillRect(pad, top, stageW, stageH);
        const cw = Math.min(stageW - 24, 540), cx = (w - cw) / 2, cy = top + stageH * .27;
        panel(2, cx, cy, cw, s.phase === 'finished' ? 255 : 246);
        text(s.phase === 'paused' ? 'INTERMISSION' : 'ROUND COMPLETE', w / 2, cy + 40, 12, '#d8bf7e', 'center', 700);
        text(s.phase === 'paused' ? '保持战意' : s.result, w / 2, cy + 91, mobile ? 29 : 38, '#fff', 'center', 900);
        text(s.phase === 'paused' ? '调整呼吸，重返主场。' : `${s.score} 分    /    ${s.hits} 命中    /    ${s.bestCombo} 最高连击`, w / 2, cy + 124, 12, '#b7b3b7', 'center');
        button('resume', s.phase === 'paused' ? '继续回合  →' : '再战一回合  →', w / 2 - 110, cy + 148, 220, 48, s.phase === 'paused' ? p.pause : p.start, 0);
        button('change-opponent', '更换对手', w / 2 - 110, cy + (s.phase === 'finished' ? 207 : 202), 105, 32, p.chooseOpponent);
        button('home', '返回主场', w / 2 + 5, cy + (s.phase === 'finished' ? 207 : 202), 105, 32, p.home);
      }
    }
    // Restrained broadcast header and the generated scoreboard texture.
    text(GAME_TITLE, pad, mobile ? 39 : 49, mobile ? 23 : 29, '#f5f3f3', 'left', 900);
    c.fillStyle = '#e5223e'; c.fillRect(pad, mobile ? 46 : 57, mobile ? 115 : 148, 3);
    if (w >= 900) text('体 感 格 斗   /   FIGHT NIGHT', pad + 164, 44, 10, '#9f9aa4');
    button('help', '操作指南', w - pad - (mobile ? 148 : 298), mobile ? 20 : 26, mobile ? 70 : 88, 32, p.openHelp);
    button('settings', '赛事设置', w - pad - (mobile ? 72 : 194), mobile ? 20 : 26, mobile ? 70 : 88, 32, p.openSettings);
    if (!mobile) { c.fillStyle = '#e22340'; c.fillRect(w - pad - 83, 39, 5, 5); text('LOCAL / LIVE', w - pad, 46, 9, '#bab4bd', 'right'); }
    const fy = h - bottom + 12;
    panel(3, pad, fy, stageW, mobile ? 86 : 100);
    const values = [s.score.toString().padStart(4, '0'), s.hits.toString().padStart(2, '0'), `${s.punches ? Math.round(s.hits / s.punches * 100) : 0}%`];
    const labels = ['本回合得分 / SCORE', '有效命中 / HITS', '命中率 / ACCURACY'];
    const statW = mobile ? stageW / 3 : Math.min(160, stageW * .14);
    values.forEach((value, i) => { const x = pad + 24 + i * statW; text(labels[i], x, fy + 23, mobile ? 7 : 9, '#a9a1ab'); text(value, x, fy + (mobile ? 61 : 72), mobile ? 31 : 43, i === 0 ? '#e9cf8b' : '#f1edf1'); });
    if (!mobile && stageW >= 1100) {
      const gx = pad + statW * 3 + 26;
      text('J   左拳     K   右拳     SPACE   防守', gx, fy + 40, 12, '#ded8df', 'left', 700);
      text('出拳后收回  /  双拳护脸，完整防守', gx, fy + 64, 9, '#8e8792');
    }
    button('camera', p.cameraOn ? '●  体感已开启  /  关闭' : '◎  开启体感  /  CAMERA', mobile ? pad : w - pad - 250, mobile ? fy + 94 : fy + 22, mobile ? stageW : 230, mobile ? 42 : 54, p.toggleCamera, p.cameraOn ? 0 : 1);
    const bottomY = h - 31;
    if (!mobile) text('NO LIMITS.  JUST FIGHT.', pad + 3, bottomY + 5, 9, '#8a828d');
    const keysW = mobile ? 88 : 100, keysX = mobile ? (w - keysW * 3 - 16) / 2 : w / 2 - keysW * 1.5;
    button('left', '左拳  J', keysX, bottomY - 13, keysW, 29, () => p.punch(0), 1, s.phase !== 'playing');
    button('block', '按住防守', keysX + keysW + 8, bottomY - 13, keysW, 29, () => {}, 1, s.phase !== 'playing', true);
    button('right', '右拳  K', keysX + (keysW + 8) * 2, bottomY - 13, keysW, 29, () => p.punch(1), 1, s.phase !== 'playing');
    if (!mobile) text('01 / EVERY ROUND COUNTS', w - pad, bottomY + 5, 9, '#8a828d', 'right');
    if (p.error) { panel(0, pad + 12, top + stageH - 65, stageW - 24, 43); text(p.error, w / 2, top + stageH - 39, mobile ? 10 : 12, '#fff', 'center'); }
    if (modal) {
      c.fillStyle = '#030408df'; c.fillRect(0, 0, w, h);
      const mw = Math.min(w - 28, 540), mh = p.settings ? 460 : 430, mx = (w - mw) / 2, my = Math.max(12, (h - mh) / 2);
      panel(2, mx, my, mw, mh);
      text(p.settings ? 'MATCH SETTINGS' : 'HOW TO FIGHT', mx + 32, my + 48, 12, '#d9bf80', 'left', 700);
      text(p.settings ? '定制你的回合' : '为主场而战', mx + 32, my + 93, mobile ? 26 : 32, '#fff', 'left', 800);
      button('modal-close', '×', mx + mw - 62, my + 22, 36, 32, p.close);
      if (p.settings) {
        text('回合时长', mx + 32, my + 143, 12, '#ccc4cd');
        [60, 120, 180].forEach((v, i) => button(`modal-duration-${v}`, `${v / 60} 分钟${p.duration === v ? ' ✓' : ''}`, mx + 30 + i * (mw - 60) / 3, my + 158, (mw - 72) / 3, 43, () => p.setDuration(v), p.duration === v ? 0 : 1));
        text('下一回合生效', mx + 32, my + 222, 10, '#99909d');
        text(`出拳灵敏度    ${p.sensitivity.toFixed(1)}×`, mx + 32, my + 264, 13, '#ddd6df');
        button('modal-less', '−', mx + mw - 132, my + 240, 44, 38, () => p.setSensitivity(Math.max(.5, Math.round((p.sensitivity - .1) * 10) / 10)));
        button('modal-more', '+', mx + mw - 78, my + 240, 44, 38, () => p.setSensitivity(Math.min(2, Math.round((p.sensitivity + .1) * 10) / 10)));
        button('modal-sound', `音效与音乐    ${p.sound ? 'ON ●' : 'OFF ○'}`, mx + 30, my + 300, mw - 60, 43, () => p.setSound(!p.sound));
      } else {
        [['01', '握紧双拳，进入状态', '头部、双肩和双手入镜；画面显示拳击手套。'], ['02', '出拳，收回，再出拳', '握拳前伸攻击，收回再出；双拳护脸防守。'], ['03', '随时使用键盘或触屏', 'J / K 出拳 · 空格防守；出拳手暂不能格挡。']].forEach(([n, title, body], i) => { const y = my + 146 + i * 72; text(n, mx + 30, y, 18, '#d5b879'); text(title, mx + 67, y, 13, '#fff', 'left', 700); text(body, mx + 67, y + 25, mobile ? 9 : 11, '#a9a0af'); });
      }
      button('modal-save', p.settings ? '保存设置  →' : '明白，回到拳台  →', mx + 30, my + mh - 79, mw - 60, 49, p.close, 0);
    }
    setActions(a);
  }, [p, assets, size, hover]);
  return <>
    <canvas ref={canvas} className="hud-canvas" aria-hidden="true" />
    <div className="hotspots" role={p.settings || p.help ? 'dialog' : undefined} aria-modal={p.settings || p.help ? true : undefined} aria-label={p.settings ? '赛事设置' : p.help ? '操作指南' : '游戏控制'}>
      {actions.map(a => <button key={a.id} aria-label={a.label} aria-pressed={a.selected} disabled={a.disabled} style={{ left: a.x, top: a.y, width: a.w, height: a.h }} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover('')} onFocus={() => setHover(a.id)} onBlur={() => setHover('')} onClick={a.run} onPointerDown={a.hold ? e => { e.currentTarget.setPointerCapture(e.pointerId); p.block(true); } : undefined} onPointerUp={a.hold ? () => p.block(false) : undefined} onPointerCancel={a.hold ? () => p.block(false) : undefined} onLostPointerCapture={a.hold ? () => p.block(false) : undefined}>{a.label}</button>)}
    </div>
    <span className="sr-only" role="status">当前对手 {p.opponent.name}，{p.choosing ? "选择对手" : p.fight.phase}，得分 {p.fight.score}，生命值 {p.fight.health}，成功格挡 {p.fight.blocks}，{p.fight.guarding.every(Boolean) ? "双拳防守" : p.fight.guarding.some(Boolean) ? "单手防守" : "防守未举起"}，{p.trackingText}，{p.fight.trackingHint}</span>
  </>;
}
