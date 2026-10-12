const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../game.js');
const initial = () => game.createGame(() => 0.5);

function rejectUnchanged(state, action) {
  const snapshot = structuredClone(state);
  const result = action(state);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.deepEqual(state, snapshot);
  assert.ok(result.message);
}

test('초기 자금, 화물칸, 상품, 행성, 목표 자산', () => {
  const state = initial();
  assert.equal(state.credits, 1000);
  assert.equal(state.planet, 'terra');
  assert.equal(state.turn, 0);
  assert.equal(state.won, false);
  assert.equal(game.cargoCount(state), 0);
  assert.equal(game.assets(state), 1000);
  assert.equal(game.CAPACITY, 20);
  assert.equal(game.GOAL, 10000);
  assert.equal(game.PLANETS.length, 5);
  assert.equal(game.GOODS.length, 3);
  assert.equal(state.prices.terra.crystal, 60);
  assert.equal(state.prices.vesper.crystal, 35);
});

test('구매는 금액과 화물에 반영되며 원본 상태와 턴을 보존한다', () => {
  const before = initial();
  const snapshot = structuredClone(before);
  const result = game.buy(before, 'crystal', 5);
  assert.equal(result.ok, true);
  assert.equal(result.state.credits, 700);
  assert.equal(result.state.cargo.crystal, 5);
  assert.equal(game.cargoCount(result.state), 5);
  assert.equal(game.assets(result.state), 1000);
  assert.equal(result.state.turn, 0);
  assert.deepEqual(before, snapshot);
});

test('판매는 보유 수량을 줄이고 현재 시세로 대금을 지급한다', () => {
  const before = game.buy(initial(), 'crystal', 5).state;
  const snapshot = structuredClone(before);
  const result = game.sell(before, 'crystal', 3);
  assert.equal(result.ok, true);
  assert.equal(result.state.credits, 880);
  assert.equal(result.state.cargo.crystal, 2);
  assert.equal(result.state.turn, 0);
  assert.deepEqual(before, snapshot);
});

test('잔액을 초과하는 구매를 거절한다', () => {
  rejectUnchanged(initial(), state => game.buy(state, 'spice', 6));
});

test('잔액과 정확히 같은 금액의 구매를 허용한다', () => {
  const state = { ...initial(), credits: 600 };
  const result = game.buy(state, 'crystal', 10);
  assert.equal(result.ok, true);
  assert.equal(result.state.credits, 0);
});

test('여러 상품의 합산 화물 한도와 정확한 20칸 경계', () => {
  const state = { ...initial(), credits: 10000 };
  const first = game.buy(state, 'crystal', 12).state;
  const full = game.buy(first, 'alloy', 8);
  assert.equal(full.ok, true);
  assert.equal(game.cargoCount(full.state), 20);
  rejectUnchanged(full.state, current => game.buy(current, 'spice', 1));
  const freed = game.sell(full.state, 'crystal', 1).state;
  assert.equal(game.buy(freed, 'spice', 1).ok, true);
});

test('보유량보다 많은 판매와 빈 화물 판매를 거절한다', () => {
  rejectUnchanged(initial(), state => game.sell(state, 'spice', 1));
  const state = game.buy(initial(), 'crystal', 2).state;
  rejectUnchanged(state, current => game.sell(current, 'crystal', 3));
});

test('음수, 0, 소수, 무한대 등 잘못된 거래 수량을 거절한다', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, '1', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    for (const action of [game.buy, game.sell]) {
      rejectUnchanged(initial(), state => action(state, 'crystal', quantity));
    }
  }
});

test('없는 상품과 행성은 상태 변경 없이 거절한다', () => {
  rejectUnchanged(initial(), state => game.buy(state, 'unknown', 1));
  rejectUnchanged(initial(), state => game.sell(state, 'unknown', 1));
  rejectUnchanged(initial(), state => game.travel(state, 'unknown'));
});

