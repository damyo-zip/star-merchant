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
  const CONTRACTS = Object.freeze([
    { id: 'reactor', title: '광산의 동력 부족', destination: 'ares', good: 'crystal', quantity: 4, bonus: 260 },
    { id: 'banquet', title: '테라의 은하 만찬', destination: 'terra', good: 'spice', quantity: 3, bonus: 240 },
    { id: 'station', title: '해양 기지 수리', destination: 'nerea', good: 'alloy', quantity: 5, bonus: 260 },
    { id: 'dock', title: '휴양지 우주항 증설', destination: 'aurora', good: 'alloy', quantity: 6, bonus: 280 },
    { id: 'observatory', title: '오로라 관측소 가동', destination: 'aurora', good: 'crystal', quantity: 6, bonus: 300 },
    { id: 'expedition', title: '수정 탐사대의 보급', destination: 'vesper', good: 'spice', quantity: 4, bonus: 300 }
  ].map(Object.freeze));

  function scheduleEvent(startsAt, random) {
    const planet = PLANETS[Math.floor(random() * PLANETS.length)].id;
    const good = GOODS[Math.floor(random() * GOODS.length)].id;
    const kind = random() < 0.5 ? 'surplus' : 'demand';
    return { planet, good, kind, multiplier: kind === 'demand' ? 1.7 : 0.55, startsAt, endsAt: startsAt + 1 };
  }

  function generatePrices(random = Math.random, event = null) {
    return Object.fromEntries(PLANETS.map(planet => [planet.id,
      Object.fromEntries(GOODS.map((good, i) => [good.id, Math.round(planet.base[i] * (0.75 + random() * 0.5)
        * (event?.planet === planet.id && event.good === good.id ? event.multiplier : 1))]))
    ]));
  }

  function createGame(random = Math.random) {
    return { planet: 'terra', credits: 1000, turn: 0, capacity: CAPACITY, upgradeLevel: 0,
      cargo: { crystal: 0, alloy: 0, spice: 0 }, cargoCost: { crystal: 0, alloy: 0, spice: 0 },
      prices: generatePrices(random), won: false, winTurn: null, realizedProfit: 0, deliveries: 0,
      contract: null, completedOffers: [], event: null, forecast: scheduleEvent(2, random) };
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
    return { ok: true, state: { ...state, won, winTurn: state.winTurn ?? (won ? state.turn : null) }, message, justWon: !state.won && won };
  }

  function failure(state, message) {
    return { ok: false, state, message, justWon: false };
  }

  // Allocate a rounded share of the pooled purchase cost. A final sale consumes
  // the entire remaining cost, so repeated partial sales cannot invent profit.
  function unload(state, goodId, quantity) {
    const cost = Math.round(state.cargoCost[goodId] * quantity / state.cargo[goodId]);
    return { cost, cargo: { ...state.cargo, [goodId]: state.cargo[goodId] - quantity },
      cargoCost: { ...state.cargoCost, [goodId]: state.cargoCost[goodId] - cost } };
  }

  function saleProfit(state, goodId, quantity) {
    if (!GOODS.some(good => good.id === goodId) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > state.cargo[goodId]) return null;
    return state.prices[state.planet][goodId] * quantity - unload(state, goodId, quantity).cost;
  }

  function trade(state, goodId, quantity, buying) {
    const good = GOODS.find(item => item.id === goodId);
    if (!good) return failure(state, '알 수 없는 상품입니다.');
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return failure(state, '수량은 1 이상의 정수로 입력하세요.');
    const price = state.prices[state.planet][goodId];
    const cost = price * quantity;
    if (buying && cost > state.credits) return failure(state, '크레딧이 부족합니다. 수량을 줄여 주세요.');
    if (buying && cargoCount(state) + quantity > state.capacity) return failure(state, `화물칸이 부족합니다. 최대 ${state.capacity}개를 실을 수 있습니다.`);
    if (!buying && quantity > state.cargo[goodId]) return failure(state, '판매할 화물이 부족합니다.');
    const removed = buying ? null : unload(state, goodId, quantity);
    const profit = buying ? 0 : cost - removed.cost;
    const next = { ...state, credits: state.credits + (buying ? -cost : cost),
      cargo: buying ? { ...state.cargo, [goodId]: state.cargo[goodId] + quantity } : removed.cargo,
      cargoCost: buying ? { ...state.cargoCost, [goodId]: state.cargoCost[goodId] + cost } : removed.cargoCost,
      realizedProfit: state.realizedProfit + profit };
    return success(next, `${good.name} ${quantity}개 ${buying ? '구매' : '판매'} · ${cost.toLocaleString('ko-KR')} C`
      + (buying ? '' : ` · 손익 ${profit >= 0 ? '+' : ''}${profit.toLocaleString('ko-KR')} C`));
  }

  function buy(state, goodId, quantity) { return trade(state, goodId, quantity, true); }
  function sell(state, goodId, quantity) { return trade(state, goodId, quantity, false); }

  function getOffers(state) {
    const rotated = [...CONTRACTS.slice(state.turn % CONTRACTS.length), ...CONTRACTS.slice(0, state.turn % CONTRACTS.length)];
    return rotated.filter(item => item.destination !== state.planet).map(item => {
      const destination = PLANETS.find(planet => planet.id === item.destination);
      const price = destination.base[GOODS.findIndex(good => good.id === item.good)];
      return { ...item, id: `${state.turn}-${item.id}`, payout: price * item.quantity + item.bonus, limit: 4 };
    }).filter(item => !state.completedOffers.includes(item.id)).slice(0, 3);
  }

  function acceptContract(state, offerId) {
    if (state.contract?.status === 'active') return failure(state, '진행 중인 의뢰가 있습니다. 완료하거나 포기한 뒤 수락하세요.');
    const offer = getOffers(state).find(item => item.id === offerId);
    if (!offer) return failure(state, '현재 게시판에 없는 의뢰입니다.');
    const contract = { ...offer, deadline: state.turn + offer.limit, status: 'active' };
    return success({ ...state, contract }, `${offer.title} 수락 · ${offer.limit}번의 여행 안에 화물을 납품하세요.`);
  }

  function deliverContract(state) {
    const contract = state.contract;
    if (contract?.status !== 'active') return failure(state, '납품할 의뢰가 없습니다.');
    if (state.turn > contract.deadline) return failure(state, '의뢰 기한이 지났습니다.');
    if (state.planet !== contract.destination) return failure(state, '의뢰의 목적지 행성으로 이동하세요.');
    if (state.cargo[contract.good] < contract.quantity) return failure(state, '납품할 상품 수량이 부족합니다.');
    const removed = unload(state, contract.good, contract.quantity);
    return success({ ...state, credits: state.credits + contract.payout, cargo: removed.cargo, cargoCost: removed.cargoCost,
      realizedProfit: state.realizedProfit + contract.payout - removed.cost, deliveries: state.deliveries + 1,
      completedOffers: [...state.completedOffers, contract.id], contract: { ...contract, status: 'completed' } },
    `의뢰 완료! ${contract.payout.toLocaleString('ko-KR')} C 수령 · 추가 보상 ${contract.bonus} C 포함`);
  }

  function abandonContract(state) {
    if (state.contract?.status !== 'active') return failure(state, '포기할 의뢰가 없습니다.');
    return success({ ...state, contract: null }, '의뢰를 포기했습니다. 보유 화물과 크레딧은 그대로입니다.');
  }

  function nextUpgrade(state) {
    if (state.upgradeLevel >= 2) return null;
    return { cost: state.upgradeLevel === 0 ? 1200 : 2000, capacity: state.capacity + 5, reserve: 100 };
  }

  function upgradeShip(state) {
    const upgrade = nextUpgrade(state);
    if (!upgrade) return failure(state, '이미 최대 화물칸으로 확장했습니다.');
    if (state.credits < upgrade.cost) return failure(state, '확장에 필요한 크레딧이 부족합니다.');
    if (state.credits < upgrade.cost + upgrade.reserve) return failure(state, '다음 거래를 위해 확장 후 100 C 이상의 자금을 남겨두세요.');
    return success({ ...state, credits: state.credits - upgrade.cost, capacity: upgrade.capacity, upgradeLevel: state.upgradeLevel + 1 },
      `화물칸 ${upgrade.capacity}개로 확장! · ${upgrade.cost.toLocaleString('ko-KR')} C 투자`);
  }

  function travel(state, planetId, random = Math.random) {
    const planet = PLANETS.find(item => item.id === planetId);
    if (!planet) return failure(state, '알 수 없는 행성입니다.');
    if (planetId === state.planet) return failure(state, '이미 머물고 있는 행성입니다.');
    const turn = state.turn + 1;
    let event = state.event && turn <= state.event.endsAt ? state.event : null;
    let forecast = state.forecast;
    if (turn >= forecast.startsAt) {
      event = forecast;
      forecast = scheduleEvent(turn + 3, random);
    }
    const expired = state.contract?.status === 'active' && turn > state.contract.deadline;
    const contract = expired ? { ...state.contract, status: 'expired' } : state.contract;
    return success({ ...state, planet: planetId, turn, event, forecast, contract, completedOffers: [], prices: generatePrices(random, event) },
      `${planet.name} 도착 · 모든 행성의 시장 가격이 갱신되었습니다.` + (expired ? ' 의뢰 기한이 종료되었습니다. 위약금은 없습니다.' : ''));
  }

  const api = Object.freeze({ GOODS, PLANETS, CAPACITY, GOAL, createGame, cargoCount, cargoValue, assets, saleProfit,
    buy, sell, travel, getOffers, acceptContract, deliverContract, abandonContract, nextUpgrade, upgradeShip });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StarMerchant = api;
})(globalThis);
