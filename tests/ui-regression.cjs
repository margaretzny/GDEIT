const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

function makeDom(){
  const timers=[];
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',beforeParse(w){
    w.structuredClone=structuredClone;
    w.ResizeObserver=class{observe(){}};
    w.requestAnimationFrame=()=>1;
    w.cancelAnimationFrame=()=>{};
    w.confirm=()=>true;
    w.alert=()=>{};
    w.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};
    w.clearTimeout=()=>{};
  }});
  dom.timers=timers;
  return dom;
}

let failures=0;
async function test(name,run){
  const dom=makeDom();
  try{await run(dom.window,dom);console.log('PASS',name);}
  catch(error){failures++;console.log('FAIL',name,error.message);}
  finally{dom.window.close();}
}

(async()=>{
  await test('line selector follows visible A-E order and node IDs use visible letters',(w)=>{
    const options=[...w.document.querySelectorAll('#f_line option')].map(o=>[o.textContent,o.value]);
    assert.deepEqual(options,[['A线','A'],['B线','C'],['C线','D'],['D线','B'],['E线','E']]);
    w.selectNode('C','C01');
    assert.equal(w.document.getElementById('f_line').value,'C');
    assert.equal(w.document.getElementById('f_id').value,'B01');
    assert.match(w.document.querySelector('.timeline-task-card[data-line="C"][data-id="C01"] .task-meta').textContent,/^B01 ·/);
  });

  await test('changing the visible line updates the ID and new save clears the editor',(w)=>{
    w.addNode();
    const line=w.document.getElementById('f_line');
    line.value='D';
    line.dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.match(w.document.getElementById('f_id').value,/^C/);
    w.document.getElementById('f_id').value='C99';
    w.document.getElementById('f_title').value='测试节点';
    w.document.getElementById('f_date').value='2026-12-31';
    w.saveNew();
    assert(w.eval("state.lines.find(l=>l.id==='D').nodes.some(n=>n.id==='D99')"));
    assert.equal(w.eval('selected'),null);
    assert.equal(w.document.getElementById('editor').style.display,'none');
    for(const id of ['f_id','f_title','f_date','f_note','f_note_short'])assert.equal(w.document.getElementById(id).value,'');
  });

  await test('one-click adaptive layout is the final page setting',(w)=>{
    assert.equal(w.document.getElementById('pageMenu').lastElementChild.id,'autoFitBtn');
  });

  await test('detailed note tooltip opens after exactly one second at the card font size',(w,dom)=>{
    const card=w.document.querySelector('.timeline-task-card[data-line="C"][data-id="C01"]');
    assert.equal(card.hasAttribute('title'),false);
    card.dispatchEvent(new w.MouseEvent('mouseenter',{bubbles:true}));
    const timer=dom.timers.find(t=>t.delay===1000);
    assert(timer,'one-second tooltip timer was not scheduled');
    timer.fn();
    const tooltip=w.document.querySelector('.node-note-tooltip');
    assert.equal(tooltip.textContent,'已召开董事会');
    assert.equal(tooltip.style.fontSize,w.noteTooltipFontPx(card)+'px');
    assert.equal(tooltip.hidden,false);
  });

  await test('same-date auto relations can be removed per selected pair and restored',(w)=>{
    const sameDateId=w.eval("state.lines.find(l=>l.id==='D').nodes.find(n=>n.date==='2026-10-30').id");
    const relationKey=['A:A00',`D:${sameDateId}`].sort().join('|');
    w.drawCrossLines();
    const before=w.document.querySelectorAll('#crossSvg .cross-relation:not(.explicit-edge)').length;
    assert(before>=3);
    w.startAssociation();
    w.associationClick('A','A00');
    w.associationClick('D',sameDateId);
    w.removeRelation();
    w.drawCrossLines();
    assert(w.eval(`extras.suppressedSameDate.includes('${relationKey}')`));
    const imported=w.validateBackup(JSON.parse(w.eval("JSON.stringify({lines:state.lines,extras:{layouts:{},groups:[],suppressedSameDate:extras.suppressedSameDate}})")));
    assert(imported.suppressedSameDate.includes(relationKey));
    assert.equal(w.document.querySelector('.timeline-task-card[data-line="A"][data-id="A00"]').classList.contains('related-card'),false);
    assert.equal(w.document.querySelectorAll('#crossSvg .cross-relation:not(.explicit-edge)').length,before-1);
    w.startAssociation();
    w.associationClick('A','A00');
    w.associationClick('D',sameDateId);
    w.saveRelation();
    w.drawCrossLines();
    assert.equal(w.eval(`extras.suppressedSameDate.includes('${relationKey}')`),false);
    assert.equal(w.document.querySelectorAll('#crossSvg .cross-relation:not(.explicit-edge)').length,before);
  });

  await test('export legend layout fits at the largest available size',(w)=>{
    const layout=w.exportLegendLayout({width:3508,right:3508-94,minLeft:1850,maxFont:44});
    assert.deepEqual(Array.from(layout.items, item=>item.label),['已完成','进行中','未开始','待确认／日期待定','必须完成','暂停']);
    assert.equal(layout.items.length,6);
    assert(layout.fontPx>12 && layout.fontPx<=44);
    assert(layout.left>=1850);
    assert(layout.items.at(-1).right<=3508-94);
    for(let i=1;i<layout.items.length;i++)assert(layout.items[i].left>=layout.items[i-1].right);
  });

  process.exitCode=failures?1:0;
})();
