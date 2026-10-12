/* DOM rendering and user interaction only; economy lives in game.js. */
(() => {
  'use strict';
  const game = globalThis.StarMerchant;
  const $ = id => document.getElementById(id);
  const format = value => value.toLocaleString('ko-KR');
  let state = game.createGame();
  const mobile = window.matchMedia('(max-width: 760px)');
  let toastTimer;
  let bestRecord = null;
  let newRecord = false;
  try {
    const stored = localStorage.getItem('star-merchant-best-turn');
    const value = stored === null ? NaN : Number(stored);
    if (Number.isSafeInteger(value) && value >= 1 && value <= 1000000) bestRecord = value;
  } catch { /* Records are optional when storage is unavailable. */ }
  const planetName = id => game.PLANETS.find(item => item.id === id).name;
  const goodName = id => game.GOODS.find(item => item.id === id).name;
  const signed = value => `${value >= 0 ? '+' : ''}${format(value)}`;

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
      <p id="profit-${good.id}" class="sale-preview" hidden></p>
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
    const profit = game.saleProfit(state, goodId, quantity);
    $(`profit-${goodId}`).hidden = profit === null;
    $(`profit-${goodId}`).textContent = profit === null ? '' : `이 수량 판매 손익 ${signed(profit)} C`;
    $(`profit-${goodId}`).classList.toggle('loss', profit !== null && profit < 0);
  }

  function maxBuy(goodId) {
    return Math.min(state.capacity - game.cargoCount(state), Math.floor(state.credits / state.prices[state.planet][goodId]));
  }

  function eventTitle(event) {
    return `${planetName(event.planet)} · ${goodName(event.good)} ${event.kind === 'demand' ? '수요 급증 ×1.7' : '과잉 공급 ×0.55'}`;
  }

  function renderNews() {
    const active = state.event ? `진행 중: ${eventTitle(state.event)} · 항해 ${state.event.endsAt}까지` : '현재 특별 시세 없음';
    const forecast = `${state.forecast.startsAt - state.turn}번 여행 후: ${eventTitle(state.forecast)}`;
    $('news-headline').textContent = state.event ? `✦ ${active}` : `↗ ${forecast}`;
    const markup = `<p>${active}</p><p>${forecast}</p><small>특별 시세는 2항해 동안 유지됩니다. 일반 변동 가격에 배수가 적용됩니다.</small>`;
    $('news-details').innerHTML = markup;
    $('route-news').innerHTML = `<p class="eyebrow">은하 시장 소식</p>${markup}`;
  }

  function renderContracts() {
    const contract = state.contract;
    const active = contract?.status === 'active';
    const completed = contract?.status === 'completed';
    $('contracts-count').textContent = `${state.deliveries}건 완료`;
    $('mission-shortcut').textContent = active
      ? `◎ ${goodName(contract.good)} ${Math.min(state.cargo[contract.good], contract.quantity)}/${contract.quantity} → ${planetName(contract.destination)} · 남은 ${contract.deadline - state.turn}항해 ›`
      : '◎ 배송 의뢰로 추가 보상 받기 ›';
    if (contract) {
      const ready = active && state.planet === contract.destination && state.cargo[contract.good] >= contract.quantity;
      const remaining = contract.deadline - state.turn;
      const status = !active ? (completed ? '납품 완료! 다음 의뢰에 도전하세요.' : '기한 종료 · 위약금 없음. 새 의뢰를 받을 수 있습니다.')
        : `${remaining === 0 ? '이번 항해 안에 납품!' : `${remaining}번 더 여행할 수 있습니다.`} ${state.planet !== contract.destination ? '목적지로 이동하세요.' : ready ? '납품 준비 완료!' : '상품을 더 구해주세요.'}`;
      $('active-contract').innerHTML = `<article class="contract-card active-contract ${completed ? 'completed' : ''}">
        <p class="eyebrow">${active ? '진행 중인 의뢰' : completed ? '최근 완료한 의뢰' : '종료된 의뢰'}</p>
        <h3>${contract.title}</h3><p>${goodName(contract.good)} ${contract.quantity}개 → <strong>${planetName(contract.destination)}</strong></p>
        <p class="contract-reward">납품금 ${format(contract.payout)} C <small>추가 보상 ${contract.bonus} C 포함</small></p>
        ${active ? `<progress value="${Math.min(state.cargo[contract.good], contract.quantity)}" max="${contract.quantity}" aria-label="납품 화물 준비"></progress><p>보유 ${state.cargo[contract.good]} / 필요 ${contract.quantity}개 · 마감 항해 ${contract.deadline}</p>` : ''}
        <p class="contract-status">${status}</p>${active ? `<div class="contract-actions"><button class="buy-button" data-contract-action="deliver" ${ready ? '' : 'disabled'}>납품하고 보상 받기</button><button class="quiet" data-contract-action="abandon">포기</button></div>` : ''}</article>`;
    } else $('active-contract').innerHTML = '<p class="empty-contract">짧은 배송부터 시작해 보세요. 추가 보상은 확장 자금이 됩니다.</p>';
    $('contract-offers').innerHTML = game.getOffers(state).map(offer => `<article class="contract-card">
      <h3>${offer.title}</h3><p>${goodName(offer.good)} ${offer.quantity}개 → <strong>${planetName(offer.destination)}</strong></p>
      <p class="contract-reward">${format(offer.payout)} C <small>추가 보상 ${offer.bonus} C 포함</small></p>
      <button class="sell-button" data-offer="${offer.id}" ${active ? 'disabled' : ''}>의뢰 수락 · 제한 ${offer.limit}항해</button></article>`).join('');
  }

  function renderShip() {
    $('realized-profit').textContent = `${signed(state.realizedProfit)} C`;
    $('delivery-count').textContent = `${state.deliveries}건`;
    const upgrade = game.nextUpgrade(state);
    $('upgrade-description').textContent = upgrade
      ? `${state.capacity} → ${upgrade.capacity}칸 · ${state.credits < upgrade.cost + upgrade.reserve ? `${format(upgrade.cost + upgrade.reserve - state.credits)} C 더 필요합니다.` : '확장 준비 완료!'} 거래 자금 100 C는 남겨둡니다.`
      : '30칸 확장 완료. 더 큰 거래를 시작하세요.';
    $('upgrade-button').textContent = upgrade ? `${format(upgrade.cost)} C · 화물칸 +5` : '최대 확장 완료';
    $('upgrade-button').disabled = !upgrade || state.credits < upgrade.cost + upgrade.reserve;
  }

  function render() {
    const count = game.cargoCount(state);
    const total = game.assets(state);
    const planet = game.PLANETS.find(item => item.id === state.planet);
    $('turn').textContent = String(state.turn).padStart(2, '0');
    $('credits').innerHTML = `${format(state.credits)} <small>C</small>`;
    $('capacity').innerHTML = `${count} <small>/ ${state.capacity}</small>`;
    $('free-space').textContent = `${state.capacity - count}칸 사용 가능`;
    $('assets').innerHTML = `${format(total)} <small>C</small>`;
    $('goal-percent').innerHTML = `${Math.min(100, Math.floor(total / game.GOAL * 100))} <small>%</small>`;
    $('goal-progress').value = Math.min(total, game.GOAL);
    $('market-planet').textContent = planet.name;
    $('victory').hidden = !state.won;
    $('victory-detail').textContent = `${state.winTurn}항해 만에 목표 달성! ${newRecord ? '새 최단 기록입니다. ' : ''}새 게임에서 더 짧은 항로에 도전해 보세요.`;
    $('best-record').textContent = bestRecord === null ? '최단 승리 기록에 도전하세요.' : `최단 승리 기록 · ${bestRecord}항해`;
    renderNews();
    renderContracts();
    renderShip();
    for (const button of $('planet-list').querySelectorAll('button')) {
      const current = button.dataset.planet === state.planet;
      button.disabled = current;
      button.classList.toggle('current', current);
      button.querySelector('.planet-status').textContent = current ? '현재'
        : state.contract?.status === 'active' && state.contract.destination === button.dataset.planet ? '납품지'
        : state.event?.planet === button.dataset.planet ? '특별 시세' : '↗';
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
      $(`quantity-${good.id}`).max = state.capacity;
      $('market-list').querySelector(`[data-quantity="max"][data-good="${good.id}"]`).disabled = maxBuy(good.id) === 0;
      $('market-list').querySelector(`[data-quantity="all"][data-good="${good.id}"]`).disabled = state.cargo[good.id] === 0;
      renderTotals(good.id);
    });
    $('cargo-list').innerHTML = game.GOODS.map(good => `
      <div class="cargo-row"><span class="cargo-symbol good-${good.id}" aria-hidden="true">${good.symbol}</span><div><strong>${good.name}</strong><small>평가 ${format(state.cargo[good.id] * state.prices[state.planet][good.id])} C · 매입 ${format(state.cargoCost[good.id])} C</small></div><span class="cargo-amount">${state.cargo[good.id]}<small>개</small></span></div>`).join('');
    $('cargo-value').textContent = `${format(game.cargoValue(state))} C`;
  }

  function apply(result) {
    state = result.state;
    if (result.justWon && (bestRecord === null || state.winTurn < bestRecord)) {
      bestRecord = state.winTurn;
      newRecord = true;
      try { localStorage.setItem('star-merchant-best-turn', String(bestRecord)); } catch { /* Continue playing without storage. */ }
    }
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
      input.value = Math.max(1, Math.min(state.capacity, (Number.isFinite(current) ? Math.floor(current) : 1) + Number(button.dataset.step)));
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
  $('mission-shortcut').addEventListener('click', () => {
    setScreen('contracts');
    if (!mobile.matches) $('screen-contracts').scrollIntoView({ block: 'start' });
  });
  $('screen-contracts').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.offer) apply(game.acceptContract(state, button.dataset.offer));
    else if (button.dataset.contractAction === 'deliver') apply(game.deliverContract(state));
    else if (button.dataset.contractAction === 'abandon' && window.confirm('의뢰를 포기할까요? 보유 화물은 그대로 유지됩니다.')) apply(game.abandonContract(state));
  });
  $('upgrade-button').addEventListener('click', () => {
    const upgrade = game.nextUpgrade(state);
    if (upgrade && window.confirm(`${format(upgrade.cost)} C를 투자해 화물칸을 ${upgrade.capacity}개로 확장할까요?`)) apply(game.upgradeShip(state));
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
    newRecord = false;
    game.GOODS.forEach(good => { $(`quantity-${good.id}`).value = '1'; });
    setScreen('market');
    apply({ ok: true, state, message: '새 항해를 시작합니다. 초기 자금 1,000 C, 화물칸 20개가 준비되었습니다.' });
  });
  render();
})();
