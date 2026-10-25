'use strict';

/* =========================================================
   LUMENTIA — game definitions
   All heroes, names, lore and mechanics are original.
   ========================================================= */

const RARITY = {
  R: {
    key: 'R',
    label: 'R',
    name: '별의 조각',
    color: '#9db4d6',
    soft: 'rgba(157, 180, 214, .16)',
    border: 'rgba(157, 180, 214, .32)',
    dupShards: 10,
    levelCost: 1,
    statMul: 0.9,
    shardCosts: [8, 16, 32, 64]
  },
  SR: {
    key: 'SR',
    label: 'SR',
    name: '별의 계승자',
    color: '#c9a7ff',
    soft: 'rgba(201, 167, 255, .17)',
    border: 'rgba(201, 167, 255, .34)',
    dupShards: 20,
    levelCost: 1.25,
    statMul: 1,
    shardCosts: [15, 30, 60, 120]
  },
  SSR: {
    key: 'SSR',
    label: 'SSR',
    name: '성좌의 현신',
    color: '#ffd479',
    soft: 'rgba(255, 212, 121, .17)',
    border: 'rgba(255, 212, 121, .38)',
    dupShards: 40,
    levelCost: 1.55,
    statMul: 1.16,
    shardCosts: [30, 60, 120, 240]
  }
};

const CLASSES = {
  guide: { name: '길잡이', role: '앞에서 빛을 잇는 이', shape: 'star', color: '#ffd9a8' },
  guard: { name: '수호', role: '함께 쉴 곳을 만드는 이', shape: 'shield', color: '#7fd8ff' },
  mage: { name: '별술사', role: '별빛을 부르는 이', shape: 'rune', color: '#b79bff' },
  song: { name: '성가', role: '노래로 잇는 이', shape: 'halo', color: '#ffb3d9' }
};

