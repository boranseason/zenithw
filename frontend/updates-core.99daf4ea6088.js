const LATEST_UPDATE=
{ver:ZW_VERSION.ver,latest:true,dateTr:ZW_VERSION.dateTr,dateEn:ZW_VERSION.dateEn,cover:'zenithw.png',coverAltTr:'ZenithW v14.1 kapak görseli',coverAltEn:'ZenithW v14.1 cover image',
titleTr:'Railway’den AWS’ye: ZenithW artık kendi sunucusunda',
titleEn:'from Railway to AWS: ZenithW now runs on its own server',
introTr:[
'v14.1 ile ZenithW’nin backend’i Railway’den Amazon Web Services üzerindeki kendi EC2 sunucusuna taşındı. Alan adı ve arayüz yine Cloudflare’ın hızlı uç ağından geliyor; indirme, dönüştürme ve canlı ilerleme işlemleri ise artık bize ayrılmış Ubuntu sunucusunda çalışıyor.',
'Bu yalnızca “sunucunun adını değiştirdik” güncellemesi değil. Çalışma biçimi, ağ sınırı, servis yönetimi ve sorunları gözlemleme araçları yeniden kuruldu. Railway’in kolaylığını geride bırakırken AWS’nin kontrolünü kazandık; bunun getirdiği sorumlulukları da saklamıyoruz.'
],
introEn:[
'With v14.1, the ZenithW backend moved from Railway to its own EC2 server on Amazon Web Services. The domain and interface still arrive through Cloudflare’s fast edge, while downloads, conversions, and live progress now run on a dedicated Ubuntu host.',
'This is more than changing the name of the hosting provider. The runtime, network boundary, service supervision, and observability layer were rebuilt. We gained the control of AWS while leaving behind some of Railway’s convenience—and we are honest about the new responsibilities that come with it.'
],
sections:[
{hTr:'Railway’de eskiden nasıldı?',hEn:'what was Railway like before?',pTr:'Railway, uygulamayı GitHub’dan alıp çalıştırma, servis sürecini yönetme ve altyapının büyük bölümünü gizleme konusunda çok rahattı. Küçük bir ekip için hızlı başlangıç ve az bakım büyük artıydı. Buna karşılık sunucu işletim sistemi, ağ katmanı, kalıcı servisler ve kaynak kullanımı üzerinde daha az doğrudan kontrolümüz vardı; sorun araştırırken çoğunlukla platformun sunduğu görünümle sınırlıydık.',pEn:'Railway made it very convenient to deploy from GitHub, supervise the app process, and hide most infrastructure work. Fast setup and low maintenance were real advantages for a small team. The trade-off was less direct control over the operating system, networking, persistent services, and resource usage; investigations were largely limited to the view exposed by the platform.'},
{hTr:'AWS’de şimdi ne çalışıyor?',hEn:'what runs on AWS now?',pTr:'Backend artık Amazon EC2 üzerindeki t3.small Ubuntu sunucusunda çalışıyor. Gunicorn ve gevent tek çalışanlı güvenli mimariyi koruyor; systemd servisi uygulamayı gözetiyor, Nginx HTTPS ve WebSocket trafiğini uygulamaya aktarıyor. FFmpeg ve diğer yardımcı servisler aynı makinede, açıkça sınırlandırılmış kaynak ayarlarıyla çalışıyor.',pEn:'The backend now runs on a t3.small Ubuntu server in Amazon EC2. Gunicorn and gevent preserve the safe single-worker architecture, systemd supervises the app, and Nginx forwards HTTPS and WebSocket traffic. FFmpeg and supporting services run on the same host with explicit resource limits.'},
{hTr:'Cloudflare kapıda, AWS motor odasında',hEn:'Cloudflare at the door, AWS in the engine room',pTr:'Cloudflare Pages arayüzü sunmaya devam ediyor; DNS, proxy ve dış HTTPS bağlantısı da Cloudflare üzerinden geçiyor. Cloudflare ile EC2 arasındaki bağlantı Full (strict) TLS ile doğrulanıyor. Nginx yalnızca güvenilen proxy zincirinden gelen gerçek ziyaretçi IP’sini kabul ediyor; hız sınırları başlık taklidi yapan bir istemciye göre değil gerçek kullanıcıya göre uygulanıyor.',pEn:'Cloudflare Pages continues to serve the interface, while DNS, proxying, and public HTTPS stay at the Cloudflare edge. The connection from Cloudflare to EC2 is verified with Full (strict) TLS. Nginx accepts the real visitor IP only through the trusted proxy chain, so rate limits follow the actual user rather than spoofable headers.'},
{hTr:'AWS’nin bize kazandırdıkları',hEn:'what AWS gives us',pTr:'Sunucu süreçleri, disk, bellek, ağ ve servis günlükları artık doğrudan görülebiliyor. Nginx, systemd, güvenlik duvarı, yardımcı servisler ve çalışma sınırları ihtiyaca göre ayarlanabiliyor. Ayrılmış sanal makine, platformun soyut container yaşam döngüsüne daha az bağımlı; hata ayıklama ve performans ayarı daha ölçülebilir.',pEn:'Server processes, disk, memory, networking, and service logs are now directly visible. Nginx, systemd, firewall rules, supporting services, and runtime limits can be tuned for the workload. A dedicated virtual machine is less dependent on an abstract container lifecycle, making diagnostics and performance tuning more measurable.'},
{hTr:'dürüst tarafı: AWS’nin eksileri',hEn:'the honest part: AWS drawbacks',pTr:'Bu kontrol bedelsiz değil. İşletim sistemi güncellemeleri, güvenlik yamaları, disk takibi, servislerin yeniden başlatılması, sertifika ve ağ yapılandırması artık bizim sorumluluğumuzda. Tek EC2 örneği yüksek erişilebilirlik sağlamıyor; makine veya bölge sorunu yaşanırsa otomatik ikinci sunucu henüz yok. Ayrıca trafik az olsa bile sunucu açık kaldığı sürece sabit maliyet oluşuyor ve kapasite artırımı Railway’e göre daha fazla planlama istiyor.',pEn:'That control is not free. Operating-system updates, security patches, disk monitoring, service restarts, certificates, and network configuration are now our responsibility. A single EC2 instance is not high availability; there is no automatic second server yet if the host or region has a problem. The server also has a fixed running cost even during quiet periods, and scaling requires more planning than it did on Railway.'},
{hTr:'neden yine de geçtik?',hEn:'why move anyway?',pTr:'ZenithW’nin medya işleme yapısı uzun süren bağlantılar, FFmpeg, WebSocket ve kontrollü geçici depolama kullanıyor. Bu iş yükünde kendi Linux sunucumuzu görmek ve sınırlarını doğrudan yönetmek bizim için daha değerli hale geldi. Railway kötü olduğu için değil; ZenithW artık daha fazla altyapı kontrolüne ihtiyaç duyduğu için AWS’yi seçtik.',pEn:'ZenithW’s media workload relies on long-lived connections, FFmpeg, WebSockets, and controlled temporary storage. For this workload, seeing our Linux host and managing its limits directly became more valuable. We did not move because Railway is bad; we moved because ZenithW now benefits from deeper infrastructure control.'}
],
outroTr:'Kısacası v14.1, yönetilen bir platformun rahatlığından kendi sunucumuzun kontrolüne geçiş sürümü. Daha fazla görünürlük ve özgürlük kazandık; karşılığında bakım, maliyet ve erişilebilirlik sorumluluğunu da üstlendik.',
outroEn:'In short, v14.1 moves ZenithW from the convenience of a managed platform to the control of its own server. We gained visibility and freedom while taking on maintenance, cost, and availability responsibilities.'
};
const UPDATE_VERSIONS=['v14.1', 'v14.0', 'v13.8', 'v13.7', 'v13.6', 'v13.5', 'v13.4', 'v13.3', 'v13.2', 'v13.1', 'v13.0', 'v12.9', 'v12.8', 'v12.7', 'v12.6', 'v12.5', 'v12.4', 'v12.3', 'v12.2', 'v12.1', 'v12.0', 'v11.7', 'v11.6', 'v11.5', 'v11.4', 'v11.3', 'v11.2', 'v11.1', 'v11.0', 'v10.9', 'v10.8', 'v10.7', 'v10.6', 'v10.5', 'v10.4', 'v10.3', 'v10.2', 'v10.1', 'v10.0', 'v9.0', 'v8.1', 'v8.0', 'v7.3', 'v7.2', 'v7.1', 'v7.0', 'v6.1', 'v6.0', 'v5.6', 'v5.5', 'v5.4', 'v5.3', 'v5.2', 'v5.1', 'v5.0', 'v4.0'];
let UPDATES=[LATEST_UPDATE];
let archivePromise=null;

function loadUpdateArchive(){
  if(UPDATES.length>1)return Promise.resolve(UPDATES);
  if(Array.isArray(window.ZW_UPDATE_ARCHIVE)){UPDATES=[LATEST_UPDATE,...window.ZW_UPDATE_ARCHIVE];return Promise.resolve(UPDATES);}
  if(archivePromise)return archivePromise;
  archivePromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='updates-archive.07c744021db2.js?v=14.1';
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
