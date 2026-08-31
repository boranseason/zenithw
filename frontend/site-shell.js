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
  // 110 Turkish greetings: 60 common, 30 rare, 15 epic and 5 legendary.
  const TR_GREETING_COUNT=110;
  const trGreetingDecks={
    deepNight:{
      common:['dostum saate bak, uyumaya ne dersin','gecenin bu saatinde hâlâ buradasın ha','uyku modu seni arıyor kanka','bir link daha, sonra gerçekten yatıyoruz','saat ilerledi dostum, gözlere mola','gece sessiz, ZenithW nöbette','ekranı biraz kısalım mı gece kuşu','yarının enerjisini bugünden harcama kanka','gece vardiyası yine bize kaldı','bu saatte indirilen video ayrı değerli','uykuya gitmeden son durak mı burası','gece üç kararları sabah sorgulanır'],
      rare:['beyin uykuda anıları düzenler, ona biraz zaman ver','gece kuşlarının göz kırpma sayısı azalır, arada kırp kanka','mavi ışık melatonini şaşırtabilir, ekranı biraz ısıt','ayılar kış uykusunda nabızlarını ciddi biçimde yavaşlatır','dostum saat sabaha yaklaşıyor, yatağın seni özledi','şu an dünyanın bir yerinde herkes yeni güne uyanıyor'],
      epic:['02.00 kulübüne hoş geldin; üyelik şartı biraz uykusuzluk','gecenin gizli bölümü açıldı, ödülün bir bardak su','bu mesajı görme ihtimalin düşüktü; şimdi gerçekten dinlen'],
      legendary:['efsanevi gece kuşu bulundu; görev: bilgisayarı kapat ve güzel bir rüya indir']
    },
    morning:{
      common:['günaydın kanka, yeni sekme yeni başlangıç','kahvaltı hazırsa linkler de hazır','sabah enerjisi sisteme yüklendi','günaydın dostum, bugün temiz başlıyoruz','güne bir dosya kadar hafif başla','uyandın mı kanka, ZenithW çoktan burada','sabahın ilk linki senden gelsin','kahve kokusu buraya kadar geldi','bugün güzel bir şey indirecek gibisin','güneş doğdu, indirme kuyruğu boş','günaydın şef, bağlantıyı bırak','sabah modu açık, telaş modu kapalı'],
      rare:['güneş ışığı vücudun iç saatini ayarlamaya yardım eder','sabah birkaç dakika gün ışığı almak uyanmayı kolaylaştırabilir','arılar güneşin konumunu küçük danslarla anlatır','su samurları uyurken birbirlerini kaybetmemek için el ele tutuşabilir','dostum bugün küçük bir işi erkenden bitirmek iyi hissettirebilir','dünyanın en sessiz sabahları bile kuşlarla başlar'],
      epic:['bugünün ilk güzel tesadüfü bu mesaj olabilir','sabah sandığından daha nadir bir selam yakaladın','güneş doğdu ve epic mod tesadüfen sana düştü'],
      legendary:['efsanevi günaydın: bugün ertelediğin o küçük şeyi bitireceksin']
    },
    noon:{
      common:['iyi öğlenler dostum, mola nasıl gidiyor','öğlen modu açık, bağlantıyı bırak','günün ortasında kısa bir ZenithW molası','kanka biraz su içtin mi','öğle arasında hızlı bir indirme mi','günün yarısı geçti, keyifler yerinde mi','öğlen güneşi dışarıda, dosyalar burada','bir link bırak, gerisini bize bırak','bugün tempo yüksek ama arayüz sakin','öğlen selamı benden, seçim senden','karnın toksa formatı seçelim','günün ortası, temiz bir başlangıç için geç değil'],
      rare:['ahtapotların üç kalbi vardır, bizde tek ama sağlam sunucu var','muz botanikte meyve, çilek ise teknik olarak farklı bir yapıdadır','deniz su samurları ceplerinde sevdikleri taşları saklayabilir','bir bulut yüzlerce ton su taşıyabilir ve hâlâ süzülebilir','kısa bir yürüyüş öğleden sonraki odağı tazeleyebilir','insan beyni dinlenirken bile arka planda çalışmayı sürdürür'],
      epic:['öğlenin nadir mesajı: bugün kendine biraz daha nazik davran','bu cümle öğle destesinin epic köşesinden düştü','günün tam ortasında küçük bir şans bonusu buldun'],
      legendary:['efsanevi öğlen molası açıldı; bugün acele etmeden de yetişebilirsin']
    },
    evening:{
      common:['iyi akşamlar kanka, gün nasıl geçti','akşam modu açık, acele etmiyoruz','günün yorgunluğunu bağlantıyla bırak','akşam sakinliği arayüze de geldi','dostum bugün elinden geleni yaptın','güneş battı, ZenithW ışıkları kıstı','akşamın ilk dosyası hangisi','bir çay koy, gerisini hallederiz','bugünü güzel bir videoyla kapatıyoruz','işler bittiyse keyif indirmesi başlasın','akşam selamı dosttan gelir','şimdi biraz kendine vakit ayırma zamanı'],
      rare:['kediler günün büyük bölümünü uyuyarak geçirebilir ve hiç suçluluk duymaz','gün batımındaki kızıllık ışığın atmosferde daha uzun yol almasından gelir','penguenler kalabalıkta eşlerini seslerinden tanıyabilir','bazı ağaçlar kök ve mantar ağları üzerinden kaynak paylaşır','akşam ışığını azaltmak uykuya geçişi kolaylaştırabilir','bugün yaptığın küçük şeyler yarının temelini kuruyor'],
      epic:['akşam destesinin epic mesajı sana denk geldi: bugün yeterdin','gün bitti sanma, huzurlu kısmı şimdi başlıyor','nadir akşam bonusu: sevdiğin birine selam göndermeyi unutma'],
      legendary:['efsanevi akşam bulundu; bugünün bütün telaşı burada sona eriyor']
    },
    lateNight:{
      common:['geceler dostum, hâlâ buralarda mısın','gece modu sana yakıştı kanka','son bir link deyip kaç tane oldu','sessizlik güzel, arayüz daha güzel','geceye sakin bir dosya bırakalım','yarına biraz enerji sakla dostum','ekran açık, şehir yavaşlıyor','gece indirmelerinin ayrı bir havası var','kanka gözlerin mola istiyor olabilir','uyumadan önce ne indiriyoruz','bugünü kapatmadan son bağlantı','gece geldi, gereksiz acele gitti'],
      rare:['zürafalar çok kısa sürelerle uyuyabilir, sen yine de onları örnek alma','yunuslar uyurken beyinlerinin bir yarısını uyanık tutabilir','Satürn’ün yoğunluğu sudan düşüktür; yeterince büyük bir havuzda yüzebilirdi','gece gökyüzünde gördüğün bazı ışıklar yıllar önce yola çıktı','uyku sırasında beyin günün gereksiz ayrıntılarını ayıklamaya çalışır','yarınki sen, zamanında uyuyan bugünkü sana teşekkür edebilir'],
      epic:['gecenin epic mesajı: her şeyi bugün bitirmek zorunda değilsin','nadir gece kartı açıldı; ödülün sakin bir nefes','bu cümle yalnızca uykuyla pazarlık edenlere görünür'],
      legendary:['efsanevi gece mesajı: sekmeyi kapatınca rüyalar otomatik başlayacak']
    }
  };
  const translatedGreetings={
    en:{deepNight:['friend, look at the time—how about some sleep','one last link, then we really rest','the night shift found you again'],morning:['good morning, buddy','new morning, clean start','coffee ready, links ready'],noon:['good afternoon, friend','a small ZenithW break','half the day, plenty of time'],evening:['good evening, buddy','slow down, the day is done','tea first, link second'],lateNight:['still awake, friend','night mode suits you','save some energy for tomorrow']},
    fr:{deepNight:['mon pote, regarde l’heure—on dort bientôt','un dernier lien, puis au lit','l’équipe de nuit te retrouve'],morning:['bonjour mon pote','nouveau matin, nouveau départ','café prêt, liens prêts'],noon:['bon après-midi l’ami','une petite pause ZenithW','la moitié du jour est passée'],evening:['bonsoir mon pote','la journée ralentit enfin','un thé puis un lien'],lateNight:['encore debout l’ami','le mode nuit te va bien','garde un peu d’énergie pour demain']},
    de:{deepNight:['freund, schau auf die Uhr—wie wäre es mit Schlaf','ein letzter Link, dann ist Ruhe','die Nachtschicht hat dich gefunden'],morning:['guten Morgen, Kumpel','neuer Morgen, sauberer Start','Kaffee bereit, Links bereit'],noon:['schönen Mittag, Freund','eine kleine ZenithW-Pause','der halbe Tag ist geschafft'],evening:['guten Abend, Kumpel','der Tag wird endlich ruhiger','erst Tee, dann der Link'],lateNight:['noch wach, Freund','der Nachtmodus steht dir','heb etwas Energie für morgen auf']}
  };
  const greetingState={key:'',text:''};
  function greetingPeriod(hour){return hour>=2&&hour<5?'deepNight':hour>=5&&hour<11?'morning':hour>=11&&hour<17?'noon':hour>=17&&hour<22?'evening':'lateNight';}
  function greetingTier(){const roll=Math.random();return roll<.01?'legendary':roll<.08?'epic':roll<.28?'rare':'common';}
  function chooseGreeting(lang,period){
    if(lang!=='tr'){const pool=translatedGreetings[lang][period];return{text:pool[Math.floor(Math.random()*pool.length)],tier:'common'};}
    const tier=greetingTier(),pool=trGreetingDecks[period][tier];let text=pool[Math.floor(Math.random()*pool.length)];
    try{const key='zw_last_greeting_tr',last=localStorage.getItem(key);for(let i=0;text===last&&i<5;i++)text=pool[Math.floor(Math.random()*pool.length)];localStorage.setItem(key,text);}catch(e){}
    return{text,tier};
  }
  function updateTimeGreeting(force){
    const title=document.getElementById('timeGreeting');if(!title)return;
    const lang=currentLang(),period=greetingPeriod(new Date().getHours()),key=lang+':'+period;
    if(!force&&greetingState.key===key)return;
    const choice=chooseGreeting(lang,period);greetingState.key=key;greetingState.text=choice.text;
    title.replaceChildren(document.createTextNode(choice.text),Object.assign(document.createElement('span'),{textContent:'.'}));
    const badge=document.getElementById('greetingRarity');if(badge){badge.textContent=choice.tier;badge.className='greeting-rarity '+choice.tier;}
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
