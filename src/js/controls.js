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

// A single shared tooltip avoids clipping inside scrollable dropdowns.
export function setupBrandTooltips() {
  const brandTooltip = document.createElement('div');
  brandTooltip.className = 'brand-tooltip';
  brandTooltip.id = 'brand-tooltip';
  brandTooltip.setAttribute('role', 'tooltip');
  brandTooltip.hidden = true;
  document.body.append(brandTooltip);
  let activeBrand;
  function hideBrandTooltip() {
    activeBrand?.removeAttribute('aria-describedby');
    activeBrand = null;
    brandTooltip.hidden = true;
  }
  function showBrandTooltip(mark) {
    hideBrandTooltip();
    activeBrand = mark;
    brandTooltip.textContent = mark.dataset.brandTip;
    brandTooltip.hidden = false;
    mark.setAttribute('aria-describedby', brandTooltip.id);
    const rect = mark.getBoundingClientRect(), box = brandTooltip.getBoundingClientRect();
    brandTooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - box.width - 8))}px`;
    brandTooltip.style.top = `${rect.top >= box.height + 14 ? rect.top - box.height - 6 : rect.bottom + 6}px`;
  }
  document.addEventListener('mouseover', event => {
    if (!canPreviewHover()) return;
    const mark = event.target.closest('[data-brand-tip]');
    if (mark && mark !== activeBrand) showBrandTooltip(mark);
  });
  document.addEventListener('mouseout', event => {
    if (activeBrand && !activeBrand.contains(event.relatedTarget)) hideBrandTooltip();
  });
  document.addEventListener('focusin', event => {
    if (!canPreviewFocus()) return;
    const mark = event.target.closest('[data-brand-tip]');
    if (mark) showBrandTooltip(mark);
  });
  document.addEventListener('focusout', hideBrandTooltip);
  document.addEventListener('scroll', hideBrandTooltip, true);
  window.addEventListener('resize', hideBrandTooltip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideBrandTooltip(); });
}

export function setupTopbarMenu() {
  const header = document.querySelector('.topbar');
  const toggle = document.querySelector('#topbar-menu-toggle');
  const mobile = matchMedia('(max-width: 799px)');
  function setOpen(open) {
    header.dataset.menuOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭顶栏菜单 / Close menu' : '打开顶栏菜单 / Open menu');
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', event => { if (!header.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
  });
  header.addEventListener('focusout', event => { if (!header.contains(event.relatedTarget)) setOpen(false); });
  mobile.addEventListener('change', () => setOpen(false));
}
