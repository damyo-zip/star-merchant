/* DOM rendering and user interaction only; economy lives in game.js. */
(() => {
  'use strict';
  const game = globalThis.StarMerchant;
  const $ = id => document.getElementById(id);
  const format = value => value.toLocaleString('ko-KR');
  let state = game.createGame();
  const mobile = window.matchMedia('(max-width: 760px)');
  let toastTimer;

  function setScreen(screen, scroll = true) {
    for (const button of $('mobile-nav').querySelectorAll('button')) {
      const active = button.dataset.screen === screen;
      button.setAttribute('aria-pressed', String(active));
      $(`screen-${button.dataset.screen}`).classList.toggle('mobile-active', active);
    }
    if (mobile.matches && scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function announce(message, error = false) {
    $('feedback').textContent = message;
    $('feedback').classList.toggle('error', error);
    clearTimeout(toastTimer);
    $('mobile-toast').textContent = message;
    $('mobile-toast').classList.toggle('error', error);
    $('mobile-toast').hidden = !mobile.matches;
    toastTimer = setTimeout(() => { $('mobile-toast').hidden = true; }, 4500);
  }

  $('planet-list').innerHTML = game.PLANETS.map(planet => `
    <button class="planet-button" data-planet="${planet.id}">
      <span class="mini-planet planet-${planet.id}" aria-hidden="true"></span>
      <span class="planet-text"><strong>${planet.name}</strong><small>${planet.type}</small><small class="route-prices" id="route-prices-${planet.id}"></small><small class="route-estimate" id="route-estimate-${planet.id}"></small></span>
      <span class="planet-status">↗</span>
    </button>`).join('');

  $('market-list').innerHTML = game.GOODS.map(good => `
    <article class="good-card good-${good.id}">
      <div class="good-heading"><span class="good-symbol" aria-hidden="true">${good.symbol}</span><div><h3>${good.name}</h3><p>${good.description}</p></div><strong class="price" id="price-${good.id}"></strong></div>
      <div class="good-meta"><span id="price-note-${good.id}"></span><span id="owned-${good.id}"></span></div>
      <div class="trade-controls">
        <div class="trade-quantity"><div class="quantity"><button data-step="-1" data-good="${good.id}" aria-label="${good.name} 수량 줄이기">−</button><input id="quantity-${good.id}" type="number" min="1" max="20" step="1" value="1" inputmode="numeric" aria-label="${good.name} 거래 수량"><button data-step="1" data-good="${good.id}" aria-label="${good.name} 수량 늘리기">+</button></div>
        <div class="trade-shortcuts"><button data-quantity="max" data-good="${good.id}" aria-label="${good.name} 구매 가능한 최대 수량 선택">최대</button><button data-quantity="all" data-good="${good.id}" aria-label="${good.name} 보유 전량 선택">전량</button></div></div>
        <button class="buy-button" data-action="buy" data-good="${good.id}">구매 <span id="buy-total-${good.id}"></span></button>
        <button class="sell-button" data-action="sell" data-good="${good.id}">판매 <span id="sell-total-${good.id}"></span></button>
      </div>
    </article>`).join('');

  function renderTotals(goodId) {
    const quantity = Number($(`quantity-${goodId}`).value);
    const valid = Number.isSafeInteger(quantity) && quantity > 0;
    const total = valid ? `${format(quantity * state.prices[state.planet][goodId])} C` : '—';
    $(`buy-total-${goodId}`).textContent = total;
    $(`sell-total-${goodId}`).textContent = total;
  }

  function maxBuy(goodId) {
    return Math.min(game.CAPACITY - game.cargoCount(state), Math.floor(state.credits / state.prices[state.planet][goodId]));
  }

  function render() {
    const count = game.cargoCount(state);
    const total = game.assets(state);
    const planet = game.PLANETS.find(item => item.id === state.planet);
    $('turn').textContent = String(state.turn).padStart(2, '0');
    $('credits').innerHTML = `${format(state.credits)} <small>C</small>`;
    $('capacity').innerHTML = `${count} <small>/ ${game.CAPACITY}</small>`;
    $('free-space').textContent = `${game.CAPACITY - count}칸 사용 가능`;
    $('assets').innerHTML = `${format(total)} <small>C</small>`;
    $('goal-percent').innerHTML = `${Math.min(100, Math.floor(total / game.GOAL * 100))} <small>%</small>`;
    $('goal-progress').value = Math.min(total, game.GOAL);
    $('market-planet').textContent = planet.name;
    $('victory').hidden = !state.won;
    for (const button of $('planet-list').querySelectorAll('button')) {
      const current = button.dataset.planet === state.planet;
      button.disabled = current;
      button.classList.toggle('current', current);
      button.querySelector('.planet-status').textContent = current ? '현재' : '↗';
      const destination = game.PLANETS.find(item => item.id === button.dataset.planet);
      $(`route-prices-${destination.id}`).textContent = game.GOODS.map(good => `${good.symbol} ${state.prices[destination.id][good.id]}`).join(' · ');
      $(`route-prices-${destination.id}`).setAttribute('aria-label', game.GOODS.map(good => `${good.name} ${state.prices[destination.id][good.id]} 크레딧`).join(', '));
      const estimate = game.GOODS.reduce((sum, good) => sum + state.cargo[good.id] * state.prices[destination.id][good.id], 0);
      $(`route-estimate-${destination.id}`).textContent = `내 화물 시세 ${format(estimate)} C`;
      $(`route-estimate-${destination.id}`).hidden = count === 0;
      button.title = `${destination.name} · 현재 시세 화물 가치 ${format(estimate)} C (도착 시 가격 변동)`;
    }
    game.GOODS.forEach((good, i) => {
      const price = state.prices[state.planet][good.id];
      const difference = Math.round((price / planet.base[i] - 1) * 100);
      $(`price-${good.id}`).innerHTML = `${price} <small>C</small>`;
      $(`price-note-${good.id}`).textContent = `기준가 대비 ${difference > 0 ? '+' : ''}${difference}%`;
      $(`owned-${good.id}`).textContent = `보유 ${state.cargo[good.id]}개`;
      $('market-list').querySelector(`[data-quantity="max"][data-good="${good.id}"]`).disabled = maxBuy(good.id) === 0;
      $('market-list').querySelector(`[data-quantity="all"][data-good="${good.id}"]`).disabled = state.cargo[good.id] === 0;
      renderTotals(good.id);
    });
    $('cargo-list').innerHTML = game.GOODS.map(good => `
      <div class="cargo-row"><span class="cargo-symbol good-${good.id}" aria-hidden="true">${good.symbol}</span><div><strong>${good.name}</strong><small>${format(state.cargo[good.id] * state.prices[state.planet][good.id])} C</small></div><span class="cargo-amount">${state.cargo[good.id]}<small>개</small></span></div>`).join('');
    $('cargo-value').textContent = `${format(game.cargoValue(state))} C`;
  }

  function apply(result) {
    state = result.state;
    announce(result.justWon ? `${result.message} 목표 자산 달성! 은하의 무역왕이 되었습니다.` : result.message, !result.ok);
    render();
  }

  $('planet-list').addEventListener('click', event => {
    const button = event.target.closest('[data-planet]');
    if (button && !button.disabled) {
      const result = game.travel(state, button.dataset.planet);
      apply(result);
      if (result.ok && mobile.matches) setScreen('market');
    }
  });
  $('market-list').addEventListener('input', event => {
    if (event.target.matches('input')) renderTotals(event.target.id.replace('quantity-', ''));
  });
  $('market-list').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const goodId = button.dataset.good;
    const input = $(`quantity-${goodId}`);
    input.blur();
    if (button.dataset.step) {
      const current = Number(input.value);
      input.value = Math.max(1, Math.min(game.CAPACITY, (Number.isFinite(current) ? Math.floor(current) : 1) + Number(button.dataset.step)));
      renderTotals(goodId);
    } else if (button.dataset.quantity) {
      const buying = button.dataset.quantity === 'max';
      input.value = buying ? maxBuy(goodId) : state.cargo[goodId];
      renderTotals(goodId);
      announce(`${buying ? '구매' : '판매'} 수량 ${input.value}개 선택. ${buying ? '구매' : '판매'} 버튼을 눌러 거래하세요.`);
    } else if (button.dataset.action) {
      apply(game[button.dataset.action](state, goodId, Number(input.value)));
    }
  });
  $('mobile-nav').addEventListener('click', event => {
    const button = event.target.closest('[data-screen]');
    if (!button) return;
    $('mobile-toast').hidden = true;
    setScreen(button.dataset.screen);
  });
  $('restart').addEventListener('click', () => {
    if (!window.confirm('현재 항해를 끝내고 새 게임을 시작할까요?')) return;
    state = game.createGame();
    game.GOODS.forEach(good => { $(`quantity-${good.id}`).value = '1'; });
    setScreen('market');
    apply({ ok: true, state, message: '새 항해를 시작합니다. 초기 자금 1,000 C, 화물칸 20개가 준비되었습니다.' });
  });
  render();
})();
