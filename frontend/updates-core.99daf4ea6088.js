const LATEST_UPDATE=
{ver:ZW_VERSION.ver,latest:true,dateTr:ZW_VERSION.dateTr,dateEn:ZW_VERSION.dateEn,cover:'zenithw.png',coverAltTr:'ZenithW v14 kapak görseli',coverAltEn:'ZenithW v14 cover image',
titleTr:'Fanta molasında başlayan yeni bir ZenithW',
titleEn:'a new ZenithW that started over a Fanta break',
introTr:[
'Bu akşam Fanta içerken siteye bir baktım; açık konuşayım, tasarım içime sinmedi. “Bunu böyle bırakamam” deyip kolları sıvadım. v14.0, ZenithW’nin daha samimi, daha düzenli ve kendi havası olan yeni yüzü.',
'İndirme motorunun çalışan tarafına dokunmadan, kullanıcıyla karşılaşan neredeyse her köşeyi yeniden ele aldım. Daha sıcak bir karşılama, daha temiz sayfalar ve nerede olduğunu kaybettirmeyen ortak bir navigasyon geldi. — sayın boranseason'
],
introEn:[
'This evening, while drinking a Fanta, I took another look at the site and—honestly—the design no longer felt right. I said “I can’t leave it like this” and got to work. v14.0 is a warmer, tidier ZenithW with a character of its own.',
'The working download engine stays intact, while nearly every user-facing corner has been reconsidered: a friendlier welcome, cleaner pages, and shared navigation that always shows the way home. — boranseason'
],
sections:[
{hTr:'110 cümlelik küçük bir selam evreni',hEn:'a small universe of time-aware greetings',pTr:'Ana sayfadaki soğuk marka başlığı yerini yeniden girişte değişen 110 Türkçe mesaja bıraktı. Sabah, öğlen, akşam, gece ve özellikle 02.00–05.00 aralığı kendi destesinden konuşuyor; common, rare, epic ve legendary olasılıkları arasında bazen uyku tavsiyesi, bazen de kısa bir doğa veya uzay bilgisi düşüyor. Diğer arayüz dillerinin de kendi saatlik selamları var.',pEn:'The cold brand heading now gives way to a changing deck of 110 Turkish messages, with separate morning, afternoon, evening, late-night, and 2–5 a.m. moods. Common, rare, epic, and legendary rolls can bring a sleep reminder or a tiny nature and space fact, while the other interface languages keep their own time-aware greetings.'},
{hTr:'araçlar artık kendi odasında',hEn:'every tool has its own room',pTr:'Ayarlar, geçmiş, dönüştürme, remux ve destek alanları ana sayfayı dolduran modal yığınından çıkarılıp kendi sayfalarına taşındı. Ayarlar masaüstünde geniş bir kategori ve içerik düzenine kavuştu; desteklenen servisler ise bağlantı kutusunun üstünde küçük bir panel olarak ana sayfada kaldı.',pEn:'Settings, history, conversion, remuxing, and support moved out of the home page’s modal pile into dedicated pages. Desktop settings now use a wide category-and-content layout, while supported services stay on the home page as a compact panel above the link field.'},
{hTr:'masaüstünde sol ray, mobilde alt bar',hEn:'left rail on desktop, bottom bar on mobile',pTr:'Ortak navigasyon masaüstünde ekran boyunca uzanan sol raya dönüştü. Mobilde erişilebilir alt bar korunuyor; hangi sayfaya gidilirse gidilsin ana sayfanın yolu kaybolmuyor.',pEn:'Shared navigation becomes a full-height left rail on desktop while keeping the reachable bottom bar on mobile. No matter which page is open, the way home remains visible.'},
{hTr:'düz siyah yerine sakin bir atmosfer',hEn:'a calmer atmosphere than plain black',pTr:'Hareketli parçacık veya ağır efekt eklemeden kömür siyahı, hafif mavi ve belli belirsiz mor tonlarla arka plana derinlik verildi. Güncellemeler sayfası da Hakkında sayfasının ferah, gridli ve tek kartlı görsel diline kavuştu.',pEn:'Without animated particles or heavy effects, charcoal black, a soft blue glow, and a trace of purple add depth. The Updates page now shares the spacious grid-and-glass language of the About page.'},
{hTr:'küçük ama karakterli dokunuşlar',hEn:'small touches with more character',pTr:'Güncellemeler simgesi parıltılı bir değneğe dönüştü, destek alanından Papara kaldırıldı ve sayfalar arasında aynı tipografi, boşluk ve kontrol dili kullanılmaya başlandı.',pEn:'The Updates icon is now a sparkling wand, Papara has been removed from support, and typography, spacing, and controls now speak the same language across the site.'}
],
outroTr:'Kısacası v14.0, çalışan sistemi süslemekten çok ZenithW’yi daha anlaşılır, daha samimi ve kullanırken daha huzurlu hale getiren bir akşam yenilemesi. Fanta bitti; içime sinen tasarım kaldı.',
outroEn:'In short, v14.0 is less about decorating a working system and more about making ZenithW clearer, warmer, and calmer to use. The Fanta is gone; the design that finally feels right remains.'
};
const UPDATE_VERSIONS=['v14.0', 'v13.8', 'v13.7', 'v13.6', 'v13.5', 'v13.4', 'v13.3', 'v13.2', 'v13.1', 'v13.0', 'v12.9', 'v12.8', 'v12.7', 'v12.6', 'v12.5', 'v12.4', 'v12.3', 'v12.2', 'v12.1', 'v12.0', 'v11.7', 'v11.6', 'v11.5', 'v11.4', 'v11.3', 'v11.2', 'v11.1', 'v11.0', 'v10.9', 'v10.8', 'v10.7', 'v10.6', 'v10.5', 'v10.4', 'v10.3', 'v10.2', 'v10.1', 'v10.0', 'v9.0', 'v8.1', 'v8.0', 'v7.3', 'v7.2', 'v7.1', 'v7.0', 'v6.1', 'v6.0', 'v5.6', 'v5.5', 'v5.4', 'v5.3', 'v5.2', 'v5.1', 'v5.0', 'v4.0'];
let UPDATES=[LATEST_UPDATE];
let archivePromise=null;

function loadUpdateArchive(){
  if(UPDATES.length>1)return Promise.resolve(UPDATES);
  if(Array.isArray(window.ZW_UPDATE_ARCHIVE)){UPDATES=[LATEST_UPDATE,...window.ZW_UPDATE_ARCHIVE];return Promise.resolve(UPDATES);}
  if(archivePromise)return archivePromise;
  archivePromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='updates-archive.07c744021db2.js?v=14.0';
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
  const cover=document.getElementById('updCover'),coverImg=document.getElementById('updCoverImg');
  if(u.cover){cover.hidden=false;coverImg.src=u.cover;coverImg.alt=CUR_LANG==='tr'?(u.coverAltTr||'Güncelleme kapak görseli'):(u.coverAltEn||'Release cover image');}
  else{cover.hidden=true;coverImg.removeAttribute('src');coverImg.alt='';}
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
