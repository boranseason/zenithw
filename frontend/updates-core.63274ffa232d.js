const LATEST_UPDATE=
{ver:ZW_VERSION.ver,latest:true,dateTr:ZW_VERSION.dateTr,dateEn:ZW_VERSION.dateEn,
titleTr:'indirmeler hızlandı, dosya işlemleri daha akıllı ve güvenli hale geldi',
titleEn:'faster downloads with smarter and safer file processing',
introTr:[
'v13.0 ile indirme zincirini daha hızlı, daha tutarlı ve yoğun kullanımda daha dayanıklı hale getirdik.',
'YouTube uyumluluğu güncellendi; teknik altyapı ayrıntıları kullanıcıdan uzak tutulurken toplu indirme, sessiz video, remux, dönüştürme ve dosya aktarımı baştan sona iyileştirildi.'
],
introEn:[
'v13.0 makes the download chain faster, more consistent, and more resilient under load.',
'YouTube compatibility has been refreshed while internal infrastructure details stay out of the way. Bulk downloads, mute video, remuxing, conversion, and file delivery all received practical improvements.'
],
sections:[
{hTr:'daha sağlam YouTube indirmeleri',hEn:'more reliable YouTube downloads',
pTr:'YouTube tarafındaki güncel değişikliklere uyum sağlandı. Geçici kısıtlamalarda gereksiz tekrarlar azaltıldı ve teknik hata metinleri yerine daha anlaşılır mesajlar gösteriliyor.',
pEn:'ZenithW now follows recent YouTube changes more reliably. Unnecessary retries are reduced during temporary restrictions, and technical failures are presented as clearer messages.'},
{hTr:'toplu indirme artık doğru ve daha hafif',hEn:'bulk downloads are now accurate and lighter',
pTr:'Toplu mod her bağlantı için gereksiz bilgi isteği göndermiyor; tamamlanan indirmeler doğru biçimde başarılı sayılıyor ve dosyalar doğrudan tarayıcı indirmesine aktarılıyor.',
pEn:'Bulk mode no longer performs an unnecessary information request for every link. Completed items are counted correctly and files move directly into the browser download flow.'},
{hTr:'sessiz video gerçekten yalnızca videoyu indiriyor',hEn:'mute mode downloads video only',
pTr:'Uyumlu kaynaklarda ses akışı artık boşuna indirilip sonradan sökülmüyor. Bu sayede ağ kullanımı, işlem süresi ve geçici disk ihtiyacı azalıyor.',
pEn:'On compatible sources, the audio stream is no longer downloaded only to be removed later. This reduces network use, processing time, and temporary disk demand.'},
{hTr:'gerçek remux ve akıllı dönüştürme',hEn:'real remux and smarter conversion',
pTr:'Remux aracı artık kapsayıcıyı gerçekten değiştiriyor. Uyumlu görüntü ve ses akışları kalite kaybı olmadan kopyalanıyor; yalnızca gerekli durumlarda yeniden kodlama yapılıyor.',
pEn:'The remux tool now performs a real container change. Compatible video and audio streams are copied without quality loss, with re-encoding used only when required.'},
{hTr:'kontrollü disk kullanımı ve doğal dosya aktarımı',hEn:'bounded storage and native file delivery',
pTr:'Hazırlanan dosyalar, geçici depolama ve eşzamanlı aktarımlar artık belirli sınırlar içinde tutuluyor. Büyük dosyalar tarayıcı belleğine kopyalanmadan kısa ömürlü bağlantılarla indiriliyor.',
pEn:'Prepared files, temporary storage, and simultaneous transfers now stay within defined limits. Large files download through short-lived links instead of being copied into browser memory.'},
{hTr:'daha hızlı tekrar ziyaretleri',hEn:'faster repeat visits',
pTr:'Ana uygulama kodu, güncelleme sayfası ve ortak stiller ayrı, sürümlü dosyalara taşındı. Tarayıcı değişmeyen dosyaları yeniden kullanabildiği için tekrar açılışlar daha hafif hale geliyor.',
pEn:'The main application code, updates page, and shared styles now use separate versioned assets. Browsers can reuse unchanged files, making repeat visits lighter.'}
],
outroTr:'Kısacası v13.0: daha az gereksiz işlem, daha doğru sonuçlar ve kullanıcıya görünmeden çalışan daha sağlam bir altyapı.',
outroEn:'In short, v13.0 brings less wasted work, more accurate results, and a stronger foundation that stays out of the user’s way.'
};
const UPDATE_VERSIONS=['v13.0', 'v12.9', 'v12.8', 'v12.7', 'v12.6', 'v12.5', 'v12.4', 'v12.3', 'v12.2', 'v12.1', 'v12.0', 'v11.7', 'v11.6', 'v11.5', 'v11.4', 'v11.3', 'v11.2', 'v11.1', 'v11.0', 'v10.9', 'v10.8', 'v10.7', 'v10.6', 'v10.5', 'v10.4', 'v10.3', 'v10.2', 'v10.1', 'v10.0', 'v9.0', 'v8.1', 'v8.0', 'v7.3', 'v7.2', 'v7.1', 'v7.0', 'v6.1', 'v6.0', 'v5.6', 'v5.5', 'v5.4', 'v5.3', 'v5.2', 'v5.1', 'v5.0', 'v4.0'];
let UPDATES=[LATEST_UPDATE];
let archivePromise=null;

function loadUpdateArchive(){
  if(UPDATES.length>1)return Promise.resolve(UPDATES);
  if(Array.isArray(window.ZW_UPDATE_ARCHIVE)){UPDATES=[LATEST_UPDATE,...window.ZW_UPDATE_ARCHIVE];return Promise.resolve(UPDATES);}
  if(archivePromise)return archivePromise;
  archivePromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='updates-archive.479fcc570552.js';
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
