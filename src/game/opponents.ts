/** Local stylized roster. A self-contained GLB can override any procedural model. */
export const OPPONENTS = [
  { id: 'nailong', modelUrl: '/models/opponents/nailong.glb', height: 2, rotationY: 0, name: '奶龙', title: '奶萌重拳', note: '圆滚滚的身形，也有硬邦邦的拳头。', skin: '#ffd44f', outfit: '#e9ab29', accent: '#fff0a3', gloves: '#e34835', hair: '#e9a42d', look: 'dragon' },
  { id: 'doubao', modelUrl: '/models/opponents/doubao.glb', height: 2, rotationY: 0, name: '豆包', title: '元气搭档', note: '带着微笑上场，认真接住每一次挑战。', skin: '#f3cfb6', outfit: '#f3eee4', accent: '#8accc5', gloves: '#60b8b4', hair: '#382923', look: 'bob' },
  { id: 'niulai', modelUrl: '/models/opponents/niulai.glb', height: 2, rotationY: 0, name: '牛来', title: '牛气冲天', note: '站稳脚跟，迎接这一记牛劲重拳。', skin: '#e1b58b', outfit: '#703739', accent: '#e3c58c', gloves: '#be3b35', hair: '#342823', look: 'bull' },
  { id: 'fengge', modelUrl: '/models/opponents/fengge.glb', height: 2, rotationY: 0, name: '峰哥亡命天涯', title: '江湖老将', note: '墨镜一戴，擂台就是下一站江湖。', skin: '#cf9b78', outfit: '#343d33', accent: '#d4ba7c', gloves: '#b65b34', hair: '#252521', look: 'traveler' },
  { id: 'cxk', modelUrl: '/models/opponents/cxk.glb', height: 2, rotationY: 0, name: '蔡徐坤', title: '舞台焦点', note: '跟上节奏，让每一次出拳都踩准拍点。', skin: '#efc9b2', outfit: '#242733', accent: '#c4c9db', gloves: '#575a86', hair: '#a9a19b', look: 'idol' },
  { id: 'yanjunjie', modelUrl: '/models/opponents/yanjunjie.glb', height: 2, rotationY: 0, name: '闫俊杰', title: '主场擂主', note: '熟悉的主场，新的挑战。现在轮到你了。', skin: '#d9aa87', outfit: '#222b30', accent: '#d2bc7a', gloves: '#d84835', hair: '#202124', look: 'fighter' },
] as const;
export type OpponentId = typeof OPPONENTS[number]['id'];
export type OpponentProfile = (typeof OPPONENTS)[number] & { modelUrl?: string; height?: number; rotationY?: number };
export const DEFAULT_OPPONENT: OpponentId = 'yanjunjie';
export function getOpponent(id: OpponentId): OpponentProfile {
  return OPPONENTS.find(opponent => opponent.id === id) ?? OPPONENTS[5];
}
