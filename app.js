(function () {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const API_BASE = '';

  let STATE = null;
  let currentKeyDevice = null;
  let pendingConfirmAction = null;

  // ================= TELEGRAM WEBAPP BOOTSTRAP =================
  function initTelegram() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#131314'); } catch (e) {}
    try { tg.setBackgroundColor('#131314'); } catch (e) {}
    try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
  }

  function haptic(type, style) {
    if (!tg || !tg.HapticFeedback) return;
    try {
      if (type === 'impact') tg.HapticFeedback.impactOccurred(style || 'light');
      else if (type === 'notification') tg.HapticFeedback.notificationOccurred(style || 'success');
      else if (type === 'selection') tg.HapticFeedback.selectionChanged();
    } catch (e) {}  
  }

  // ================= API =================
  async function api(path, options) {
    options = options || {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const initData = tg ? tg.initData : '';
      const headers = Object.assign({ 'Authorization': 'tma ' + initData }, options.headers || {});
      if (options.body) headers['Content-Type'] = 'application/json';
      const resp = await fetch(API_BASE + path, Object.assign({}, options, { headers, signal: controller.signal }));
      let data = null;
      try { data = await resp.json(); } catch (e) {}
      if (!resp.ok) {
        const err = new Error((data && (data.message || data.error)) || 'Request failed');
        err.status = resp.status;
        err.data = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // ================= BOOT / ERROR =================
  async function boot() {
    if (!tg || !tg.initData) {
      showError('Откройте через Telegram', 'Это приложение работает только внутри Telegram — из бота Relight VPN.');
      return;
    }
    try {
      STATE = await api('/api/bootstrap');
      showApp();
      renderAll();
    } catch (e) {
      const text = e.status === 401
        ? 'Сессия устарела. Закройте приложение и откройте его заново из бота.'
        : 'Проверьте соединение и попробуйте снова.';
      showError('Не удалось загрузить', text);
    }
  }

  function showError(title, text) {
    document.getElementById('boot').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorText').textContent = text;
    document.getElementById('errorScreen').classList.remove('hidden');
  }

  function showApp() {
    document.getElementById('boot').classList.add('hidden');
    document.getElementById('errorScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  }

  // ================= HELPERS =================
  function pluralDays(n) {
    n = Math.abs(Math.trunc(n));
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 > 10 && mod100 < 20) return 'дней';
    if (mod10 > 1 && mod10 < 5) return 'дня';
    if (mod10 === 1) return 'день';
    return 'дней';
  }

  function daysLeft(expiryTs) {
    return Math.ceil((expiryTs - Date.now() / 1000) / 86400);
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  // ================= TOAST =================
  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ================= TABS =================
  function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.tab !== name));
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.getElementById('appContent').scrollTop = 0;
    haptic('selection');
  }

  // ================= RENDER: OVERVIEW =================
  function renderOverview() {
    const p = STATE.profile;
    const left = daysLeft(p.expiry);

    document.getElementById('tunnelCard').classList.toggle('active', p.is_active);

    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (p.is_active) {
      dot.className = 'status-dot ' + (left <= 3 ? 'warn' : 'good');
      statusText.textContent = left <= 0 ? 'Активна · истекает сегодня' : `Активна · осталось ${left} ${pluralDays(left)}`;
    } else {
      dot.className = 'status-dot bad';
      statusText.textContent = 'Не активна';
    }

    document.getElementById('expiryValue').textContent = p.expiry ? fmtDate(p.expiry) : '—';
    document.getElementById('deviceCountValue').textContent = `${p.device_count} из ${p.max_devices}`;

    const cta = document.getElementById('extendCta');
    if (!p.is_active) {
      cta.classList.remove('hidden');
      document.getElementById('extendCtaTitle').textContent = 'Подписка не активна';
      document.getElementById('extendCtaHint').textContent = 'Оформите тариф, чтобы включить VPN';
    } else if (left <= 3) {
      cta.classList.remove('hidden');
      document.getElementById('extendCtaTitle').textContent = 'Подписка скоро закончится';
      document.getElementById('extendCtaHint').textContent = `Осталось ${left} ${pluralDays(left)} — продлите заранее`;
    } else {
      cta.classList.add('hidden');
    }

    const list = document.getElementById('quickDeviceList');
    if (!STATE.devices.length) {
      list.innerHTML = '<div class="empty-hint">Устройств пока нет — добавьте на вкладке «Устройства»</div>';
    } else {
      list.innerHTML = STATE.devices
        .slice(0, 4)
        .map(
          (d) => `
        <div class="quick-row">
          <span class="status-dot ${d.is_active ? 'good' : 'bad'}"></span>
          <span class="quick-row-name">${escapeHtml(d.name)}</span>
          <span class="quick-row-exp">${fmtDate(d.expiry)}</span>
        </div>`
        )
        .join('');
    }
  }

  // ================= RENDER: DEVICES =================
  function renderDevices() {
    const atLimit = STATE.devices.length >= STATE.profile.max_devices;
    document.getElementById('deviceLimitLabel').textContent = `${STATE.devices.length}/${STATE.profile.max_devices}`;
    document.getElementById('openAddDevice').disabled = atLimit;

    const list = document.getElementById('devicesList');
    if (!STATE.devices.length) {
      list.innerHTML = '<div class="empty-hint">Пока нет ни одного устройства</div>';
      return;
    }
    list.innerHTML = STATE.devices
      .map(
        (d) => `
      <div class="device-card">
        <div class="device-card-top">
          <span class="device-name">${escapeHtml(d.name)}</span>
          <span class="device-pill ${d.is_active ? 'good' : 'bad'}">${d.is_active ? 'активно' : 'истекло'}</span>
        </div>
        <div class="device-meta">до ${fmtDate(d.expiry)} · создано ${fmtDate(d.created_at)}</div>
        <div class="device-actions">
          <button class="btn btn-ghost btn-sm" data-act="key" data-uuid="${d.uuid}">Ключ</button>
          <button class="btn btn-ghost btn-sm" data-act="replace" data-uuid="${d.uuid}">Заменить</button>
          ${STATE.devices.length > 1 ? `<button class="btn btn-danger btn-sm" data-act="delete" data-uuid="${d.uuid}">Удалить</button>` : ''}
        </div>
      </div>`
      )
      .join('');
  }

  // ================= RENDER: PLANS =================
  const PLAN_LABELS = { 1: '1 месяц', 3: '3 месяца', 6: '6 месяцев' };
  function renderPlans() {
    const basePlan = STATE.plans.find((p) => p.months === 1);
    const base = basePlan ? basePlan.price : 0;
    const list = document.getElementById('plansList');
    list.innerHTML = STATE.plans
      .map((p) => {
        const fullPrice = base * p.months;
        const save = fullPrice > 0 ? Math.round((1 - p.price / fullPrice) * 100) : 0;
        const perMonth = Math.round(p.price / p.months);
        const best = p.months === Math.max(...STATE.plans.map((x) => x.months));
        return `
        <div class="plan-card ${best ? 'best' : ''}" data-months="${p.months}">
          ${save > 0 ? `<span class="plan-badge">-${save}%</span>` : ''}
          <div>
            <div class="plan-months">${PLAN_LABELS[p.months] || p.months + ' мес.'}</div>
            <div class="plan-sub">≈ ${perMonth} ₽ / мес</div>
          </div>
          <div class="plan-price">${p.price} ₽</div>
        </div>`;
      })
      .join('');
  }

  // ================= RENDER: REFERRAL =================
  function renderReferral() {
    const r = STATE.referral;
    animateNumber(document.getElementById('refTotal'), r.total);
    animateNumber(document.getElementById('refActive'), r.active);
    animateNumber(document.getElementById('refBonus'), r.bonus_days);
    document.getElementById('refLinkText').textContent = r.link;
  }

  function renderAll() {
    renderOverview();
    renderDevices();
    renderPlans();
    renderReferral();
  }

  // ================= SHEETS =================
  function openSheet(id) {
    document.getElementById(id).classList.add('show');
  }
  function closeSheet(id) {
    document.getElementById(id).classList.remove('show');
  }

  function openAddDeviceSheet() {
    if (STATE.devices.length >= STATE.profile.max_devices) {
      toast('Достигнут лимит устройств', 'err');
      return;
    }
    document.getElementById('deviceNameInput').value = '';
    openSheet('sheetOverlay');
    setTimeout(() => document.getElementById('deviceNameInput').focus(), 260);
  }

  async function confirmAddDevice() {
    const input = document.getElementById('deviceNameInput');
    const name = input.value.trim();
    if (!name || name.length > 20) {
      toast('Название — от 1 до 20 символов', 'err');
      return;
    }
    const btn = document.getElementById('confirmAddDevice');
    btn.disabled = true;
    try {
      STATE = await api('/api/devices', { method: 'POST', body: JSON.stringify({ name }) });
      renderAll();
      closeSheet('sheetOverlay');
      haptic('notification', 'success');
      toast('Устройство добавлено', 'ok');
      celebrate(document.getElementById('openAddDevice'));
    } catch (e) {
      haptic('notification', 'error');
      toast(e.message || 'Не удалось добавить устройство', 'err');
    } finally {
      btn.disabled = false;
    }
  }

  function findDevice(uuid) {
    return STATE.devices.find((d) => String(d.uuid) === String(uuid));
  }

  function openKeySheet(uuid) {
    const d = findDevice(uuid);
    if (!d) return;
    currentKeyDevice = d;
    document.getElementById('keySheetTitle').textContent = d.name;
    document.getElementById('keySubUrl').textContent = d.subscription_url;
    document.getElementById('keyVlessUrl').textContent = d.vless_link;
    document.getElementById('keyHy2Url').textContent = d.hy2_link;
    document.getElementById('manualLinksBody').classList.remove('open');
    document.getElementById('manualLinksToggle').classList.remove('open');

    const qrHost = document.getElementById('qrCode');
    qrHost.innerHTML = '';
    try {
      /* global QRCode */
      new QRCode(qrHost, {
        text: d.subscription_url,
        width: 168,
        height: 168,
        colorDark: '#131314',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {}

    openSheet('keySheetOverlay');
  }

  function openConfirm(title, text, onOk) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    pendingConfirmAction = onOk;
    openSheet('confirmOverlay');
  }

  async function deleteDevice(uuid) {
    const d = findDevice(uuid);
    if (!d) return;
    openConfirm('Удалить устройство?', `Ключ «${d.name}» перестанет работать на этом устройстве.`, async () => {
      try {
        STATE = await api('/api/devices/' + encodeURIComponent(uuid), { method: 'DELETE' });
        renderAll();
        haptic('notification', 'success');
        toast('Устройство удалено', 'ok');
      } catch (e) {
        haptic('notification', 'error');
        toast(e.message || 'Не удалось удалить', 'err');
      }
    });
  }

  async function replaceDevice(uuid) {
    const d = findDevice(uuid);
    if (!d) return;
    openConfirm(
      'Заменить ключ?',
      `Старая ссылка для «${d.name}» перестанет работать — потребуется заново импортировать новую.`,
      async () => {
        try {
          STATE = await api('/api/devices/' + encodeURIComponent(uuid) + '/replace', { method: 'POST' });
          renderAll();
          haptic('notification', 'success');
          toast('Ключ заменён', 'ok');
        } catch (e) {
          haptic('notification', 'error');
          toast(e.message || 'Не удалось заменить ключ', 'err');
        }
      }
    );
  }

  // ================= PROMO =================
  async function submitPromo() {
    const input = document.getElementById('promoInput');
    const code = input.value.trim();
    const resultEl = document.getElementById('promoResult');
    if (!code) return;
    const btn = document.getElementById('promoSubmit');
    btn.disabled = true;
    try {
      const res = await api('/api/promo', { method: 'POST', body: JSON.stringify({ code }) });
      STATE = res.state;
      renderAll();
      resultEl.textContent = res.message;
      resultEl.className = 'promo-result ' + (res.success ? 'ok' : 'err');
      resultEl.classList.remove('hidden');
      if (res.success) {
        input.value = '';
        haptic('notification', 'success');
        celebrate(resultEl);
      } else {
        haptic('notification', 'error');
      }
    } catch (e) {
      resultEl.textContent = (e.data && e.data.message) || e.message || 'Ошибка';
      resultEl.className = 'promo-result err';
      resultEl.classList.remove('hidden');
      haptic('notification', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ================= PAYMENT =================
  async function buyPlan(months) {
    haptic('impact', 'medium');
    try {
      const res = await api('/api/payment-link?months=' + months);
      if (tg && tg.openLink) tg.openLink(res.url);
      else window.open(res.url, '_blank');
    } catch (e) {
      toast('Не удалось получить ссылку на оплату', 'err');
    }
  }

  // ================= REFERRAL ACTIONS =================
  async function copyRefLink() {
    const ok = await copyText(STATE.referral.link);
    haptic('notification', ok ? 'success' : 'error');
    toast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err');
  }

  function shareRefLink() {
    const url =
      'https://t.me/share/url?url=' +
      encodeURIComponent(STATE.referral.link) +
      '&text=' +
      encodeURIComponent('Присоединяйся к Relight VPN 🛡');
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }

  function openSupport() {
    const url = (STATE && STATE.support_url) || 'https://t.me/hexyplayer';
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }

  // ================= WIRE UP =================
  function wire() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('retryBtn').addEventListener('click', () => {
      document.getElementById('errorScreen').classList.add('hidden');
      document.getElementById('boot').classList.remove('hidden');
      boot();
    });

    document.getElementById('supportBtn').addEventListener('click', openSupport);
    document.getElementById('supportRow').addEventListener('click', openSupport);
    document.getElementById('extendCta').addEventListener('click', () => switchTab('plans'));

    document.getElementById('instructionToggle').addEventListener('click', () => {
      document.getElementById('instructionAccordion').classList.toggle('open');
    });

    document.getElementById('openAddDevice').addEventListener('click', openAddDeviceSheet);
    document.getElementById('cancelAddDevice').addEventListener('click', () => closeSheet('sheetOverlay'));
    document.getElementById('confirmAddDevice').addEventListener('click', confirmAddDevice);
    document.getElementById('sheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'sheetOverlay') closeSheet('sheetOverlay');
    });

    document.getElementById('devicesList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const uuid = btn.dataset.uuid;
      if (btn.dataset.act === 'key') openKeySheet(uuid);
      else if (btn.dataset.act === 'delete') deleteDevice(uuid);
      else if (btn.dataset.act === 'replace') replaceDevice(uuid);
    });

    document.getElementById('closeKeySheet').addEventListener('click', () => closeSheet('keySheetOverlay'));
    document.getElementById('keySheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'keySheetOverlay') closeSheet('keySheetOverlay');
    });
    document.getElementById('manualLinksToggle').addEventListener('click', () => {
      document.getElementById('manualLinksBody').classList.toggle('open');
      document.getElementById('manualLinksToggle').classList.toggle('open');
    });
    document.getElementById('copySubUrl').addEventListener('click', async () => {
      const ok = await copyText(currentKeyDevice.subscription_url);
      toast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err');
    });
    document.getElementById('copyVless').addEventListener('click', async () => {
      const ok = await copyText(currentKeyDevice.vless_link);
      toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
    });
    document.getElementById('copyHy2').addEventListener('click', async () => {
      const ok = await copyText(currentKeyDevice.hy2_link);
      toast(ok ? 'Скопировано' : 'Не удалось скопировать', ok ? 'ok' : 'err');
    });

    document.getElementById('confirmCancel').addEventListener('click', () => closeSheet('confirmOverlay'));
    document.getElementById('confirmOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'confirmOverlay') closeSheet('confirmOverlay');
    });
    document.getElementById('confirmOk').addEventListener('click', async () => {
      const action = pendingConfirmAction;
      pendingConfirmAction = null;
      closeSheet('confirmOverlay');
      if (action) await action();
    });

    document.getElementById('plansList').addEventListener('click', (e) => {
      const card = e.target.closest('.plan-card');
      if (!card) return;
      buyPlan(Number(card.dataset.months));
    });
    document.getElementById('promoSubmit').addEventListener('click', submitPromo);
    document.getElementById('promoInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitPromo();
    });
    document.getElementById('promoInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    document.getElementById('copyRefLink').addEventListener('click', copyRefLink);
    document.getElementById('shareRefLink').addEventListener('click', shareRefLink);
  }

  // ================= VISUAL FX (presentation only, no app logic) =================

  // Count numbers up from 0 instead of just dropping the value in.
  function animateNumber(el, target) {
    if (!el) return;
    target = Number(target);
    if (!Number.isFinite(target)) {
      el.textContent = target;
      return;
    }
    const from = 0;
    const dur = 650;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    }
    requestAnimationFrame(tick);
  }

  // Small particle burst anchored near an element, for real success moments only.
  function celebrate(anchorEl) {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const originX = r.left + r.width / 2;
    const originY = r.top + r.height / 2;
    const burst = document.createElement('div');
    burst.className = 'fx-burst';
    burst.style.left = originX + 'px';
    burst.style.top = originY + 'px';
    const colors = ['#4c7dff', '#9b6bff', '#37d9a6'];
    const count = 12;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'fx-particle';
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = 46 + Math.random() * 38;
      p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
      p.style.setProperty('--tr', Math.round(Math.random() * 240 - 120) + 'deg');
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 60 + 'ms';
      burst.appendChild(p);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1000);
  }

  // Liquid bottom-nav indicator that slides/stretches under the active tab.
  function initNavIndicator() {
    const nav = document.querySelector('.bottom-nav');
    const indicator = document.getElementById('navIndicator');
    if (!nav || !indicator) return;

    function moveTo(btn) {
      if (!btn) return;
      const navRect = nav.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const container = btn.querySelector('.nav-icon-container');
      const target = container || btn;
      const targetRect = target.getBoundingClientRect();
      indicator.style.width = targetRect.width + 'px';
      indicator.style.transform = 'translateX(' + (targetRect.left - navRect.left) + 'px)';
    }

    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (btn) requestAnimationFrame(() => moveTo(btn));
    });

    window.addEventListener('resize', () => moveTo(nav.querySelector('.nav-item.active')));

    // The nav is inside #app, which stays display:none until boot() succeeds —
    // re-measure the moment it becomes visible instead of only on click.
    const appEl = document.getElementById('app');
    if (appEl && window.MutationObserver) {
      const mo = new MutationObserver(() => {
        if (!appEl.classList.contains('hidden')) {
          requestAnimationFrame(() => moveTo(nav.querySelector('.nav-item.active')));
        }
      });
      mo.observe(appEl, { attributes: true, attributeFilter: ['class'] });
    }

    requestAnimationFrame(() => moveTo(nav.querySelector('.nav-item.active')));
  }

  // Cursor-tracked spotlight highlight on glass cards (desktop / Telegram desktop).
  function initSpotlightFX() {
    const SPOT_SELECTOR = '.tunnel-card, .plan-card, .ref-hero';
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest ? e.target.closest(SPOT_SELECTOR) : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  // Gentle magnetic pull toward the cursor for the main call-to-action buttons.
  function initMagneticButtons() {
    const SEL = '.btn-primary, .cta-pill-btn';
    const radius = 46;
    document.addEventListener('pointermove', (e) => {
      document.querySelectorAll(SEL).forEach((btn) => {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < radius) {
          const pull = (1 - dist / radius) * 7;
          btn.style.transform = `translate(${(dx / dist) * pull || 0}px, ${(dy / dist) * pull || 0}px)`;
        } else if (btn.style.transform) {
          btn.style.transform = '';
        }
      });
    }, { passive: true });
  }

  function initVisualFX() {
    try { initNavIndicator(); } catch (e) {}
    try { initSpotlightFX(); } catch (e) {}
    try { initMagneticButtons(); } catch (e) {}
  }

  // ================= INIT =================
  document.addEventListener('DOMContentLoaded', () => {
    initTelegram();
    wire();
    boot();
    initVisualFX();
  });
})();
