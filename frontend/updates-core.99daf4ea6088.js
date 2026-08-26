const LATEST_UPDATE=
{ver:ZW_VERSION.ver,latest:true,dateTr:ZW_VERSION.dateTr,dateEn:ZW_VERSION.dateEn,
titleTr:'indirme zinciri artık baştan sona doğrulanıyor',
titleEn:'the download chain is now verified end to end',
introTr:[
'v13.8, son güvenlik ve güvenilirlik turunda yaptığımız işleri tek bir sağlam sürümde topluyor. Bir dosyanın sunucuda hazırlanması artık başarı sayılmıyor; tarayıcı aktarımı gerçekten tamamlanana kadar işlem izleniyor.',
'İptal, ilerleme, geçici dosya temizliği, dönüştürme bütünlüğü, servis sağlık kontrolleri ve gizlilik açıklamaları aynı uçtan uca sözleşmeye bağlandı. Görünürde küçük, kaputun altında oldukça ciddi bir sürüm.'
],
introEn:[
'v13.8 brings the latest security and reliability work together in one solid release. A file being prepared on the server is no longer treated as success; the job stays observable until the browser transfer is actually complete.',
'Cancellation, progress, temporary-file cleanup, conversion integrity, service health checks, and privacy explanations now follow the same end-to-end contract. It looks calm on the surface, but this is a substantial release underneath.'
],
sections:[
{hTr:'gerçek aktarım onayı',hEn:'real transfer confirmation',
pTr:'Ana indirme, toplu mod ve oynatma listesi artık hazırlanmış dosyayı ayrı bir aşama olarak görüyor. Kısa ömürlü durum bağlantısı aktarılan baytları izliyor; tamamlanmayan, kesilen veya hiç başlamayan tarayıcı indirmesi başarı geçmişine yazılmıyor.',
pEn:'Main downloads, bulk mode, and playlists now treat a prepared file as a separate stage. A short-lived status link tracks transferred bytes, and a browser download that never starts, is interrupted, or does not complete is not written to successful history.'},
{hTr:'iptal ve ilerleme doğru işe bağlı',hEn:'cancellation and progress belong to the right job',
pTr:'Her ilerleme olayı değişmez iş kimliğini taşıyor; eski bir indirme yeni pencerenin yüzdesini veya hata mesajını değiştiremiyor. Aktif toplu ve oynatma listesi isteği durdurulduğunda tarayıcı bağlantısı kesiliyor, backend iptali bekleniyor ve iptal çağrıları ayrı bir güvenli kotadan geçiyor.',
pEn:'Every progress event carries its immutable job ID, so an older download cannot overwrite a newer dialog. Stopping an active bulk or playlist item aborts the browser request, waits for backend cancellation, and uses a dedicated safe cancellation quota.'},
{hTr:'dönüştürmede bütünlük, tahmin değil',hEn:'conversion integrity instead of guesswork',
pTr:'FFmpeg çıktıları artık süre veya boyut bayrağıyla sessizce kesilip tamamlandı sayılmıyor. Girdi süresi önceden ölçülüyor, ağır yeniden kodlama işleri ayrı bir süre bütçesine tabi tutuluyor ve çıktı boyutu canlı izlenerek sınır aşımında işlem güvenli biçimde sonlandırılıyor.',
pEn:'FFmpeg output is no longer silently cut by duration or size flags and then reported as complete. Input duration is measured first, CPU-heavy transcoding has its own workload budget, and output size is monitored live so an over-limit job ends safely.'},
{hTr:'daha güvenli servis sınırı',hEn:'a safer service boundary',
pTr:'Herkese açık sağlık yanıtı yalnızca servis durumunu gösteriyor. Ayrı hazır olma kontrolü medya araçlarını, disk alanını ve geçici depolama bütçesini doğruluyor; ayrıntılı operasyon bilgileri korumalı tanılama rotasında kalıyor. Railway sağlık kontrolü de bu hazır olma rotasını kullanıyor.',
pEn:'The public health response now exposes only service status. A separate readiness check validates media tools, free disk, and temporary-storage capacity, while detailed operational data stays on a protected diagnostics route. Railway health checks use that readiness route.'},
{hTr:'gizlilik ve erişilebilirlik görünür hale geldi',hEn:'privacy and accessibility made visible',
pTr:'Gizlilik sayfası veri minimizasyonu, geçici dosyalar, IP kullanımı, kaynak platformlar ve uygulanan ağ korumalarını açık başlıklarla anlatıyor. Modallar ekran okuyucular ve klavye için düzeltildi; güvenlik başlıkları geri geldi ve Socket.IO sağlayıcısı ulaşılamazsa arayüzün geri kalanı çalışmaya devam ediyor.',
pEn:'The privacy page now clearly explains data minimization, temporary files, IP use, source platforms, and network protections. Dialogs were repaired for keyboard and screen-reader use, browser security headers returned, and the rest of the interface keeps working if the Socket.IO provider is unavailable.'}
],
outroTr:'Kısacası v13.8: yalnızca indirmenin başlamasını değil, doğru dosyanın güvenli biçimde kullanıcıya ulaşmasını hedefleyen daha şeffaf ve daha ölçülü bir ZenithW.',
outroEn:'In short, v13.8 is a more transparent and disciplined ZenithW that cares not only about starting a download, but about delivering the correct file safely.'
};
const UPDATE_VERSIONS=['v13.8', 'v13.7', 'v13.6', 'v13.5', 'v13.4', 'v13.3', 'v13.2', 'v13.1', 'v13.0', 'v12.9', 'v12.8', 'v12.7', 'v12.6', 'v12.5', 'v12.4', 'v12.3', 'v12.2', 'v12.1', 'v12.0', 'v11.7', 'v11.6', 'v11.5', 'v11.4', 'v11.3', 'v11.2', 'v11.1', 'v11.0', 'v10.9', 'v10.8', 'v10.7', 'v10.6', 'v10.5', 'v10.4', 'v10.3', 'v10.2', 'v10.1', 'v10.0', 'v9.0', 'v8.1', 'v8.0', 'v7.3', 'v7.2', 'v7.1', 'v7.0', 'v6.1', 'v6.0', 'v5.6', 'v5.5', 'v5.4', 'v5.3', 'v5.2', 'v5.1', 'v5.0', 'v4.0'];
let UPDATES=[LATEST_UPDATE];
let archivePromise=null;

