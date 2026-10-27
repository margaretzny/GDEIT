const {JSDOM,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(w){
 w.structuredClone=structuredClone;w.ResizeObserver=class{observe(){}};
 w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};w.confirm=()=>true;w.alert=()=>{};
}});
const w=dom.window,d=w.document;
const flush=()=>new Promise(resolve=>queueMicrotask(resolve));
const read=expression=>JSON.parse(w.eval(`JSON.stringify(${expression})`));
const model=()=>read('({state,extras:extras.layouts,groups:extras.groups,order:lineOrder,view:readView()})');
const set=(id,value)=>d.getElementById(id).value=value;
(async()=>{
 const original=model();
 w.addNode();set('f_title','测试 Task 2026 标题');set('f_date','2026-12-30');w.saveNew();await flush();
 const added=model();assert.equal(added.state.lines[0].nodes.length,original.state.lines[0].nodes.length+1);
 assert.equal(read('editHistory.undo.length'),1);
 w.undoEdit();await flush();assert.deepEqual(model(),original);
 w.redoEdit();await flush();assert.deepEqual(model(),added);
 const newId=added.state.lines[0].nodes.at(-1).id;
 w.selectNode('A',newId);set('f_title','修改后');set('f_date','2027-01-10');set('f_line','E');set('f_id','E99');w.saveCurrent();await flush();
 const changed=model();assert(changed.state.lines.find(l=>l.id==='E').nodes.some(n=>n.title==='修改后'));
 w.undoEdit();await flush();assert.deepEqual(model(),added);
 w.redoEdit();await flush();assert.deepEqual(model(),changed);
 w.selectNode('E','E99');w.duplicateCurrent();await flush();const copied=model();
 w.undoEdit();await flush();assert.deepEqual(model(),changed);w.redoEdit();await flush();assert.deepEqual(model(),copied);
 w.deleteCurrent();await flush(); // Restore clears selection, so select the duplicate explicitly.
 const duplicate=copied.state.lines.find(l=>l.id==='E').nodes.find(n=>n.title==='修改后（副本）');
 w.selectNode('E',duplicate.id);w.deleteCurrent();await flush();assert.deepEqual(model(),changed);
 w.undoEdit();await flush();assert.deepEqual(model(),copied);
 const beforeRelations=model();w.startAssociation();w.associationClick('A','A00');w.associationClick('E','E99');w.saveRelation();await flush();
 const linked=model();assert(linked.groups.length>beforeRelations.groups.length);w.undoEdit();await flush();assert.deepEqual(model(),beforeRelations);
 w.redoEdit();await flush();assert.deepEqual(model(),linked);
 w.saveLineOrder(['E','B','C','D','A']);await flush();const ordered=model();w.undoEdit();await flush();assert.deepEqual(model(),linked);w.redoEdit();await flush();assert.deepEqual(model(),ordered);
 // Layout, lane height, font and highlight form one composite saved operation.
 w.eval("extras.layouts['A:A00']={left:300,top:40,width:120,height:60,anchorX:360};extras.laneGaps.A=70;document.body.classList.add('highlighted');document.getElementById('fontRange').value=20;saveState();persistExtras();saveView();");await flush();
 const layout=model();w.undoEdit();await flush();assert.deepEqual(model(),ordered);w.redoEdit();await flush();assert.deepEqual(model(),layout);
 assert.deepEqual(JSON.parse(w.localStorage.getItem('arhk-v6-layout-relations')).layouts,layout.extras);
 // Native text editing keeps Cmd+Z; canvas shortcuts cancel the default.
 const textKey=new w.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true});d.getElementById('f_title').dispatchEvent(textKey);assert.equal(textKey.defaultPrevented,false);
 const canvasKey=new w.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});d.body.dispatchEvent(canvasKey);await flush();assert.equal(canvasKey.defaultPrevented,true);assert.deepEqual(model(),ordered);
 w.eval("state.lines[0].name='新分支';saveState()");await flush();assert.equal(read('editHistory.redo.length'),0);
 const count=read('editHistory.undo.length');w.saveState();w.persistExtras();await flush();assert.equal(read('editHistory.undo.length'),count);
 for(let i=0;i<60;i++){w.eval(`state.lines[0].name='历史${i}';saveState()`);await flush();}assert.equal(read('editHistory.undo.length'),50);
 assert.equal(d.getElementById('redoBtn').disabled,true);
 console.log('PASS undo/redo: CRUD, cross-line edits, relations, order, layout, persistence, native shortcuts, no-op, branch and 50-step cap');
 set('fontRange',10);
 const short=w.v313AutoFitCardLayout({id:'A01',title:'审批',status:'未开始'}, {id:'A',nodes:[]},{},300);
 assert.equal(short.lines.length,1);assert(short.width<110,'short cards must shrink below old minimum');
 const long='东江项目挂牌披露公示及产权交易审批事项';const lines=w.balancedTitleLines(long,100,20);assert(lines.length>2);assert.equal(lines.join(''),long);
 assert(lines.every(line=>w.v313TextWidth(line,20)<=100));
 const mixed=w.balancedTitleLines('ARHK项目2026审批Timeline',140,20);assert.equal(mixed.join(''),'ARHK项目2026审批Timeline');
 console.log('PASS tight cards: one-line short titles, balanced longer and mixed-script titles, no fixed 110px floor');
 dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