test('여행은 1턴을 소모하고 모든 시장 가격을 갱신한다', () => {
  const before = game.buy(initial(), 'crystal', 2).state;
  const snapshot = structuredClone(before);
  const result = game.travel(before, 'ares', () => 0);
  assert.equal(result.ok, true);
  assert.equal(result.state.planet, 'ares');
  assert.equal(result.state.turn, 1);
  assert.equal(result.state.credits, before.credits);
  assert.deepEqual(result.state.cargo, before.cargo);
  for (const planet of game.PLANETS) {
    game.GOODS.forEach((good, i) => {
      assert.equal(result.state.prices[planet.id][good.id], Math.round(planet.base[i] * 0.75));
      assert.notEqual(result.state.prices[planet.id][good.id], before.prices[planet.id][good.id]);
    });
  }
  assert.deepEqual(before, snapshot);
});

test('같은 행성으로 이동해 가격을 새로 뽑을 수 없다', () => {
  rejectUnchanged(initial(), state => game.travel(state, 'terra', () => { throw new Error('호출되면 안 됨'); }));
});

test('가격은 행성별 기준가의 ±25% 안에서 양수 정수이다', () => {
  for (const random of [() => 0, () => 0.5, () => 0.999999]) {
    const state = game.createGame(random);
    for (const planet of game.PLANETS) {
      game.GOODS.forEach((good, i) => {
        const price = state.prices[planet.id][good.id];
        assert.ok(Number.isInteger(price) && price > 0);
        assert.ok(price >= Math.round(planet.base[i] * 0.75));
        assert.ok(price <= Math.round(planet.base[i] * 1.25));
      });
    }
  }
});

test('총자산은 현재 시장 화물 가치와 현금의 합이다', () => {
  const loaded = game.buy(initial(), 'crystal', 10).state;
  const arrived = game.travel(loaded, 'aurora', () => 0.5).state;
  assert.equal(game.cargoValue(arrived), 1300);
  assert.equal(game.assets(arrived), 1700);
  const sold = game.sell(arrived, 'crystal', 10).state;
  assert.equal(game.assets(sold), 1700);
  assert.equal(game.cargoValue(sold), 0);
});

test('목표 경계에서 승리하고 승리 피드백은 최초 1회만 발생한다', () => {
  const below = { ...initial(), credits: 9399, cargo: { crystal: 10, alloy: 0, spice: 0 } };
  assert.equal(game.assets(below), 9999);
  assert.equal(game.sell(below, 'crystal', 1).state.won, false);
  const exact = { ...below, credits: 9400 };
  const result = game.sell(exact, 'crystal', 1);
  assert.equal(game.assets(result.state), 10000);
  assert.equal(result.state.won, true);
  assert.equal(result.justWon, true);
  const continuation = game.travel(result.state, 'vesper', () => 0.5);
  assert.equal(continuation.state.won, true);
  assert.equal(continuation.justWon, false);
});

test('여행으로 화물 가치가 상승해도 승리한다', () => {
  const loaded = { ...initial(), credits: 9000, cargo: { crystal: 10, alloy: 0, spice: 0 } };
  const result = game.travel(loaded, 'aurora', () => 0.5);
  assert.equal(game.assets(result.state), 10300);
  assert.equal(result.state.won, true);
  assert.equal(result.justWon, true);
});

test('초기 상태부터 실제 교역만으로 목표를 달성할 수 있다', () => {
  let state = initial();
  function act(result) {
    assert.equal(result.ok, true, result.message);
    state = result.state;
    assert.ok(state.credits >= 0);
    assert.ok(game.cargoCount(state) <= 20);
  }
  for (let trip = 0; trip < 5; trip++) {
    act(game.travel(state, 'vesper', () => 0.5));
    act(game.buy(state, 'crystal', 20));
    act(game.travel(state, 'aurora', () => 0.5));
    act(game.sell(state, 'crystal', 20));
  }
  assert.equal(state.credits, 10500);
  assert.equal(state.turn, 10);
  assert.equal(state.won, true);
  assert.equal(game.cargoCount(state), 0);
});

test('의뢰 수락은 화물·자금·턴을 바꾸지 않고 납품금을 고정한다', () => {
  const state = initial();
  const snapshot = structuredClone(state);
  const offer = game.getOffers(state)[0];
  const result = game.acceptContract(state, offer.id);
  assert.equal(result.ok, true);
  assert.equal(result.state.credits, 1000);
  assert.equal(result.state.turn, 0);
  assert.deepEqual(result.state.cargo, state.cargo);
  assert.equal(result.state.contract.deadline, 4);
  assert.equal(result.state.contract.payout, 660);
  assert.deepEqual(state, snapshot);
  rejectUnchanged(result.state, current => game.acceptContract(current, offer.id));
  rejectUnchanged(state, current => game.acceptContract(current, 'forged-offer'));
});