function loadUpdateArchive(){
  if(UPDATES.length>1)return Promise.resolve(UPDATES);
  if(Array.isArray(window.ZW_UPDATE_ARCHIVE)){UPDATES=[LATEST_UPDATE,...window.ZW_UPDATE_ARCHIVE];return Promise.resolve(UPDATES);}
  if(archivePromise)return archivePromise;
  archivePromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='updates-archive.07c744021db2.js';
    s.async=true;
    s.onload=()=>{
      if(Array.isArray(window.ZW_UPDATE_ARCHIVE)){UPDATES=[LATEST_UPDATE,...window.ZW_UPDATE_ARCHIVE];resolve(UPDATES);}
      else reject(new Error('update archive payload missing'));
    };
    s.onerror=()=>reject(new Error('update archive failed to load'));
    document.head.appendChild(s);
  }).catch(err=>{archivePromise=null;throw err;});
  return archivePromise;
}

function findIndex(ver){return UPDATES.findIndex(u=>u.ver===ver);}
async function ensureRelease(ver){
  if(!ver||ver===LATEST_UPDATE.ver||findIndex(ver)!==-1)return;
  if(UPDATE_VERSIONS.includes(ver))await loadUpdateArchive();
}

const TX={
  tr:{title:'Güncellemeler — ZenithW',desc:'ZenithW sürüm geçmişi ve güncelleme notları — yeni özellikler, hata düzeltmeleri ve iyileştirmeler.',
    back:'ana sayfa',latestLabel:'güncel',signoff:'~ ZenithW ekibi 🤍',selectLabel:'sürüm seç',newer:'yeni sürüm',older:'eski sürüm',navLabel:'Sürüm gezinmesi'},
  en:{title:'Updates — ZenithW',desc:'ZenithW release history and changelog — new features, bug fixes, and improvements.',
    back:'home',latestLabel:'latest',signoff:'~ the ZenithW team 🤍',selectLabel:'choose a release',newer:'newer',older:'older',navLabel:'Release navigation'}
}

