(function(){
  const host=document.getElementById('siteBottomNav');
  const active=host?.dataset.active||'home';
  const labels={
    tr:{home:'ana sayfa',history:'geçmiş',updates:'güncel',convert:'dönüştür',more:'diğer',remux:'remux',settings:'ayarlar',about:'hakkında',support:'destek ol'},
    en:{home:'home',history:'history',updates:'updates',convert:'convert',more:'more',remux:'remux',settings:'settings',about:'about',support:'support us'},
    fr:{home:'accueil',history:'historique',updates:'nouveautés',convert:'convertir',more:'plus',remux:'remux',settings:'paramètres',about:'à propos',support:'soutenir'},
    de:{home:'start',history:'verlauf',updates:'updates',convert:'konvertieren',more:'mehr',remux:'remux',settings:'einstellungen',about:'über uns',support:'unterstützen'}
  };
  function currentLang(){
    try{const saved=localStorage.getItem('zw_lang');if(labels[saved])return saved;}catch(e){}
    const browser=(navigator.language||'tr').slice(0,2).toLowerCase();
    return labels[browser]?browser:'tr';
  }
  const icon={
    home:'<path d="M12 3v13M5 16l7 5 7-5" stroke-linecap="round" stroke-linejoin="round"/>',
    history:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    updates:'<path d="M4 20L15.5 8.5M13.5 6.5l4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 3.5v4M4.5 5.5h4M18.5 14.5v5M16 17h5M19 3v2M18 4h2" stroke-linecap="round"/>',
    convert:'<path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>',
    more:'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    remux:'<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    about:'<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/>',
    support:'<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 00-.1-7.8z"/>'
  };
  const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${icon[name]}</svg>`;
  if(host){
    host.innerHTML=`
      <nav class="bottom-bar" aria-label="ZenithW">
        <a class="bar-btn ${active==='home'?'active':''}" href="/" aria-current="${active==='home'?'page':'false'}">${svg('home')}<span id="bbSave"></span></a>
        <a class="bar-btn ${active==='history'?'active':''}" href="/history.html" aria-current="${active==='history'?'page':'false'}">${svg('history')}<span id="bbHistory"></span></a>
        <a class="bar-btn ${active==='updates'?'active':''}" href="/updates" aria-current="${active==='updates'?'page':'false'}">${svg('updates')}<span id="bbUpdates"></span></a>
        <a class="bar-btn ${active==='convert'?'active':''}" href="/convert.html" aria-current="${active==='convert'?'page':'false'}">${svg('convert')}<span id="bbConvert"></span></a>
        <span class="bar-divider" aria-hidden="true"></span>
        <button type="button" class="bar-btn ${['remux','settings','about','support'].includes(active)?'active':''}" id="moreBtn" aria-expanded="false" aria-controls="morePopup">${svg('more')}<span id="bbMore"></span></button>
      </nav>
      <div class="more-popup" id="morePopup">
        <a class="more-item ${active==='remux'?'active':''}" href="/remux.html">${svg('remux')}<span id="moreItemRemux"></span></a>
        <a class="more-item ${active==='settings'?'active':''}" href="/settings.html">${svg('settings')}<span id="moreItemSettings"></span></a>
        <a class="more-item ${active==='support'?'active':''}" href="/support.html">${svg('support')}<span id="moreItemDonate"></span></a>
        <a class="more-item ${active==='about'?'active':''}" href="/about">${svg('about')}<span id="moreItemAbout"></span></a>
      </div>`;
  }
  function applyShellLanguage(){
    const lang=currentLang(),copy=labels[lang];
    const map={bbSave:'home',bbHistory:'history',bbUpdates:'updates',bbConvert:'convert',bbMore:'more',moreItemRemux:'remux',moreItemSettings:'settings',moreItemAbout:'about',moreItemDonate:'support'};
    Object.entries(map).forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.textContent=copy[key];});
    updateTimeGreeting();
  }
  const greetings={
    tr:{morning:'günaydın kanka',noon:'iyi öğlenler dostum',evening:'iyi akşamlar kanka',night:'geceler dostum'},
    en:{morning:'good morning, buddy',noon:'good afternoon, friend',evening:'good evening, buddy',night:'still up, friend'},
    fr:{morning:'bonjour mon pote',noon:'bon après-midi l’ami',evening:'bonsoir mon pote',night:'encore debout l’ami'},
    de:{morning:'guten morgen, kumpel',noon:'schönen mittag, freund',evening:'guten abend, kumpel',night:'noch wach, freund'}
  };
  function updateTimeGreeting(){
    const title=document.getElementById('timeGreeting');if(!title)return;
    const hour=new Date().getHours();
    const part=hour>=5&&hour<11?'morning':hour>=11&&hour<17?'noon':hour>=17&&hour<23?'evening':'night';
    title.replaceChildren(document.createTextNode(greetings[currentLang()][part]),Object.assign(document.createElement('span'),{textContent:'.'}));
  }
  function toggleMoreMenu(){
    const button=document.getElementById('moreBtn'),popup=document.getElementById('morePopup');
    if(!button||!popup)return;
    const willOpen=!popup.classList.contains('open');
    popup.classList.toggle('open',willOpen);button.classList.toggle('menu-open',willOpen);button.setAttribute('aria-expanded',String(willOpen));
  }
  window.toggleMoreMenu=toggleMoreMenu;
  window.applyShellLanguage=applyShellLanguage;
  window.updateTimeGreeting=updateTimeGreeting;
  document.getElementById('moreBtn')?.addEventListener('click',toggleMoreMenu);
  document.addEventListener('click',event=>{
    const popup=document.getElementById('morePopup'),button=document.getElementById('moreBtn');
    if(!popup||!button||popup.contains(event.target)||button.contains(event.target))return;
    popup.classList.remove('open');button.classList.remove('menu-open');button.setAttribute('aria-expanded','false');
  });
  applyShellLanguage();
  window.setInterval(updateTimeGreeting,60000);
  if(active==='history'&&typeof window.loadHistory==='function')window.loadHistory();
  if(active==='home'){
    try{
      const pending=sessionStorage.getItem('zw_pending_url');
      if(pending){
        sessionStorage.removeItem('zw_pending_url');
        window.setTimeout(()=>{
          const input=document.getElementById('urlInput');
          if(input){input.value=pending;if(typeof window.onInput==='function')window.onInput();if(typeof window.fetchVideo==='function')window.fetchVideo();}
        },0);
      }
    }catch(e){}
  }
})();
