// Shared input tracking prevents synthetic touch hover from consuming taps.
let inputType = 'mouse';
export function setupInputTracking() {
  inputType = window.matchMedia('(hover: hover)').matches ? 'mouse' : 'touch';
  document.addEventListener('pointerdown', event => { inputType = event.pointerType; }, true);
  document.addEventListener('pointermove', event => { inputType = event.pointerType; }, true);
  document.addEventListener('touchstart', () => { inputType = 'touch'; }, { capture: true, passive: true });
  document.addEventListener('keydown', () => { inputType = 'keyboard'; }, true);
}
export const canPreviewHover = () => inputType === 'mouse';
export const canPreviewFocus = () => inputType === 'keyboard';
export const isTouchInput = event => inputType === 'touch'
  || event.originalEvent?.pointerType === 'touch'
  || event.originalEvent?.sourceCapabilities?.firesTouchEvents;

// Bootstrap owns tooltip placement and lifecycle for dynamically rendered logos.
export function setupBrandTooltips() {
  document.body.addEventListener('show.bs.tooltip', event => {
    if (inputType === 'touch') event.preventDefault();
  });
  new bootstrap.Tooltip(document.body, {
    selector: '[data-brand-tip]',
    title() { return this.dataset.brandTip; },
    container: 'body',
    trigger: 'hover focus',
  });
}

export function setupTopbarMenu() {
  const menu = document.querySelector('#topbar-info');
  const toggle = document.querySelector('#topbar-menu-toggle');
  const collapse = bootstrap.Collapse.getOrCreateInstance(menu, { toggle: false });
  document.addEventListener('click', event => {
    if (!event.target.closest('.topbar')) collapse.hide();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.classList.contains('show')) {
      collapse.hide(); toggle.focus();
    }
  });
  matchMedia('(max-width: 799px)').addEventListener('change', () => collapse.hide());
}

// Compose Bootstrap Card, List group and Close button for both map selectors.
// Leaflet/app retain ownership of anchoring, hover lifetime and map selection.
export function createMapChoiceCard(container, label, onClose) {
  container.classList.add('card', 'map-choice-panel');
  const heading = document.createElement('div');
  heading.className = 'card-header map-choice-heading d-flex align-items-start gap-2';
  const title = document.createElement('span'); title.className = 'flex-grow-1';
  const close = document.createElement('button'); close.type = 'button';
  close.className = 'btn-close flex-shrink-0';
  close.setAttribute('aria-label', '关闭 / Close'); close.onclick = onClose;
  heading.append(title, close);
  const body = document.createElement('div');
  body.className = 'card-body list-group map-choice-body';
  body.tabIndex = 0; body.setAttribute('aria-label', label);
  container.replaceChildren(heading, body);
  return { title, body };
}
