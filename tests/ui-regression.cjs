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

  await test('detailed note tooltip opens after exactly one second at double font size',(w,dom)=>{
    const card=w.document.querySelector('.timeline-task-card[data-line="C"][data-id="C01"]');
    assert.equal(card.hasAttribute('title'),false);
    card.dispatchEvent(new w.MouseEvent('mouseenter',{bubbles:true}));
    const timer=dom.timers.find(t=>t.delay===1000);
    assert(timer,'one-second tooltip timer was not scheduled');
    timer.fn();
    const tooltip=w.document.querySelector('.node-note-tooltip');
    assert.equal(tooltip.textContent,'已召开董事会');
    assert.equal(tooltip.style.fontSize,'28px');
    assert.equal(tooltip.hidden,false);
  });

  process.exitCode=failures?1:0;
})();