test('의뢰 납품은 화물을 소모하고 추가 보상을 포함한 금액을 한 번만 지급한다', () => {
  let state = initial();
  state = game.acceptContract(state, game.getOffers(state)[0].id).state;
  rejectUnchanged(state, current => game.deliverContract(current));
  state = game.travel(state, 'ares', () => 0.5).state;
  rejectUnchanged(state, current => game.deliverContract(current));
  state = game.buy(state, 'crystal', 4).state;
  const before = structuredClone(state);
  const result = game.deliverContract(state);
  assert.equal(result.ok, true);
  assert.equal(result.state.credits, 1260); // 1,000 - 400 + 660
  assert.equal(result.state.cargo.crystal, 0);
  assert.equal(result.state.cargoCost.crystal, 0);
  assert.equal(result.state.realizedProfit, 260);
  assert.equal(result.state.deliveries, 1);
  assert.equal(result.state.contract.status, 'completed');
  assert.equal(result.state.turn, 1);
  assert.deepEqual(state, before);
  rejectUnchanged(result.state, current => game.deliverContract(current));
  rejectUnchanged(result.state, current => game.acceptContract(current, state.contract.id));
});

test('시장 가격이 급등해도 의뢰 납품금은 수락한 금액이다', () => {
  let state = initial();
  const offer = game.getOffers(state).find(item => item.good === 'alloy');
  state = game.acceptContract(state, offer.id).state;
  state = game.buy(state, 'alloy', 5).state;
  state = game.travel(state, 'vesper', () => 0.5).state;
  state = game.travel(state, 'nerea', () => 0.5).state;
  assert.equal(state.prices.nerea.alloy, 255);
  const result = game.deliverContract(state);
  assert.equal(result.state.credits, 1000 - 550 + offer.payout);
  assert.equal(result.state.realizedProfit, offer.payout - 550);
});

test('의뢰 마감 항해에는 납품 가능하고 다음 항해부터 만료된다', () => {
  let state = initial();
  state = game.acceptContract(state, game.getOffers(state)[0].id).state;
  state = game.buy(state, 'crystal', 4).state;
  for (const planet of ['vesper', 'terra', 'aurora', 'ares']) state = game.travel(state, planet, () => 0.5).state;
  assert.equal(state.turn, 4);
  assert.equal(game.deliverContract(state).ok, true);
  const expired = game.travel(state, 'terra', () => 0.5).state;
  assert.equal(expired.contract.status, 'expired');
  assert.equal(expired.credits, state.credits);
  assert.deepEqual(expired.cargo, state.cargo);
  rejectUnchanged(expired, current => game.deliverContract(current));
  assert.equal(game.acceptContract(expired, game.getOffers(expired)[0].id).ok, true);
});

test('의뢰를 포기하거나 만료시켜 보상을 받을 수 없다', () => {
  let state = initial();
  state = game.acceptContract(state, game.getOffers(state)[0].id).state;
  state = game.buy(state, 'crystal', 4).state;
  const result = game.abandonContract(state);
  assert.equal(result.state.contract, null);
  assert.equal(result.state.credits, state.credits);
  assert.deepEqual(result.state.cargo, state.cargo);
  assert.equal(result.state.realizedProfit, 0);
  rejectUnchanged(result.state, current => game.deliverContract(current));
  rejectUnchanged(result.state, current => game.abandonContract(current));
});

test('게시판 의뢰는 목적지 여행을 요구하고 여행 후 갱신된다', () => {
  const state = initial();
  const offers = game.getOffers(state);
  assert.equal(offers.length, 3);
  assert.ok(offers.every(offer => offer.destination !== state.planet));
  const accepted = game.acceptContract(state, offers[0].id).state;
  const arrived = game.travel(accepted, 'vesper', () => 0.5).state;
  assert.deepEqual(arrived.contract, accepted.contract);
  assert.notDeepEqual(game.getOffers(arrived), offers);
  assert.ok(game.getOffers(arrived).every(offer => offer.destination !== arrived.planet));
});

