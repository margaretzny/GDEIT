const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `missing production function ${name}`);
  const signatureEnd = source.indexOf('){', start);
  assert.notStrictEqual(signatureEnd, -1, `missing function body ${name}`);
  const brace = signatureEnd + 1;
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated production function ${name}`);
}

function load(names, additions = {}) {
  const context = { structuredClone, Set, Map, Date, console, ...additions };
  vm.createContext(context);
  vm.runInContext(names.map(extractFunction).join('\n'), context);
  return context;
}

function fixture() {
  return {
    lines: [
      { id: 'A', name: 'A', nodes: [], pending: [] },
      { id: 'B', name: 'B', nodes: [], pending: [] },
      { id: 'C', name: 'C', nodes: [], pending: [] },
      { id: 'D', name: 'D', nodes: [
        { id: 'D11', title: '电子集团审议评估结果', date: '2026-11-17', status: '未开始', color: '#123456' },
        { id: 'D12', title: '广晟集团完成欧晟揭阳评估结果备案审批', date: '2026-12-25', status: '未开始', note: '保留备注' },
        { id: 'D13', title: '其他D线任务', date: '2027-01-05', status: '未开始' },
      ], pending: [] },
      { id: 'E', name: 'E', nodes: [
        { id: 'E01', title: '先前E线任务', date: '2026-10-30', status: '已完成' },
        { id: 'E04', title: '【东江】开始挂牌披露公示（公示时间需在与汇丰签署和解协议后）', date: '2026-11-16', status: '未开始' },
        { id: 'E05', title: '【东江】产权交易竞价（可在公示期间同步做）', date: '2026-11-27', status: '未开始' },
        { id: 'E06', title: '【东江】挂牌公示结束', date: '2026-12-11', status: '未开始' },
        { id: 'E07', title: '【东江/绿动/电子】签署产权交易合同', date: '2026-12-25', status: '未开始' },
        { id: 'E08', title: '【东江】交易结果公告', date: '2027-01-01', status: '未开始' },
      ], pending: [] },
    ],
  };
}

const api = load([
  'v313IsoDate',
  'isV313WorkingDay',
  'addV313WorkingDays',
  'v313TitleIncludes',
  'remapV313Extras',
  'renumberV313Line',
  'applyV313BusinessMigration',
]);

assert.strictEqual(api.addV313WorkingDays('2026-12-25', 1), '2026-12-28');
let date = '2026-12-28';
for (const [gap, expected] of [[9, '2027-01-11'], [10, '2027-01-25'], [10, '2027-02-10'], [4, '2027-02-16']]) {
  date = api.addV313WorkingDays(date, gap);
  assert.strictEqual(date, expected);
}

const state = fixture();
const extras = {
  layouts: { 'D:D12': { left: 1, top: 2, width: 156 } },
  groups: [['D:D12', 'E:E07']],
  suppressedSameDate: ['D:D12|E:E07'],
};
const beforeCount = state.lines.flatMap((line) => [...line.nodes, ...(line.pending || [])]).length;
assert.strictEqual(api.applyV313BusinessMigration(state, extras), true);
assert.strictEqual(state.lines.length, 5);
assert.strictEqual(state.lines.flatMap((line) => [...line.nodes, ...(line.pending || [])]).length, beforeCount);
assert.strictEqual(state.lines.find((line) => line.id === 'D').nodes.some((node) => node.title.includes('广晟集团完成欧晟揭阳')), false);

const e = state.lines.find((line) => line.id === 'E');
const expected = [
  ['广晟集团完成欧晟揭阳评估结果备案审批', '2026-12-25'],
  ['开始挂牌披露公示', '2026-12-28'],
  ['产权交易竞价', '2027-01-11'],
  ['挂牌公示结束', '2027-01-25'],
  ['签署产权交易合同', '2027-02-10'],
  ['交易结果公告', '2027-02-16'],
];
for (const [title, expectedDate] of expected) {
  const node = e.nodes.find((item) => item.title.includes(title));
  assert(node, `missing migrated E node ${title}`);
  assert.strictEqual(node.date, expectedDate);
}
assert(e.nodes.find((node) => node.title.includes('广晟集团完成欧晟揭阳')).note.includes('保留备注'));
assert(e.nodes.find((node) => node.title.includes('签署产权交易合同')).note.includes('暂定'));

for (const line of [state.lines.find((item) => item.id === 'D'), e]) {
  const keys = [...line.nodes, ...(line.pending || [])].map((node) => node.id);
  assert.strictEqual(new Set(keys).size, keys.length, `${line.id} IDs must be unique`);
  keys.forEach((id) => assert(id.startsWith(line.id), `${id} must match ${line.id}`));
}
assert(!extras.layouts['D:D12']);
assert(Object.keys(extras.layouts).some((key) => key.startsWith('E:')));
assert(extras.groups.flat().every((key) => state.lines.some((line) => [...line.nodes, ...(line.pending || [])].some((node) => `${line.id}:${node.id}` === key))));

const snapshot = JSON.stringify({ state, extras });
assert.strictEqual(api.applyV313BusinessMigration(state, extras), false);
assert.strictEqual(JSON.stringify({ state, extras }), snapshot, 'migration must be idempotent');

const missingMiddle = fixture();
missingMiddle.lines.find((line) => line.id === 'E').nodes = missingMiddle.lines.find((line) => line.id === 'E').nodes.filter((node) => !node.title.includes('产权交易竞价'));
api.applyV313BusinessMigration(missingMiddle, {});
assert.strictEqual(missingMiddle.lines.find((line) => line.id === 'E').nodes.find((node) => node.title.includes('挂牌公示结束')).date, '2027-01-25', 'a missing middle task must not shift later fixed milestones');

console.log('v3.13 business migration regression: PASS');

const tooltipApi = load(['noteTooltipFontPx'], {
  getComputedStyle(element) { return { fontSize: element.fontSize }; },
});
const titleElement = { fontSize: '18px' };
const fakeCard = { querySelector(selector) { return selector === '.task-name' ? titleElement : null; }, fontSize: '11px' };
assert.strictEqual(tooltipApi.noteTooltipFontPx(fakeCard), 18);
const interactionSource = extractFunction('initCardInteraction');
assert(interactionSource.indexOf('hideNoteTooltip()') < interactionSource.indexOf("const corner="), 'pointerdown must hide the note before drag/resize setup');
console.log('v3.13 tooltip interaction regression: PASS');

const wrapApi = load(['v313TextWidth', 'balancedTitleLines', 'v313AvailableCardWidth']);
const shortLines = wrapApi.balancedTitleLines('挂牌公示结束', 300, 14);
assert.strictEqual(shortLines.length, 2, 'auto-fit titles default to two balanced lines');
assert.strictEqual(shortLines.join(''), '挂牌公示结束');
assert(Math.abs(shortLines[0].length - shortLines[1].length) <= 1);
const longTitle = '【东江】开始挂牌披露公示（公示时间需在与汇丰签署和解协议后）';
const narrowLines = wrapApi.balancedTitleLines(longTitle, 86, 16);
assert(narrowLines.length > 2, 'narrow cards must add lines');
assert.strictEqual(narrowLines.join(''), longTitle);
assert(narrowLines.every((line) => wrapApi.v313TextWidth(line, 16) <= 86.01));
const line = { nodes: [
  { id: 'E01', date: '2026-12-25' },
  { id: 'E02', date: '2026-12-28' },
  { id: 'E03', date: '2027-01-11' },
] };
const xmap = { '2026-12-25': 100, '2026-12-28': 230, '2027-01-11': 520 };
assert.strictEqual(wrapApi.v313AvailableCardWidth(line, line.nodes[1], xmap, 420), 114);
assert.strictEqual(wrapApi.v313AvailableCardWidth(line, line.nodes[2], xmap, 420), 274);
console.log('v3.13 balanced auto-fit regression: PASS');

const importApi = load([
  'v313IsoDate',
  'isV313WorkingDay',
  'addV313WorkingDays',
  'v313TitleIncludes',
  'remapV313Extras',
  'renumberV313Line',
  'applyV313BusinessMigration',
  'migrateImportedV313Payload',
]);
const importedBusiness = fixture();
const importedExtras = { layouts: {}, groups: [], suppressedSameDate: [] };
importApi.migrateImportedV313Payload(importedBusiness, importedExtras);
assert.strictEqual(importedBusiness.lines.find((line) => line.id === 'D').nodes.some((node) => node.title.includes('广晟集团完成欧晟揭阳')), false);
assert.strictEqual(importedExtras.businessMigrationVersion, 313);
console.log('v3.13 import migration regression: PASS');