const HEROES = [
  {
    id: 'aries',
    name: '아리에스',
    title: '별을 잇는 빛',
    rarity: 'SSR',
    cls: 'guide',
    base: { hp: 470, atk: 44, def: 15, interval: 1.15 },
    skill: {
      name: '별빛 나래', cd: 8.5, type: 'damage', mult: 2.15, targets: 2, effect: 'arc',
      desc: '안개가 짙은 곳 2곳을 별빛 215%로 환하게 비춥니다.'
    },
    passive: { kind: 'self', stat: 'crit', value: 0.12, text: '반짝임 확률 +12%' },
    palette: { a: '#f6d78b', b: '#7d5f33', core: '#fff3c9', ring: '#ffd479' },
    seed: 0.7,
    lore: '성좌의 빛을 이어받은 길잡이. 별이 잠드는 소리를 듣는다.'
  },
  {
    id: 'ceres',
    name: '세레스',
    title: '성좌의 울타리',
    rarity: 'SSR',
    cls: 'guard',
    base: { hp: 760, atk: 27, def: 27, interval: 1.6 },
    skill: {
      name: '성좌의 울타리', cd: 9, type: 'shield', shieldPct: 0.2, healPct: 0.08, effect: 'hex',
      desc: '함께 걷는 모두에게 최대 기운 20%의 별빛 울타리를 두르고 8%를 회복합니다.'
    },
    passive: { kind: 'self', stat: 'hp', value: 0.28, text: '최대 기운 +28%' },
    palette: { a: '#a9ecff', b: '#2c5d85', core: '#effcff', ring: '#78e3ff' },
    seed: 2.1,
    lore: '잠든 성좌 곁에 조용한 쉼터를 만들어 온 수호자.'
  },
  {
    id: 'lyra',
    name: '리라',
    title: '은하의 성가',
    rarity: 'SSR',
    cls: 'song',
    base: { hp: 440, atk: 34, def: 13, interval: 1.35 },
    skill: {
      name: '은하의 세레나데', cd: 10, type: 'heal', healPct: 0.24,
      buff: { stat: 'atk', value: 0.18, dur: 7 }, effect: 'sparkle',
      desc: '모두의 기운을 24% 회복하고 7초간 별빛을 18% 더합니다.'
    },
    passive: { kind: 'aura', stat: 'atk', value: 0.1, text: '모두의 별빛 +10%' },
    palette: { a: '#ffc9e6', b: '#7a418f', core: '#fff2fb', ring: '#ffb3d9' },
    seed: 4.4,
    lore: '은하의 노래로 잠든 별을 깨우는 마지막 성가수.'
  },
  {
    id: 'velk',
    name: '벨크',
    title: '혜성의 등불',
    rarity: 'SR',
    cls: 'mage',
    base: { hp: 390, atk: 52, def: 11, interval: 1.45 },
    skill: {
      name: '혜성의 인사', cd: 8, type: 'damage', mult: 3.3, targets: 1, effect: 'comet',
      desc: '안개가 가장 짙은 곳 1곳을 별빛 330%로 비춥니다.'
    },
    passive: { kind: 'self', stat: 'atk', value: 0.16, text: '별빛 +16%' },
    palette: { a: '#ffbf9c', b: '#8a4550', core: '#ffe9d9', ring: '#ff9d7a' },
    seed: 1.3,
    lore: '떨어진 혜성의 파편을 등불로 삼아 길을 밝히는 여행자.'
  },
  {
    id: 'mirea',
    name: '미레아',
    title: '새벽의 이슬',
    rarity: 'SR',
    cls: 'song',
    base: { hp: 440, atk: 34, def: 13, interval: 1.35 },
    skill: {
      name: '새벽 이슬', cd: 7, type: 'heal', healPct: 0.3, targets: 1, effect: 'sparkle',
      desc: '기운이 가장 적은 한 사람을 최대 기운 30%만큼 회복합니다.'
    },
    passive: { kind: 'self', stat: 'hp', value: 0.16, text: '최대 기운 +16%' },
    palette: { a: '#baf5d9', b: '#2b6f66', core: '#f1fffa', ring: '#7ef0c0' },
    seed: 3.2,
    lore: '새벽이 오기 전, 이슬에 별빛을 담아 두는 치유사.'
  },
  {
    id: 'kain',
    name: '카인',
    title: '별그림자 춤',
    rarity: 'SR',
    cls: 'guide',
    base: { hp: 470, atk: 44, def: 15, interval: 1.15 },
    skill: {
      name: '별그림자 춤', cd: 7.5, type: 'damage', mult: 1.9, targets: 2, effect: 'arc',
      desc: '안개 2곳을 별빛 190%로 비춥니다.'
    },
    passive: { kind: 'self', stat: 'crit', value: 0.15, text: '반짝임 확률 +15%' },
    palette: { a: '#c2bdff', b: '#343074', core: '#f0eeff', ring: '#8f8bff' },
    seed: 5.1,
    lore: '별그림자 사이를 춤추듯 걷는 조용한 길잡이.'
  },
  {
    id: 'lumen',
    name: '루멘',
    title: '첫 번째 별',
    rarity: 'R',
    cls: 'guard',
    base: { hp: 760, atk: 27, def: 27, interval: 1.6 },
    skill: {
      name: '작은 울타리', cd: 9, type: 'shield', shieldPct: 0.14, effect: 'hex',
      desc: '모두에게 최대 기운 14%의 별빛 울타리를 더합니다.'
    },
    passive: { kind: 'self', stat: 'def', value: 0.25, text: '수호 +25%' },
    palette: { a: '#ffe3a8', b: '#7b5d28', core: '#fff8e2', ring: '#ffd479' },
    seed: 0.2,
    lore: '가장 작은 별에서 태어난 첫 번째 파수꾼.'
  },
  {
    id: 'pio',
    name: '피오',
    title: '떠도는 별가루',
    rarity: 'R',
    cls: 'mage',
    base: { hp: 390, atk: 52, def: 11, interval: 1.45 },
    skill: {
      name: '별가루 산들바람', cd: 8, type: 'damage', mult: 1.35, targets: 'all', effect: 'storm',
      desc: '모든 안개를 별빛 135%로 걷어냅니다.'
    },
    passive: { kind: 'self', stat: 'atk', value: 0.12, text: '별빛 +12%' },
    palette: { a: '#bfe0ff', b: '#365d94', core: '#eff8ff', ring: '#8fd0ff' },
    seed: 6.3,
    lore: '별가루를 모아 산들바람을 부르는 떠돌이 별술사.'
  }
];

const HERO_BY_ID = {};
HEROES.forEach(function (h) { HERO_BY_ID[h.id] = h; });

const CHAPTERS = [
  '별빛이 시작되는 곳',
  '잊힌 성좌의 길',
  '은하의 다리',
  '고요의 정원',
  '별의 끝, 새벽',
  '되살아난 궤도'
];

const BOSS_NAMES = [
  '잠든 성좌',
  '안개의 노래',
  '고요의 문',
  '새벽의 등불',
  '별의 기억',
  '달빛의 수호자'
];

const ENEMY_TYPES = [
  { id: 'wisp', name: '잊힌 별가루', hp: 1, atk: 1, color: '#b9a7ff', shape: 'wisp' },
  { id: 'moth', name: '안개 나비', hp: 0.86, atk: 1.2, color: '#ffc2d6', shape: 'moth' },
  { id: 'moon', name: '졸린 달무리', hp: 1.12, atk: 0.92, color: '#9fe6ff', shape: 'moon' },
  { id: 'lantern', name: '별등 정령', hp: 1.3, atk: 1.08, color: '#ffe3a8', shape: 'lantern' }
];