let CUR_LANG='tr';

async function jumpTo(ver){
  try{await ensureRelease(ver);}catch(e){console.error('update archive load failed',e);return;}
  history.pushState(null,'','#'+ver);
  await render();
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('releaseArticle').scrollIntoView({block:'start',behavior:reduce?'auto':'smooth'});
}

async function render(){
  const t=TX[CUR_LANG];
  const hash=decodeURIComponent((location.hash||'').replace('#',''));
  if(hash&&hash!==LATEST_UPDATE.ver&&UPDATE_VERSIONS.includes(hash)&&findIndex(hash)===-1){
    try{await loadUpdateArchive();}catch(e){console.error('update archive load failed',e);}
  }
  let idx=findIndex(hash);
  if(idx===-1)idx=0;
  const u=UPDATES[idx];

  document.getElementById('updBadge').textContent=u.ver;
  document.getElementById('updBadge').classList.toggle('is-latest',!!u.latest);
  document.getElementById('updDate').textContent=CUR_LANG==='tr'?u.dateTr:u.dateEn;
  document.getElementById('updPostTitle').textContent=CUR_LANG==='tr'?u.titleTr:u.titleEn;
  document.getElementById('updAnma').innerHTML='';

  const intro=CUR_LANG==='tr'?u.introTr:u.introEn;
  document.getElementById('updIntro').innerHTML=intro.map(p=>`<p>${p}</p>`).join('');
  document.getElementById('updSections').innerHTML=u.sections.map(s=>`
    <div class="upd-section">
      <h3>${CUR_LANG==='tr'?s.hTr:s.hEn}</h3>
      <p>${CUR_LANG==='tr'?s.pTr:s.pEn}</p>
    </div>`).join('');
  document.getElementById('updOutro').textContent=CUR_LANG==='tr'?u.outroTr:u.outroEn;
  document.getElementById('updSignoff').textContent=t.signoff;

  const picker=document.getElementById('verPicker');
  picker.innerHTML=UPDATE_VERSIONS.map(ver=>`<option value="${ver}"${ver===u.ver?' selected':''}>${ver}${ver===LATEST_UPDATE.ver?' · '+t.latestLabel:''}</option>`).join('');

  const order=UPDATE_VERSIONS.indexOf(u.ver);
  const newer=order>0?UPDATE_VERSIONS[order-1]:null;
  const older=order>=0&&order<UPDATE_VERSIONS.length-1?UPDATE_VERSIONS[order+1]:null;
  let nav='';
  if(newer)nav+=`<button type="button" class="upd-nav-link" onclick="jumpTo('${newer}')"><span class="upd-nav-label">${t.newer}</span>← ${newer}</button>`;
  else nav+=`<span aria-hidden="true"></span>`;
  if(older)nav+=`<button type="button" class="upd-nav-link next" onclick="jumpTo('${older}')"><span class="upd-nav-label">${t.older}</span>${older} →</button>`;
  else nav+=`<span aria-hidden="true"></span>`;
  document.getElementById('updNavRow').innerHTML=nav;
  document.title=`${u.ver} — ${CUR_LANG==='tr'?u.titleTr:u.titleEn} — ZenithW`;
}

function setLegalLang(l){
  const t=TX[l]||TX.en;
  CUR_LANG=TX[l]?l:'en';
  document.documentElement.lang=CUR_LANG;
  document.getElementById('pgTitle').textContent=t.title;
  document.getElementById('pgDesc').setAttribute('content',t.desc);
  document.getElementById('pgBack').textContent=t.back;
  document.getElementById('verPicker').setAttribute('aria-label',t.selectLabel);
  document.getElementById('updNavRow').setAttribute('aria-label',t.navLabel);
  document.querySelectorAll('#legalLangToggle button').forEach(b=>b.classList.toggle('active',b.dataset.lang===CUR_LANG));
  try{localStorage.setItem('zw_lang',CUR_LANG);}catch(e){}
  render();
}

window.addEventListener('popstate',render);
window.addEventListener('hashchange',render);

(function(){
  let saved='tr';
  try{saved=localStorage.getItem('zw_lang')||'tr';}catch(e){}
  if(saved!=='tr')saved='en';
  setLegalLang(saved);
})();
