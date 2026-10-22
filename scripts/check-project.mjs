// Run from any working directory: node /path/to/repository/scripts/check-project.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// Check every JS entry point, including browser modules that require DOM globals at runtime.
for (const folder of ['src/js', 'scripts']) {
  for (const name of fs.readdirSync(path.join(root, folder))) {
    if (!/\.m?js$/.test(name)) continue;
    run(process.execPath, ['--check', `${folder}/${name}`]);
    const source = fs.readFileSync(path.join(root, folder, name), 'utf8');
    for (const [, ref] of source.matchAll(/(?:from\s+|import\s*)['"]([.][^'"]+)['"]/g)) {
      assert(fs.existsSync(path.resolve(root, folder, ref)), `Missing module import in ${name}: ${ref}`);
    }
  }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(html.includes('type="module" src="src/js/app.js"'), 'The browser entry point must load ES modules');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^https?:/.test(ref)) assert(fs.existsSync(path.join(root, ref)), `Missing HTML dependency: ${ref}`);
}
for (const name of fs.readdirSync(path.join(root, 'src/css'))) {
  if (!name.endsWith('.css')) continue;
  const css = fs.readFileSync(path.join(root, 'src/css', name), 'utf8');
  for (const [, ref] of css.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/g)) {
    if (!/^https?:/.test(ref)) assert(fs.existsSync(path.resolve(root, 'src/css', ref)), `Missing CSS import: ${ref}`);
  }
}

// Documentation links must remain valid after moving code and reference material.
for (const file of ['README.md', 'docs/DEVELOPMENT.md', 'admin/README.md',
  'scripts/README.md', 'src/css/README.md', 'src/data/CATALOG.md', 'reference/README.md', 'THIRD_PARTY_NOTICES.md']) {
  const markdown = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [, ref] of markdown.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(ref)) continue;
    assert(fs.existsSync(path.resolve(root, path.dirname(file), ref.split('#')[0])), `Broken documentation link in ${file}: ${ref}`);
  }
}

// Check syntax without creating __pycache__ directories or running network code.
const python = process.env.PYTHON || 'python';
run(python, ['-c', 'import ast,pathlib; [ast.parse(p.read_text(encoding="utf-8"),filename=str(p)) for p in pathlib.Path("scripts").glob("*.py")]']);
run(process.execPath, ['scripts/validate-data.mjs']);
run(process.execPath, ['scripts/test-round-trip-audit.mjs']);
run(process.execPath, ['scripts/test-weekly-display.mjs']);
run(python, ['scripts/test-manage-data.py']);
run(python, ['scripts/manage-data.py', 'check']);
run(python, ['-c', [
  'import importlib.util,json,pathlib',
  'spec=importlib.util.spec_from_file_location("manage_data","scripts/manage-data.py")',
  'module=importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(module)',
  'output=module.build()',
  'assert all(value==json.loads((pathlib.Path("src/data")/name).read_text(encoding="utf-8")) for name,value in output.items()), "Generated JSON is out of date. Run python scripts/manage-data.py apply"',
].join(';')]);
console.log('PASS: project checks complete. No website files were generated or published.');
