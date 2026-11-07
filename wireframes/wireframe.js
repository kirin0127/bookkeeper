(() => {
  'use strict';
  const TODAY = '2026-11-06'; // Fixed reference date for reproducible wireframe review.
  const categories = ['食物', '飲品', '交通', '消費', '娛樂', '3C', '醫藥', '其他'];
  const glyphs = ['食', '飲', '行', '購', '樂', '3C', '醫', '其'];
  const palette = BOOKKEEPER_CATEGORY_COLORS;
  const categoryStyle = category => {
    const c=palette[category];
    return `--cat-color:${c.color};--cat-tint:${c.tint};--cat-ink:${c.ink}`;
  };
  const money = value => 'NT$ ' + value.toLocaleString('zh-TW');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
  const shiftDay = (value, step) => { const d = new Date(value+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+step); return dateKey(d); };
  const prettyDate = value => {const [y,m,d]=value.split('-').map(Number);return `${y}年${m}月${d}日`;};
  const weekday = value => ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(value+'T00:00:00Z').getUTCDay()];
  let nextId = 1;
  const records = [];
  function seed(date, category, amount, note, time='12:30') {records.push({id:nextId++, date, category, amount, note, time});}
  seed(TODAY,'食物',65,'早餐','08:15'); seed(TODAY,'交通',30,'捷運','09:10'); seed(TODAY,'食物',120,'午餐','12:20'); seed(TODAY,'飲品',35,'無糖紅茶','14:45'); seed(TODAY,'食物',180,'晚餐','18:40');
  seed('2026-11-05','食物',90,'飯糰與豆漿','08:20'); seed('2026-11-05','食物',260,'晚餐','19:10'); seed('2026-11-05','消費',399,'生活用品','20:10'); seed('2026-11-05','飲品',110,'咖啡','15:00');
  seed('2026-11-04','食物',220,'午餐聚會'); seed('2026-11-04','交通',60,'公車與捷運'); seed('2026-11-04','娛樂',320,'電影票','20:00');
  seed('2026-11-03','食物',75,'早餐'); seed('2026-11-03','醫藥',250,'門診'); seed('2026-11-02','食物',185,'晚餐','18:06'); seed('2026-11-02','食物',80,'下午茶','19:35'); seed('2026-11-02','3C',590,'充電線'); seed('2026-11-01','其他',200,'郵寄包裹');
  for(let month=1;month<=10;month++) categories.forEach((cat,i)=>seed(`2026-${pad(month)}-${pad(4+i*3)}`,cat,80+(i+1)*55+month*24,`${month}月${cat}紀錄`));
  categories.forEach((cat,i)=>seed(`2025-${pad(i+1)}-15`,cat,300+i*150,`${cat}紀錄`));
  const params = new URLSearchParams(location.search);
  const initialView = params.get('view') || 'daily';
  const state = {tab:['month','year','detail','year-detail'].includes(initialView)?'stats':'daily', day:TODAY, scale:initialView.startsWith('year')?'year':'month', year:2026, month:11, selectedCategory:null, pieCategory:null, detailCategory:'食物', sort:'amount', sortDirection:'desc', totalsDirection:'desc', calendarYear:2026, calendarMonth:11, deleteId:null};
  const transfer = {mode:initialView==='export'?'export':'import', source:'fortune', file:'', stage:'empty', range:'all', from:'2026-11-01', to:TODAY, exportPreview:false};
  if(['import','import-preview','import-done','export'].includes(initialView))state.tab='transfer';
  if(['import-preview','import-done'].includes(initialView)){transfer.file='Fortunecity-records.csv';transfer.stage=initialView==='import-done'?'done':'preview';}
  const main = document.getElementById('main');
  const addDialog = document.getElementById('add-dialog');
  const detailDialog = document.getElementById('detail-dialog');
  const calendarDialog = document.getElementById('calendar-dialog');
  const deleteDialog = document.getElementById('delete-dialog');
  const importDialog = document.getElementById('import-dialog');
  let toastTimer;
  const sum = list => list.reduce((n,r)=>n+r.amount,0);
  const periodText = () => state.scale==='month'?`${state.year}年${state.month}月`:`${state.year}年`;
  const periodRecords = () => records.filter(r=>r.date.startsWith(state.scale==='month'?`${state.year}-${pad(state.month)}`:String(state.year)));
  function row(record, fullDate=false) {
    const index=categories.indexOf(record.category);
    return `<div class="expense-row"><span class="category-icon" style="${categoryStyle(record.category)}" aria-hidden="true">${glyphs[index]}</span><div class="expense-info"><strong>${escape(record.note || record.category)}</strong><small>${record.category} · ${fullDate?record.date.replaceAll('-','/')+' ':''}${record.time}</small></div><div class="expense-actions"><strong class="expense-price">${money(record.amount)}</strong>${fullDate?'':`<button class="delete-record" type="button" data-delete="${record.id}" aria-label="刪除${escape(record.note || record.category)} ${money(record.amount)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg></button>`}</div></div>`;
  }
  function nav(label, sub, disabled=false) {return `<div class="period-nav"><button class="arrow" data-step="-1" aria-label="上一${state.tab==='daily'?'天':state.scale==='month'?'個月':'年'}">‹</button>${state.tab==='daily'?`<button class="period-label date-trigger" type="button" data-calendar aria-label="選擇日期，目前為${label}" aria-haspopup="dialog"><strong>${label} <span class="calendar-caret" aria-hidden="true">▾</span></strong><span>${sub}</span></button>`:`<div class="period-label"><strong>${label}</strong><span>${sub}</span></div>`}<button class="arrow" data-step="1" aria-label="下一${state.tab==='daily'?'天':state.scale==='month'?'個月':'年'}" ${disabled?'disabled':''}>›</button></div>`;}
  function renderDaily() {
    const list=records.filter(r=>r.date===state.day).sort((a,b)=>b.time.localeCompare(a.time)||b.id-a.id);
    const relation=state.day===TODAY?'今天':state.day===shiftDay(TODAY,-1)?'昨天':'';
    main.innerHTML=`<div class="page-heading"><h1>每日明細</h1><button class="small-button" data-today ${state.day===TODAY?'disabled':''}>回到今天</button></div>${nav(prettyDate(state.day),[relation,weekday(state.day)].filter(Boolean).join(' · '),state.day===TODAY)}<p class="swipe-hint">← 左滑前一天　右滑後一天 →</p><section class="day-summary" aria-label="當日花費摘要"><div><p class="summary-label">${relation||'當日'}花費</p><p class="summary-count">共 ${list.length} 筆</p></div><strong>${money(sum(list))}</strong></section>${list.length?`<div class="list-heading"><h3>花費明細</h3><span>時間由新到舊</span></div><div class="expense-list">${list.map(r=>row(r)).join('')}</div>`:'<div class="empty-state"><strong>這一天還沒有花費紀錄</strong><p>點下方按鈕，新增第一筆花費。</p></div>'}<div class="add-area"><button class="primary add-button" data-add><span aria-hidden="true">＋</span>新增花費</button></div>`;
  }
  function pie(totals) {
    const total=totals.reduce((n,t)=>n+t.amount,0);
    if(!total)return '<div class="empty-state"><strong>這段期間還沒有花費</strong><p>新增紀錄後，這裡會顯示分類占比。</p></div>';
    let angle=-Math.PI/2;
    const paths=totals.filter(t=>t.amount>0).map(t=>{
      const portion=t.amount/total, next=angle+portion*Math.PI*2;
      const x1=100+94*Math.cos(angle),y1=100+94*Math.sin(angle),x2=100+94*Math.cos(next),y2=100+94*Math.sin(next);
      const title=`${t.category} ${money(t.amount)}，${(portion*100).toFixed(1)}%`;
      const shape=portion===1?`<circle cx="100" cy="100" r="94" fill="${palette[t.category].color}"><title>${title}</title></circle>`:`<path d="M100 100 L${x1} ${y1} A94 94 0 ${portion>.5?1:0} 1 ${x2} ${y2} Z" fill="${palette[t.category].color}" stroke="white" stroke-width="2"><title>${title}</title></path>`;
      angle=next;
      return `<g class="pie-segment" data-pie-category="${t.category}" role="button" tabindex="0" aria-label="${title}，點選切換分類加總" aria-pressed="false">${shape}</g>`;
    });
    return `<div class="pie-wrap"><svg class="pie-chart" viewBox="0 0 200 200" role="group" aria-label="${periodText()}各類花費占比，點選色塊查看類別">${paths.join('')}</svg><div id="pie-selection" class="pie-selection" role="status">點選色塊查看類別</div></div>`;
  }
  function selectPieCategory(category) {
    state.pieCategory=state.pieCategory===category?null:category;
    updatePieSelection();
  }
  function updatePieSelection() {
    const category=state.pieCategory;
    const list=periodRecords().filter(record=>!category||record.category===category);
    const summary=document.querySelector('.stats-total');
    summary.querySelector('p').textContent=`${state.scale==='month'?'本月':'本年'}${category?category+'花費':'總花費'} · ${list.length} 筆`;
    summary.querySelector('strong').textContent=money(sum(list));
    summary.classList.toggle('has-category',Boolean(category));
    if(category)summary.style.cssText=categoryStyle(category);
    else summary.removeAttribute('style');
    document.querySelectorAll('[data-pie-category]').forEach(segment=>{
      const selected=segment.dataset.pieCategory===category;
      segment.classList.toggle('selected',selected);
      segment.setAttribute('aria-pressed',String(selected));
    });
    const label=document.getElementById('pie-selection');
    if(!label)return;
    label.classList.toggle('has-selection',Boolean(category));
    if(category){
      label.style.cssText=categoryStyle(category);
      label.innerHTML=`<span class="pie-label-dot" aria-hidden="true"></span><strong>${category}</strong><span>再點一次取消</span>`;
    }else{
      label.removeAttribute('style');
      label.textContent='點選色塊查看類別';
    }
  }
  function renderStats() {
    const list=periodRecords(),total=sum(list);
    const totals=categories.map((category,index)=>({category,index,amount:sum(list.filter(r=>r.category===category))})).sort((a,b)=>(state.totalsDirection==='desc'?b.amount-a.amount:a.amount-b.amount)||a.index-b.index);
    if(state.pieCategory&&!list.some(record=>record.category===state.pieCategory))state.pieCategory=null;
    const current=state.year===2026&&(state.scale==='year'||state.month===11);
    main.innerHTML=`<div class="page-heading"><h1>花費統計</h1><div class="segmented" aria-label="統計尺度"><button data-scale="month" class="${state.scale==='month'?'active':''}" aria-pressed="${state.scale==='month'}">月</button><button data-scale="year" class="${state.scale==='year'?'active':''}" aria-pressed="${state.scale==='year'}">年</button></div></div>${nav(periodText(),state.scale==='month'?'每月統計':'全年統計',current)}<p class="swipe-hint">← 左滑前一${state.scale==='month'?'月':'年'}　右滑後一${state.scale==='month'?'月':'年'} →</p><div class="stats-total" aria-live="polite" aria-atomic="true"><p>${state.scale==='month'?'本月':'本年'}總花費 · ${list.length} 筆</p><strong>${money(total)}</strong></div>${pie([...totals].sort((a,b)=>b.amount-a.amount))}<div class="category-heading"><div><h3>各類別加總</h3><span>點選分類查看明細</span></div><button class="small-button" type="button" data-totals-sort aria-label="分類金額${state.totalsDirection==='desc'?'由大到小，點擊改為由小到大':'由小到大，點擊改為由大到小'}">金額 ${state.totalsDirection==='desc'?'↓':'↑'}</button></div><div class="category-totals">${totals.map(t=>`<button class="category-total" style="${categoryStyle(t.category)}" data-detail="${t.category}" aria-label="${t.category} ${money(t.amount)}，查看明細"><span class="swatch" style="background:${palette[t.category].color}" aria-hidden="true"></span><span class="name">${t.category}</span><span class="value"><strong>${money(t.amount)}</strong><small>${total?(t.amount/total*100).toFixed(1):'0.0'}%</small></span><span class="chevron" aria-hidden="true">›</span></button>`).join('')}</div>`;
    updatePieSelection();
  }
  function renderTransfer() {
    const importing=transfer.mode==='import';
    main.innerHTML=`<div class="page-heading"><h1>匯入匯出</h1></div>
      <div class="transfer-tabs" role="tablist" aria-label="匯入或匯出">${['import','export'].map(mode=>`<button type="button" role="tab" id="tab-${mode}" aria-controls="transfer-panel" aria-selected="${transfer.mode===mode}" tabindex="${transfer.mode===mode?0:-1}" data-transfer-mode="${mode}">${mode==='import'?'匯入':'匯出'}</button>`).join('')}</div>
      <p class="transfer-prototype">線稿預覽 · 使用示意資料，不會讀寫資料庫或下載檔案</p>
      <section id="transfer-panel" role="tabpanel" aria-labelledby="tab-${transfer.mode}" class="transfer-panel">${importing?importContent():exportContent()}</section>`;
  }
  function importContent() {
    if(transfer.stage==='done')return `<div class="transfer-result" role="status"><span class="result-icon" aria-hidden="true">✓</span><h2>匯入完成 <small>示意</small></h2><p>已新增 18 筆花費</p><strong>${money(3269)}</strong><p class="file-name">${escape(transfer.file)}</p></div><div class="transfer-card"><h3>這批紀錄的日期</h3><p>2026/11/01 — 2026/11/06</p><p class="transfer-note">正式版匯入後，可在每日明細和統計查看。</p></div><button class="primary transfer-action" data-import-reset>繼續匯入其他檔案</button>`;
    const selected=Boolean(transfer.file),preview=transfer.stage==='preview';
    return `<ol class="transfer-steps" aria-label="匯入步驟"><li class="${preview?'':'current'}">1 選擇檔案</li><li class="${preview?'current':''}">2 預覽確認</li><li>3 完成</li></ol>
      ${preview?`<div class="selected-file-bar"><div><small>${transfer.source==='fortune'?'Fortune City':'日常記帳 CSV'}</small><strong class="file-name">${escape(transfer.file)}</strong></div><button class="small-button" data-import-back>更換</button></div>`:`<div class="transfer-card"><label class="field-label" for="import-source">檔案來源</label><select id="import-source" class="transfer-select"><option value="fortune" ${transfer.source==='fortune'?'selected':''}>Fortune City（記帳城市）</option><option value="bookkeeper" ${transfer.source==='bookkeeper'?'selected':''}>日常記帳（本 app 匯出的 CSV）</option></select>
      <div class="file-picker ${selected?'has-file':''}"><span class="file-symbol" aria-hidden="true">⇧</span><strong class="file-name">${selected?escape(transfer.file):'選擇要匯入的 CSV'}</strong><p>${selected?'檔案已選擇，可重新選取':'從手機「檔案」或電腦選取'}</p><label class="file-button" for="import-file">${selected?'重新選擇檔案':'選擇 CSV 檔案'}</label><input id="import-file" class="file-input" type="file" accept=".csv,text/csv" aria-label="選擇 CSV 檔案"></div>
      <button class="text-button" type="button" data-import-demo>使用示範檔案試操作</button><p class="transfer-note">僅匯入花費。選檔後先預覽，再確認匯入。</p><p id="import-error" class="form-error" role="alert"></p></div>`}
      ${preview?`<div class="transfer-card"><div class="transfer-card-title"><h3>匯入預覽</h3><span class="demo-badge">示意內容</span></div><div class="transfer-summary"><div><span>可匯入</span><strong>18 筆</strong></div><div><span>花費總額</span><strong>${money(3269)}</strong></div></div><p class="transfer-period">2026/11/01 — 2026/11/06</p><div class="preview-heading">前 3 筆花費</div>${records.filter(r=>r.date===TODAY).slice(0,3).map(r=>row(r,true)).join('')}<p class="transfer-note">新增紀錄，保留目前已有的花費。</p></div><div class="transfer-footer"><button class="primary transfer-action" data-import-review>匯入 18 筆花費</button></div>`:`<div class="transfer-footer"><button class="primary transfer-action" data-import-preview ${selected?'':'disabled'}>預覽匯入內容</button></div>`}`;
  }
  function exportRecords() {
    if(transfer.range==='month')return records.filter(r=>r.date.startsWith(TODAY.slice(0,7)));
    if(transfer.range==='custom')return records.filter(r=>r.date>=transfer.from&&r.date<=transfer.to);
    return records;
  }
  function exportContent() {
    const list=exportRecords(),invalid=transfer.range==='custom'&&(!transfer.from||!transfer.to||transfer.from>transfer.to);
    const dates=list.map(r=>r.date).sort();
    return `<p class="transfer-intro">將花費下載成 CSV，自己保留一份紀錄。</p><div class="transfer-card"><h3>匯出範圍</h3><div class="range-options">${[['all','全部紀錄'],['month','本月'],['custom','自訂日期']].map(([value,label])=>`<button type="button" data-export-range="${value}" aria-pressed="${transfer.range===value}" class="${transfer.range===value?'active':''}">${label}</button>`).join('')}</div>
      ${transfer.range==='custom'?`<div class="export-dates"><label for="export-from">開始日期<input id="export-from" type="date" value="${escape(transfer.from)}" max="${TODAY}"></label><label for="export-to">結束日期<input id="export-to" type="date" value="${escape(transfer.to)}" max="${TODAY}"></label></div>`:'<p class="transfer-note">'+(transfer.range==='all'?'包含目前所有花費紀錄。':'2026/11/01 — 2026/11/06')+'</p>'}</div>
      <div class="transfer-card"><div class="transfer-card-title"><h3>匯出摘要</h3><span class="demo-badge">CSV</span></div>${invalid?'<p class="form-error" role="alert">請選擇完整日期，且結束日期不得早於開始日期。</p>':`<div class="transfer-summary"><div><span>花費筆數</span><strong>${list.length} 筆</strong></div><div><span>花費總額</span><strong>${money(sum(list))}</strong></div></div><p class="transfer-period">${dates.length?dates[0].replaceAll('-','/')+' — '+dates[dates.length-1].replaceAll('-','/'):'此範圍沒有花費紀錄'}</p>`}<div class="export-format"><span>檔案格式</span><strong>日常記帳 CSV</strong></div><p class="transfer-note">包含日期、類別、金額與說明，可用試算表開啟，或再次匯入本 app。</p></div>
      <div class="transfer-footer"><button class="primary transfer-action" data-export-preview ${invalid||!list.length?'disabled':''}>匯出 CSV</button><p class="transfer-note">匯出不會刪除或更動原有紀錄。</p></div>${transfer.exportPreview?'<div class="export-result" role="status"><strong>匯出流程預覽完成</strong><p>正式版會下載 CSV 檔案。此線稿不會產生檔案。</p></div>':''}`;
  }
  function render() {
    state.tab==='transfer'?renderTransfer():state.tab==='daily'?renderDaily():renderStats();
    document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===state.tab;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
  }
  function movePeriod(step) {
    if(state.tab==='transfer')return;
    if(state.tab==='daily'){const next=shiftDay(state.day,step);if(next>TODAY)return;state.day=next;}
    else if(state.scale==='month'){const d=new Date(Date.UTC(state.year,state.month-1+step,1));if(dateKey(d).slice(0,7)>TODAY.slice(0,7))return;state.year=d.getUTCFullYear();state.month=d.getUTCMonth()+1;}
    else{if(state.year+step>2026)return;state.year+=step;}
    state.pieCategory=null;
    render(); main.scrollTop=0;
  }
  function chooseCategory(category) {
    state.selectedCategory=category;
    document.getElementById('selected-category').textContent=category;
    document.querySelector('.selected-category').style.cssText=categoryStyle(category);
    document.querySelector('.selected-category').classList.add('has-selection');
    document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('selected',b.dataset.category===category);b.setAttribute('aria-pressed',String(b.dataset.category===category));});
  }
  function openAdd() {
    document.getElementById('expense-form').reset();state.selectedCategory=null;
    document.getElementById('selected-category').textContent='尚未選擇';
    document.querySelector('.selected-category').removeAttribute('style');
    document.querySelector('.selected-category').classList.remove('has-selection');
    document.getElementById('form-error').textContent='';
    document.getElementById('add-date').textContent=`記入 ${prettyDate(state.day)}${state.day===TODAY?'（今天）':''}`;
    document.getElementById('category-options').innerHTML=categories.map((c,i)=>`<button type="button" class="category-option" style="${categoryStyle(c)}" data-category="${c}" aria-pressed="false"><span class="glyph" aria-hidden="true">${glyphs[i]}</span>${c}</button>`).join('');
    addDialog.showModal();
    document.getElementById('amount').focus({preventScroll:true});
  }
  function renderDetails() {
    const list=periodRecords().filter(r=>r.category===state.detailCategory);
    const direction=state.sortDirection==='desc'?-1:1;
    list.sort((a,b)=>direction*(state.sort==='amount'?a.amount-b.amount:`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))||b.id-a.id);
    detailDialog.style.cssText=categoryStyle(state.detailCategory);
    document.getElementById('detail-title').textContent=state.detailCategory+'明細';
    document.getElementById('detail-period').textContent=periodText()+' · '+(state.scale==='month'?'月統計':'年統計');
    document.getElementById('detail-count').textContent=`共 ${list.length} 筆花費`;
    document.getElementById('detail-total').textContent=money(sum(list));
    document.getElementById('detail-list').innerHTML=list.length?list.map(r=>row(r,true)).join(''):'<div class="empty-state"><strong>這個類別還沒有紀錄</strong></div>';
    document.getElementById('sort-description').textContent=(state.sort==='amount'?(state.sortDirection==='desc'?'金額由大到小':'金額由小到大'):(state.sortDirection==='desc'?'日期由新到舊':'日期由舊到新'))+' · 再點一次可反向排序';
    document.querySelectorAll('[data-sort]').forEach(b=>{const active=b.dataset.sort===state.sort;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.textContent=(b.dataset.sort==='amount'?'金額':'日期')+(active?(state.sortDirection==='desc'?' ↓':' ↑'):'');});
    document.getElementById('detail-list').scrollTop=0;
  }
  function notify(message) {
    clearTimeout(toastTimer);
    const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');
    toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
  }
  function renderCalendar() {
    const currentYear=Number(TODAY.slice(0,4)),currentMonth=Number(TODAY.slice(5,7));
    document.getElementById('calendar-year').innerHTML=Array.from({length:currentYear-1900+1},(_,i)=>currentYear-i).map(y=>`<option value="${y}" ${y===state.calendarYear?'selected':''}>${y}年</option>`).join('');
    document.getElementById('calendar-month').innerHTML=Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${m===state.calendarMonth?'selected':''} ${state.calendarYear===currentYear&&m>currentMonth?'disabled':''}>${m}月</option>`).join('');
    const start=new Date(Date.UTC(state.calendarYear,state.calendarMonth-1,1)).getUTCDay();
    const count=new Date(Date.UTC(state.calendarYear,state.calendarMonth,0)).getUTCDate();
    document.getElementById('calendar-days').innerHTML=Array.from({length:start},()=>'<span></span>').join('')+Array.from({length:count},(_,i)=>{
      const day=`${state.calendarYear}-${pad(state.calendarMonth)}-${pad(i+1)}`;
      return `<button type="button" data-calendar-day="${day}" class="calendar-day ${day===state.day?'selected':''} ${day===TODAY?'today':''}" aria-label="${prettyDate(day)}${day===TODAY?'，今天':''}" aria-pressed="${day===state.day}" ${day>TODAY?'disabled':''}>${i+1}</button>`;
    }).join('');
    document.querySelector('[data-calendar-step="1"]').disabled=state.calendarYear===currentYear&&state.calendarMonth===currentMonth;
    document.querySelector('[data-calendar-step="-1"]').disabled=state.calendarYear===1900&&state.calendarMonth===1;
  }
  function jumpToDay(day) {
    state.day=day;calendarDialog.close();render();main.scrollTop=0;
    main.querySelector('[data-calendar]').focus({preventScroll:true});
  }
  function openCalendar() {
    [state.calendarYear,state.calendarMonth]=state.day.split('-').map(Number);
    renderCalendar();calendarDialog.showModal();
    document.querySelector(`[data-calendar-day="${state.day}"]`).focus({preventScroll:true});
  }
  function requestDelete(id) {
    const record=records.find(r=>r.id===id);if(!record)return;
    state.deleteId=id;
    document.getElementById('delete-preview').innerHTML=row(record,true);
    deleteDialog.showModal();
  }
  document.getElementById('calendar-year').addEventListener('change',event=>{
    state.calendarYear=Number(event.target.value);
    if(state.calendarYear===Number(TODAY.slice(0,4)))state.calendarMonth=Math.min(state.calendarMonth,Number(TODAY.slice(5,7)));
    renderCalendar();
  });
  document.getElementById('calendar-month').addEventListener('change',event=>{state.calendarMonth=Number(event.target.value);renderCalendar();});
  document.addEventListener('click',event=>{
    const segment=event.target.closest('[data-pie-category]');
    if(segment){selectPieCategory(segment.dataset.pieCategory);return;}
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-transfer-mode')){transfer.mode=b.dataset.transferMode;renderTransfer();document.getElementById('tab-'+transfer.mode).focus({preventScroll:true});}
    if(b.hasAttribute('data-import-back')){transfer.stage='selected';renderTransfer();main.scrollTop=0;}
    if(b.hasAttribute('data-import-demo')){transfer.file=transfer.source==='fortune'?'Fortunecity-records.csv':'bookkeeper-records.csv';transfer.stage='selected';renderTransfer();}
    if(b.hasAttribute('data-import-preview')&&transfer.file){transfer.stage='preview';renderTransfer();main.scrollTop=0;}
    if(b.hasAttribute('data-import-review')){document.getElementById('import-confirm-file').textContent=transfer.file;importDialog.showModal();}
    if(b.hasAttribute('data-import-confirm')){importDialog.close();transfer.stage='done';renderTransfer();main.scrollTop=0;}
    if(b.hasAttribute('data-import-reset')){transfer.stage='empty';transfer.file='';renderTransfer();}
    if(b.hasAttribute('data-export-range')){transfer.range=b.dataset.exportRange;transfer.exportPreview=false;renderTransfer();}
    if(b.hasAttribute('data-export-preview')){transfer.exportPreview=true;renderTransfer();main.querySelector('.export-result').scrollIntoView({block:'nearest'});}
    if(b.hasAttribute('data-tab')){if(state.tab!==b.dataset.tab)state.pieCategory=null;state.tab=b.dataset.tab;render();main.scrollTop=0;}
    if(b.hasAttribute('data-step'))movePeriod(Number(b.dataset.step));
    if(b.hasAttribute('data-today')){state.day=TODAY;render();main.scrollTop=0;}
    if(b.hasAttribute('data-add'))openAdd();
    if(b.hasAttribute('data-calendar'))openCalendar();
    if(b.hasAttribute('data-calendar-today'))jumpToDay(TODAY);
    if(b.hasAttribute('data-calendar-day'))jumpToDay(b.dataset.calendarDay);
    if(b.hasAttribute('data-calendar-step')){
      const next=new Date(Date.UTC(state.calendarYear,state.calendarMonth-1+Number(b.dataset.calendarStep),1));
      state.calendarYear=next.getUTCFullYear();state.calendarMonth=next.getUTCMonth()+1;renderCalendar();
    }
    if(b.hasAttribute('data-delete'))requestDelete(Number(b.dataset.delete));
    if(b.hasAttribute('data-confirm-delete')){
      const index=records.findIndex(r=>r.id===state.deleteId);
      if(index!==-1){records.splice(index,1);deleteDialog.close();render();notify('已刪除這筆花費');}
      state.deleteId=null;
    }
    if(b.hasAttribute('data-totals-sort')){state.totalsDirection=state.totalsDirection==='desc'?'asc':'desc';render();}
    if(b.hasAttribute('data-category'))chooseCategory(b.dataset.category);
    if(b.hasAttribute('data-close'))b.closest('dialog').close();
    if(b.hasAttribute('data-scale')){if(state.scale!==b.dataset.scale)state.pieCategory=null;state.scale=b.dataset.scale;if(state.year===2026&&state.month>11)state.month=11;render();main.scrollTop=0;}
    if(b.hasAttribute('data-detail')){state.detailCategory=b.dataset.detail;state.sort='amount';state.sortDirection='desc';renderDetails();detailDialog.showModal();}
    if(b.hasAttribute('data-sort')){state.sortDirection=state.sort===b.dataset.sort?(state.sortDirection==='desc'?'asc':'desc'):'desc';state.sort=b.dataset.sort;renderDetails();}
  });
  main.addEventListener('keydown',event=>{
    if(event.target.matches('[data-transfer-mode]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();transfer.mode=event.key==='Home'?'import':event.key==='End'?'export':transfer.mode==='import'?'export':'import';renderTransfer();document.getElementById('tab-'+transfer.mode).focus();return;
    }
    const segment=event.target.closest('[data-pie-category]');
    if(segment&&(event.key==='Enter'||event.key===' ')){
      event.preventDefault();selectPieCategory(segment.dataset.pieCategory);
    }
  });
  main.addEventListener('change',event=>{
    if(event.target.id==='import-source'){transfer.source=event.target.value;transfer.file='';transfer.stage='empty';renderTransfer();}
    if(event.target.id==='import-file'){
      const file=event.target.files[0];if(!file)return;
      if(!/\.csv$/i.test(file.name)){transfer.file='';transfer.stage='empty';renderTransfer();document.getElementById('import-error').textContent='請選擇 CSV 檔案。';return;}
      // Wireframe only: keep the filename, never read or upload the file contents.
      transfer.file=file.name;transfer.stage='selected';renderTransfer();
    }
    if(event.target.id==='export-from'||event.target.id==='export-to'){
      transfer[event.target.id==='export-from'?'from':'to']=event.target.value;transfer.exportPreview=false;renderTransfer();
    }
  });
  document.getElementById('expense-form').addEventListener('submit',event=>{
    event.preventDefault();const raw=document.getElementById('amount').value.trim(),amount=Number(raw);
    const error=document.getElementById('form-error');
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(amount)||amount<=0){error.textContent='請輸入大於 0 的整數金額。';return;}
    if(!state.selectedCategory){error.textContent='請選擇一個花費類別。';return;}
    seed(state.day,state.selectedCategory,amount,document.getElementById('note').value.trim(),'21:00');
    addDialog.close();render();main.scrollTop=0;
    notify('已新增 '+money(amount));
  });
  let swipeStart=null;
  main.addEventListener('pointerdown',event=>{
    if(state.tab==='transfer')return;
    if(!event.isPrimary||event.button!==0||event.target.closest('button,input,textarea,select'))return;
    swipeStart={x:event.clientX,y:event.clientY,id:event.pointerId};
    // Keep a tap's click target on the SVG segment; swipes still bubble to main.
    if(!event.target.closest('[data-pie-category]'))main.setPointerCapture(event.pointerId);
  });
  main.addEventListener('pointerup',event=>{
    if(!swipeStart||swipeStart.id!==event.pointerId)return;
    const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;swipeStart=null;
    if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.6&&!document.querySelector('dialog[open]'))movePeriod(dx<0?-1:1);
  });
  main.addEventListener('pointercancel',()=>{swipeStart=null;});
  render();
  if(initialView==='add')openAdd();
  if(initialView==='calendar')openCalendar();
  if(initialView==='delete')requestDelete(records.find(r=>r.date===TODAY&&r.note==='晚餐').id);
  if(initialView==='detail'||initialView==='year-detail'){renderDetails();detailDialog.showModal();}
})();
