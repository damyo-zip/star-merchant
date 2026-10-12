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