test('확장비와 거래 자금 예비액을 검증하고 30칸까지만 확장한다', () => {
  rejectUnchanged(initial(), state => game.upgradeShip(state));
  rejectUnchanged({ ...initial(), credits: 1200 }, state => game.upgradeShip(state));
  rejectUnchanged({ ...initial(), credits: 1299 }, state => game.upgradeShip(state));
  const state = { ...initial(), credits: 3300 };
  const snapshot = structuredClone(state);
  const first = game.upgradeShip(state);
  assert.equal(first.ok, true);
  assert.equal(first.state.capacity, 25);
  assert.equal(first.state.credits, 2100);
  const second = game.upgradeShip(first.state);
  assert.equal(second.ok, true);
  assert.equal(second.state.capacity, 30);
  assert.equal(second.state.credits, 100);
  assert.equal(second.state.turn, 0);
  assert.equal(game.nextUpgrade(second.state), null);
  rejectUnchanged(second.state, current => game.upgradeShip(current));
  assert.deepEqual(state, snapshot);
});

test('확장된 화물칸 한도가 여러 상품의 합계에 적용된다', () => {
  let state = game.upgradeShip({ ...initial(), credits: 10000 }).state;
  state = game.buy(state, 'crystal', 20).state;
  state = game.buy(state, 'alloy', 5).state;
  assert.equal(game.cargoCount(state), 25);
  rejectUnchanged(state, current => game.buy(current, 'spice', 1));
  state = game.upgradeShip(state).state;
  assert.equal(game.buy(state, 'spice', 5).ok, true);
});

test('실제 매입가를 바탕으로 판매 손익을 계산한다', () => {
  let state = game.buy(initial(), 'crystal', 5).state;
  state = game.travel(state, 'ares', () => 0.5).state;
  assert.equal(game.saleProfit(state, 'crystal', 2), 80);
  state = game.sell(state, 'crystal', 2).state;
  assert.equal(state.cargoCost.crystal, 180);
  assert.equal(state.realizedProfit, 80);
  state = game.sell(state, 'crystal', 3).state;
  assert.equal(state.realizedProfit, 200);
  assert.equal(state.cargoCost.crystal, 0);
  assert.equal(state.credits, 1200);
  assert.equal(game.saleProfit(state, 'crystal', 1), null);
  assert.equal(game.saleProfit(state, 'unknown', 1), null);
  assert.equal(game.saleProfit(state, 'crystal', -1), null);
});

test('다른 가격의 매입과 반복 부분 판매에도 원가와 손익 합계가 보존된다', () => {
  let state = game.buy(initial(), 'crystal', 2).state;
  state = game.travel(state, 'ares', () => 0.5).state;
  state = game.buy(state, 'crystal', 1).state;
  assert.equal(state.cargoCost.crystal, 220);
  const first = game.sell(state, 'crystal', 1).state;
  assert.equal(first.cargoCost.crystal, 147);
  const second = game.sell(first, 'crystal', 2).state;
  assert.equal(second.realizedProfit, 80);
  assert.equal(second.cargoCost.crystal, 0);
  assert.equal(second.credits, 1080);
});

test('손해 거래는 음수로 표시되며 부족한 의뢰 화물의 원가는 보존된다', () => {
  let state = game.travel(initial(), 'ares', () => 0.5).state;
  state = game.buy(state, 'crystal', 5).state;
  state = game.travel(state, 'terra', () => 0.5).state;
  assert.equal(game.saleProfit(state, 'crystal', 1), -40);
  state = game.sell(state, 'crystal', 1).state;
  assert.equal(state.realizedProfit, -40);
  state = game.acceptContract(state, game.getOffers(state).find(offer => offer.good === 'crystal').id).state;
  state = game.travel(state, 'aurora', () => 0.5).state;
  // This offer requires 6 crystals; missing stock must not consume the 4 held.
  rejectUnchanged(state, current => game.deliverContract(current));
  assert.equal(state.cargoCost.crystal, 400);
});

test('한 화물 묶음을 일반 판매와 의뢰 납품으로 나눠도 원가가 보존된다', () => {
  let state = initial();
  state = game.acceptContract(state, game.getOffers(state)[0].id).state;
  state = game.buy(state, 'crystal', 5).state;
  state = game.sell(state, 'crystal', 1).state;
  state = game.travel(state, 'ares', () => 0.5).state;
  state = game.deliverContract(state).state;
  assert.equal(state.cargo.crystal, 0);
  assert.equal(state.cargoCost.crystal, 0);
  assert.equal(state.realizedProfit, 420);
  assert.equal(state.credits, 1420);
});