const BALANCE = {
  levelCostBase: 60,
  levelCostGrowth: 1.15,
  statGrowth: 1.075,
  starMult: 1.25,
  maxStar: 5,

  enemyHp: 74,
  enemyHpGrowth: 1.15,
  enemyAtk: 9.5,
  enemyAtkGrowth: 1.12,
  enemyDef: 4,
  enemyDefGrowth: 2.2,
  enemyInterval: 1.9,
  bossEvery: 5,
  bossHpMult: 7.5,
  bossAtkMult: 1.5,
  bossInterval: 2.2,
  bossGoldMult: 9,

  // 10,000미소 이상 구간: 안개가 짙어져 난도가 크게 오릅니다.
  hardStage: 13,
  hardReward: 10000,
  hardHpGrowth: 1.12,
  hardAtkGrowth: 1.08,
  hardBossGrowth: 1.15,

  killGold: 100,
  goldGrowth: 1.22,
  goldPerSec: 2,
  goldPerSecGrowth: 1.2,

  maxReward: 20000,

  ascendGoldBase: 700,
  ascendGoldGrowth: 2.1,

  offlineCapHours: 8,
  offlineMinSeconds: 180,
  offlineEfficiency: 0.65,

  stageTimeout: 75,
  ultDamageMult: 2.4,
  ultHealPct: 0.16
};

const ACHIEVEMENTS = [
  { id: 's5', icon: 'stage', title: '별길의 시작', desc: '스테이지 5 도달', type: 'stage', target: 5, reward: { gems: 150 } },
  { id: 's10', icon: 'stage', title: '첫 번째 성좌', desc: '스테이지 10 도달', type: 'stage', target: 10, reward: { gems: 250, gold: 1200 } },
  { id: 's20', icon: 'stage', title: '은하의 다리를 건너', desc: '스테이지 20 도달', type: 'stage', target: 20, reward: { gems: 400 } },
  { id: 's30', icon: 'stage', title: '고요의 정원', desc: '스테이지 30 도달', type: 'stage', target: 30, reward: { gems: 700 } },
  { id: 'sm10', icon: 'summon', title: '별의 인도', desc: '영웅 소환 10회', type: 'summons', target: 10, reward: { gems: 300 } },
  { id: 'sm30', icon: 'summon', title: '별을 부르는 자', desc: '영웅 소환 30회', type: 'summons', target: 30, reward: { gems: 600 } },
  { id: 'b5', icon: 'boss', title: '별빛 수집가', desc: '성좌의 문 5회 통과', type: 'bossKills', target: 5, reward: { gems: 200, gold: 1500 } },
  { id: 'b15', icon: 'boss', title: '고요의 산책', desc: '성좌의 문 15회 통과', type: 'bossKills', target: 15, reward: { gems: 450 } },
  { id: 'lv10', icon: 'level', title: '첫 성장', desc: '영웅 1명 Lv.10 달성', type: 'maxLevel', target: 10, reward: { gold: 1500 } },
  { id: 'lv25', icon: 'level', title: '성장의 궤적', desc: '영웅 1명 Lv.25 달성', type: 'maxLevel', target: 25, reward: { gems: 300 } },
  { id: 'as1', icon: 'star', title: '별의 승계', desc: '영웅 각성 1회', type: 'ascends', target: 1, reward: { gems: 250 } },
  { id: 'own4', icon: 'team', title: '세 별의 합주', desc: '영웅 4명 보유', type: 'owned', target: 4, reward: { gems: 200 } },
  { id: 'p3000', icon: 'power', title: '빛나는 진형', desc: '별빛 3,000 달성', type: 'power', target: 3000, reward: { gems: 350 } },
  { id: 'ssr1', icon: 'star', title: '성좌의 현신', desc: 'SSR 영웅 각성 1회', type: 'ssrAscends', target: 1, reward: { gems: 500 } }
];

const GACHA = {
  cost1: 300,
  cost10: 2700,
  rates: { SSR: 0.03, SR: 0.17, R: 0.8 },
  pity: 60
};

const DEFAULT_PARTY = ['lumen', 'mirea', 'pio'];
const START_GOLD = 300;
const START_GEMS = 1200;
const SAVE_KEY = 'lumentia.save.v1';

function heroLevelCap(star) {
  return 20 + 20 * (star - 1);
}

function chapterOf(stage) {
  return CHAPTERS[Math.floor((stage - 1) / 10) % CHAPTERS.length];
}

function isBossStage(stage) {
  return stage % BALANCE.bossEvery === 0;
}

function bossNameOf(stage) {
  return BOSS_NAMES[Math.floor(stage / BALANCE.bossEvery - 1) % BOSS_NAMES.length];
}
