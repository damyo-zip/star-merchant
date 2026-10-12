/* Pure economy rules. Classic script support keeps file:// play server-free. */
(function (root) {
  'use strict';

  const GOODS = Object.freeze([
    Object.freeze({ id: 'crystal', name: '에너지 수정', symbol: '◇', description: '함선과 도시를 밝히는 푸른 동력원' }),
    Object.freeze({ id: 'alloy', name: '티타늄 합금', symbol: '▱', description: '우주선 외벽을 만드는 희귀 금속' }),
    Object.freeze({ id: 'spice', name: '성운 향신료', symbol: '✳', description: '먼 은하에서 온 은은한 사치품' })
  ]);
  const PLANETS = Object.freeze([
    Object.freeze({ id: 'terra', name: '테라', type: '교역의 중심', color: '#59d9c4', base: Object.freeze([60, 110, 180]) }),
    Object.freeze({ id: 'ares', name: '아레스', type: '붉은 광산 행성', color: '#f28b72', base: Object.freeze([100, 55, 220]) }),
    Object.freeze({ id: 'nerea', name: '네레아', type: '끝없는 바다', color: '#79baff', base: Object.freeze([85, 150, 90]) }),
    Object.freeze({ id: 'vesper', name: '베스퍼', type: '수정의 고향', color: '#b69aff', base: Object.freeze([35, 130, 240]) }),
    Object.freeze({ id: 'aurora', name: '오로라', type: '은하의 휴양지', color: '#e7c67e', base: Object.freeze([130, 180, 120]) })
  ]);
  const CAPACITY = 20;
  const GOAL = 10000;

  function generatePrices(random = Math.random) {
    return Object.fromEntries(PLANETS.map(planet => [planet.id,
      Object.fromEntries(GOODS.map((good, i) => [good.id, Math.round(planet.base[i] * (0.75 + random() * 0.5))]))
    ]));
  }

  function createGame(random = Math.random) {
    return { planet: 'terra', credits: 1000, turn: 0, cargo: { crystal: 0, alloy: 0, spice: 0 }, prices: generatePrices(random), won: false };
  }

  function cargoCount(state) {
    return GOODS.reduce((sum, good) => sum + state.cargo[good.id], 0);
  }

  function cargoValue(state) {
    return GOODS.reduce((sum, good) => sum + state.cargo[good.id] * state.prices[state.planet][good.id], 0);
  }

  function assets(state) {
    return state.credits + cargoValue(state);
  }

  function success(state, message) {
    const won = state.won || assets(state) >= GOAL;
    return { ok: true, state: { ...state, won }, message, justWon: !state.won && won };
  }

  function failure(state, message) {
    return { ok: false, state, message, justWon: false };
  }

  function trade(state, goodId, quantity, buying) {
    const good = GOODS.find(item => item.id === goodId);
    if (!good) return failure(state, '알 수 없는 상품입니다.');
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return failure(state, '수량은 1 이상의 정수로 입력하세요.');
    const price = state.prices[state.planet][goodId];
    const cost = price * quantity;
    if (buying && cost > state.credits) return failure(state, '크레딧이 부족합니다. 수량을 줄여 주세요.');
    if (buying && cargoCount(state) + quantity > CAPACITY) return failure(state, '화물칸이 부족합니다. 최대 20개를 실을 수 있습니다.');
    if (!buying && quantity > state.cargo[goodId]) return failure(state, '판매할 화물이 부족합니다.');
    const next = { ...state, credits: state.credits + (buying ? -cost : cost),
      cargo: { ...state.cargo, [goodId]: state.cargo[goodId] + (buying ? quantity : -quantity) } };
    return success(next, `${good.name} ${quantity}개 ${buying ? '구매' : '판매'} · ${cost.toLocaleString('ko-KR')} C`);
  }

  function buy(state, goodId, quantity) { return trade(state, goodId, quantity, true); }
  function sell(state, goodId, quantity) { return trade(state, goodId, quantity, false); }

  function travel(state, planetId, random = Math.random) {
    const planet = PLANETS.find(item => item.id === planetId);
    if (!planet) return failure(state, '알 수 없는 행성입니다.');
    if (planetId === state.planet) return failure(state, '이미 머물고 있는 행성입니다.');
    return success({ ...state, planet: planetId, turn: state.turn + 1, prices: generatePrices(random) }, `${planet.name} 도착 · 모든 행성의 시장 가격이 갱신되었습니다.`);
  }

  const api = Object.freeze({ GOODS, PLANETS, CAPACITY, GOAL, createGame, cargoCount, cargoValue, assets, buy, sell, travel });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StarMerchant = api;
})(globalThis);
