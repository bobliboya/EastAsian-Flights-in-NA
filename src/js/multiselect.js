import { countryHeadingHTML, groupByCountry } from './display.js';

// Each widget owns its selected codes and notifies the app when they change.
export function createCatalogMultiselect(container, {
  items, placeholder, addLabel, optionHTML, tagHTML, onChange,
}) {
  const selected = new Set();
  const heading = document.getElementById(container.getAttribute('aria-labelledby'));
  const headingText = heading.textContent;
  const tags = document.createElement('div'); tags.className = 'airport-tags d-flex flex-wrap gap-1';
  const dropdown = document.createElement('div'); dropdown.className = 'dropdown';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-secondary dropdown-toggle w-100 text-start';
  toggle.dataset.bsToggle = 'dropdown';
  toggle.dataset.bsAutoClose = 'outside';
  toggle.setAttribute('aria-expanded', 'false');
  const options = document.createElement('div'); options.className = 'airport-options-list dropdown-menu accordion w-100';
  dropdown.append(toggle, options); container.append(tags, dropdown);
  const inputs = [];
  function sync() {
    tags.replaceChildren();
    selected.forEach(code => {
      const tag = document.createElement('button'); tag.type = 'button';
      tag.className = 'btn btn-outline-secondary btn-sm'; tag.innerHTML = `${tagHTML(code)} ×`;
      tag.setAttribute('aria-label', `移除 / Remove ${code}`);
      tag.onclick = () => {
        selected.delete(code);
        sync();
        onChange();
      };
      tags.append(tag);
    });
    inputs.forEach(input => { input.checked = selected.has(input.value); });
    toggle.textContent = selected.size ? addLabel : placeholder;
    heading.textContent = `${headingText} (${selected.size}/${items.length})`;
  }
  groupByCountry(items, item => item.country_or_region).forEach(([country, members]) => {
    const group = document.createElement('div'); group.className = 'accordion-item';
    group.setAttribute('role', 'group');
    const groupHeading = document.createElement('button'); groupHeading.type = 'button'; groupHeading.className = 'accordion-button collapsed';
    groupHeading.id = `${container.id}-country-${country}`;
    groupHeading.innerHTML = countryHeadingHTML(country);
    const body = document.createElement('div'); body.className = 'accordion-collapse collapse';
    body.id = `${container.id}-options-${country}`;
    groupHeading.dataset.bsToggle = 'collapse'; groupHeading.dataset.bsTarget = `#${body.id}`;
    groupHeading.setAttribute('aria-controls', body.id); groupHeading.setAttribute('aria-expanded', 'false');
    group.setAttribute('aria-labelledby', groupHeading.id); group.append(groupHeading, body); options.append(group);
    members.forEach(a => {
      const label = document.createElement('label'); label.className = 'dropdown-item d-flex align-items-center gap-2';
      const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'form-check-input flex-shrink-0'; input.value = a.iata_code;
      input.setAttribute('aria-label', `${a.iata_code} ${a.name_cn} / ${a.name_en}`);
      input.onchange = () => {
        if (input.checked) selected.add(input.value); else selected.delete(input.value);
        sync(); onChange();
      };
      const text = document.createElement('span'); text.className = 'catalog-option'; text.innerHTML = optionHTML(a);
      label.append(input, text);
      body.append(label); inputs.push(input);
    });
  });
  sync();
  return {
    get size() { return selected.size; },
    values: () => [...selected].sort(),
    has: code => selected.has(code),
    set(codes) {
      selected.clear();
      codes.forEach(code => selected.add(code));
      sync();
    },
  };
}
