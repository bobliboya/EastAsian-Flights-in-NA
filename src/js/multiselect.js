import { chevronHTML, countryHeadingHTML, escapeHTML, groupByCountry } from './display.js';

// Each widget owns its selected codes and notifies the app when they change.
export function createCatalogMultiselect(container, {
  items, placeholder, addLabel, optionHTML, tagHTML, onChange,
}) {
  const selected = new Set();
  const heading = document.getElementById(container.getAttribute('aria-labelledby'));
  const headingText = heading.textContent;
  const tags = document.createElement('div'); tags.className = 'airport-tags';
  const dropdown = document.createElement('details'); dropdown.className = 'airport-options';
  const summary = document.createElement('summary');
  const options = document.createElement('div'); options.className = 'airport-options-list';
  dropdown.append(summary, options); container.append(tags, dropdown);
  const inputs = [];
  function sync() {
    tags.replaceChildren();
    selected.forEach(code => {
      const tag = document.createElement('button'); tag.type = 'button';
      tag.className = 'airport-tag'; tag.innerHTML = `${tagHTML(code)} ×`;
      tag.setAttribute('aria-label', `移除 / Remove ${code}`);
      tag.onclick = () => {
        selected.delete(code);
        sync();
        onChange();
      };
      tags.append(tag);
    });
    inputs.forEach(input => { input.checked = selected.has(input.value); });
    summary.innerHTML = `<span>${escapeHTML(selected.size ? addLabel : placeholder)}</span>${chevronHTML}`;
    heading.textContent = `${headingText} (${selected.size}/${items.length})`;
  }
  groupByCountry(items, item => item.country_or_region).forEach(([country, members]) => {
    const group = document.createElement('details'); group.className = 'catalog-country-group';
    group.setAttribute('role', 'group');
    const groupHeading = document.createElement('summary'); groupHeading.className = 'country-group-heading';
    groupHeading.id = `${container.id}-country-${country}`;
    groupHeading.innerHTML = `${countryHeadingHTML(country)}${chevronHTML.replace('filter-chevron', 'country-chevron')}`;
    group.setAttribute('aria-labelledby', groupHeading.id); group.append(groupHeading); options.append(group);
    members.forEach(a => {
      const label = document.createElement('label');
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = a.iata_code;
      input.setAttribute('aria-label', `${a.iata_code} ${a.name_cn} / ${a.name_en}`);
      input.onchange = () => {
        if (input.checked) selected.add(input.value); else selected.delete(input.value);
        sync(); onChange();
      };
      const text = document.createElement('span'); text.className = 'catalog-option'; text.innerHTML = optionHTML(a);
      label.append(input, text);
      group.append(label); inputs.push(input);
    });
  });
  sync();
  document.addEventListener('click', event => { if (!container.contains(event.target)) dropdown.open = false; });
  container.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    dropdown.open = false;
    summary.focus();
  });
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