test('기한을 조작해 지난 의뢰를 납품하려 해도 상태는 변경되지 않는다', () => {
  let state = initial();
  state = game.acceptContract(state, game.getOffers(state)[0].id).state;
  state = game.buy(state, 'crystal', 4).state;
  state = game.travel(state, 'ares', () => 0.5).state;
  state = { ...state, turn: 5 };
  rejectUnchanged(state, current => game.deliverContract(current));
});

test('특별 시세는 미리 예고된 항해에 발생하고 2항해 후 종료된다', () => {
  let state = initial();
  const forecast = structuredClone(state.forecast);
  assert.equal(state.event, null);
  assert.equal(forecast.startsAt, 2);
  assert.equal(forecast.endsAt, 3);
  state = game.travel(state, 'ares', () => 0.5).state;
  assert.equal(state.event, null);
  state = game.travel(state, 'nerea', () => 0.5).state;
  assert.deepEqual(state.event, forecast);
  assert.equal(state.prices.nerea.alloy, 255);
  assert.equal(state.prices.nerea.crystal, 85);
  assert.equal(state.forecast.startsAt, 5);
  state = game.travel(state, 'terra', () => 0.5).state;
  assert.equal(state.prices.nerea.alloy, 255);
  state = game.travel(state, 'ares', () => 0.5).state;
  assert.equal(state.event, null);
  assert.equal(state.prices.nerea.alloy, 150);
});

test('과잉 공급 가격은 대상 상품에만 적용되고 여행 중 가격은 양수다', () => {
  let state = game.createGame(() => 0);
  state = game.travel(state, 'ares', () => 0).state;
  state = game.travel(state, 'terra', () => 0).state;
  assert.equal(state.event.kind, 'surplus');
  assert.equal(state.prices.terra.crystal, Math.round(60 * 0.75 * 0.55));
  assert.equal(state.prices.terra.alloy, Math.round(110 * 0.75));
  for (const prices of Object.values(state.prices)) assert.ok(Object.values(prices).every(price => Number.isInteger(price) && price > 0));
});

test('납품 보상으로도 승리하고 최초 승리 항해 수는 고정된다', () => {
  let state = initial();
  state = game.acceptContract(state, game.getOffers(state)[0].id).state;
  state = game.buy(state, 'crystal', 4).state;
  state = game.travel(state, 'ares', () => 0.5).state;
  state = { ...state, credits: 9400 };
  const result = game.deliverContract(state);
  assert.equal(result.justWon, true);
  assert.equal(result.state.winTurn, 1);
  const next = game.travel(result.state, 'terra', () => 0.5);
  assert.equal(next.state.winTurn, 1);
  assert.equal(next.justWon, false);
});

test('배송부터 확장, 교역, 승리까지 이어지는 한 판', () => {
  let state = initial();
  function act(result) {
    assert.equal(result.ok, true, result.message);
    state = result.state;
    assert.ok(state.credits >= 0);
    assert.ok(game.cargoCount(state) <= state.capacity);
  }
  act(game.acceptContract(state, game.getOffers(state)[0].id));
  act(game.buy(state, 'crystal', 4));
  act(game.travel(state, 'ares', () => 0.5));
  act(game.deliverContract(state));
  assert.equal(state.credits, 1420);
  act(game.upgradeShip(state));
  for (let trip = 0; trip < 7 && !state.won; trip++) {
    act(game.travel(state, 'vesper', () => 0.5));
    const quantity = Math.min(state.capacity, Math.floor(state.credits / state.prices.vesper.crystal));
    act(game.buy(state, 'crystal', quantity));
    act(game.travel(state, 'aurora', () => 0.5));
    act(game.sell(state, 'crystal', quantity));
  }
  assert.equal(state.won, true);
  assert.equal(state.capacity, 25);
  assert.equal(state.deliveries, 1);
  assert.equal(state.cargo.crystal, 0);
  assert.equal(state.realizedProfit - 1200 + 1000, state.credits);
});
