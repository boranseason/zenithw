const LATEST_UPDATE=
{ver:ZW_VERSION.ver,latest:true,dateTr:ZW_VERSION.dateTr,dateEn:ZW_VERSION.dateEn,
titleTr:'ZenithW artık Cloudflare Pages üzerinde',
titleEn:'ZenithW now runs on Cloudflare Pages',
introTr:[
'v13.1 ile web arayüzümüzü Netlify’dan Cloudflare Pages’e taşıdık. zenithw.space adresi, SSL sertifikası ve statik dosyalar artık Cloudflare üzerinden sunuluyor; Railway üzerindeki indirme ve dönüştürme sunucumuz ise aynı adresinde çalışmaya devam ediyor.',
'Bu yalnızca bir tabela değişikliği değil: alan adı, önbellek ve yayın akışı tek bir Cloudflare çatısı altında toplandı. Yine de her altyapı değişikliğinde olduğu gibi kazançların yanında bazı sınırlar ve yeni bağımlılıklar da var.'
],
introEn:[
'With v13.1, the web interface has moved from Netlify to Cloudflare Pages. zenithw.space, its SSL certificate, and static assets are now served by Cloudflare, while the download and conversion backend continues to run on Railway at the same API address.',
'This is more than a change of sign: domain routing, caching, and deployments now live under one Cloudflare roof. As with every infrastructure move, the benefits come with a few limits and new dependencies.'
],
sections:[
{hTr:'alan adı ve yayın tek yerde',hEn:'domain and deployment in one place',
pTr:'DNS zaten Cloudflare tarafından yönetiliyordu; artık web arayüzü de aynı platformda. Özel alan adı ve SSL kurulumu daha az parçaya bölünüyor, GitHub’daki ana dal güncellendiğinde Cloudflare Pages yeni sürümü otomatik hazırlıyor.',
pEn:'DNS was already managed by Cloudflare, and now the web interface lives there too. Custom-domain and SSL setup involve fewer moving parts, while updates to the main GitHub branch automatically produce a new Pages deployment.'},
{hTr:'önbellek kuralları korunuyor',hEn:'cache rules stay intact',
pTr:'Sürümlü uygulama dosyaları uzun süreli önbellekte tutuluyor; HTML ve sürüm bilgisi ise yeniden doğrulanıyor. Bu sayede değişmeyen dosyalar tekrar indirilmezken yeni sürümler ziyaretçilere eski içerik göstermeden ulaşabiliyor.',
pEn:'Versioned application assets keep their long-lived cache policy, while HTML and version metadata are revalidated. Unchanged files avoid repeat downloads without leaving visitors stuck on an old release.'},
{hTr:'frontend ve backend sınırı net',hEn:'a clear frontend and backend boundary',
pTr:'Cloudflare Pages yalnızca arayüzü sunuyor. İndirme, remux ve dönüştürme işlemleri api.zenithw.space üzerinden Railway’e gidiyor. Taşıma sırasında API adresi değişmedi ve canlı bağlantı, CORS ile SSL kontrolleri yeniden doğrulandı.',
pEn:'Cloudflare Pages serves only the interface. Downloads, remuxing, and conversion continue through api.zenithw.space on Railway. The API address did not change, and the live connection, CORS, and SSL path were rechecked after the move.'},
{hTr:'peki eksisi ne?',hEn:'so what is the downside?',
pTr:'Netlify’a özel netlify.toml artık yayını yönetmiyor; aynı ayarlar Cloudflare Pages proje yapılandırması ve _headers dosyasıyla sürdürülüyor. Cloudflare ücretsiz planı proxy üzerinden 100 MB’tan büyük yüklemeleri reddettiği için dönüştürme ve remux dosya sınırı, multipart payı bırakılarak 95 MB’a ayarlandı. Ayrıca platform kesintileri veya ileride değişebilecek kurallar bizi daha doğrudan etkileyebilir.',
pEn:'The Netlify-specific netlify.toml file no longer controls deployment; equivalent behavior now comes from the Cloudflare Pages project configuration and the _headers file. Because Cloudflare’s free plan rejects proxied uploads above 100 MB, convert and remux uploads now use a 95 MB ceiling to leave room for multipart overhead. Platform outages or future policy changes can also affect us more directly.'},
{hTr:'küçük ama önemli sağlamlaştırmalar',hEn:'small but important reliability fixes',
pTr:'Boş veya okunamayan dosyalar daha erken reddediliyor, hazırlanmış indirme gerçekten hazır olmadan ilerleme tamamlandı sayılmıyor ve dönüştürme/remux istekleri bağlantı sonsuza kadar beklerse güvenli biçimde sonlandırılıyor.',
pEn:'Empty or unreadable files are rejected earlier, progress is not marked complete until the prepared download is actually ready, and conversion or remux requests now end safely instead of waiting forever on a stalled connection.'}
],
outroTr:'Kısacası v13.1, daha sade bir yayın zinciri ve Cloudflare ile daha bütünleşik bir alan adı yönetimi getiriyor. Sihirli değnek değil; ama artısı, eksisi ve sınırları bilinen daha düzenli bir temel.',
outroEn:'In short, v13.1 brings a simpler release chain and tighter domain integration with Cloudflare. It is not a magic wand, but it is a cleaner foundation with known benefits, tradeoffs, and limits.'
};
const UPDATE_VERSIONS=['v13.1', 'v13.0', 'v12.9', 'v12.8', 'v12.7', 'v12.6', 'v12.5', 'v12.4', 'v12.3', 'v12.2', 'v12.1', 'v12.0', 'v11.7', 'v11.6', 'v11.5', 'v11.4', 'v11.3', 'v11.2', 'v11.1', 'v11.0', 'v10.9', 'v10.8', 'v10.7', 'v10.6', 'v10.5', 'v10.4', 'v10.3', 'v10.2', 'v10.1', 'v10.0', 'v9.0', 'v8.1', 'v8.0', 'v7.3', 'v7.2', 'v7.1', 'v7.0', 'v6.1', 'v6.0', 'v5.6', 'v5.5', 'v5.4', 'v5.3', 'v5.2', 'v5.1', 'v5.0', 'v4.0'];
let UPDATES=[LATEST_UPDATE];
let archivePromise=null;

function loadUpdateArchive(){
  if(UPDATES.length>1)return Promise.resolve(UPDATES);
  if(Array.isArray(window.ZW_UPDATE_ARCHIVE)){UPDATES=[LATEST_UPDATE,...window.ZW_UPDATE_ARCHIVE];return Promise.resolve(UPDATES);}
  if(archivePromise)return archivePromise;
  archivePromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='updates-archive.243ec67d3c2e.js';
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
