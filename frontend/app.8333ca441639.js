const API="https://api.zenithw.space";
async function downloadThumbnail(){
  if(!videoInfo||!videoInfo.url) return;
  try{
    const res=await fetch(API+'/thumbnail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:videoInfo.url})});
    if(!res.ok){ return; }
    const blob=await res.blob();
    const a=document.createElement('a');
    const objectUrl=URL.createObjectURL(blob);
    a.href=objectUrl;
    a.download='thumbnail.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
  }catch(e){ console.error('thumb dl err',e); }
}

// ── XSS güvenliği: uzak sitelerden gelen title/thumbnail/url innerHTML'e
// basılmadan önce escape edilmeli, çünkü bu değerler kullanıcının
// yapıştırdığı URL'nin ait olduğu uzak sayfanın metadata'sından geliyor.
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeThumbHtml(url,fallback){
  if(fallback===undefined)fallback='🎬';
  if(!url)return fallback;
  try{
    const u=new URL(url,location.href);
    if(u.protocol!=='http:'&&u.protocol!=='https:')return fallback;
  }catch(e){return fallback;}
  return `<img src="${escapeHtml(url)}" loading="lazy" decoding="async" width="160" height="90" referrerpolicy="no-referrer">`;
}
const socket=io(API,{autoConnect:false,reconnection:true});
let socketId=null,videoInfo={},dlId=null,dlAbort=null,ytErrTimer=null,pendingBlob=null,pendingFilename=null,pendingObjectUrl=null;
let socketDisconnectTimer=null;
let infoController=null,infoSequence=0;

function ensureSocket(){
  if(socketDisconnectTimer){clearTimeout(socketDisconnectTimer);socketDisconnectTimer=null;}
  if(socket.connected){socketId=socket.id;return Promise.resolve(socketId);}
  return new Promise(resolve=>{
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;
      socket.off('connect',finish);
      socketId=socket.connected?socket.id:null;
      resolve(socketId);
    };
    socket.once('connect',finish);
    socket.connect();
    setTimeout(finish,1500);
  });
}
function scheduleSocketDisconnect(delay){
  if(socketDisconnectTimer)clearTimeout(socketDisconnectTimer);
  socketDisconnectTimer=setTimeout(()=>{
    if(!plQueueRunning&&!dlAbort&&socket.connected)socket.disconnect();
    socketDisconnectTimer=null;
  },delay||5000);
}

// ── i18n — defined FIRST so t() is available everywhere ──
let LANG='tr';
const TX={
  tr:{
    placeholder:'bir video linki yapıştır…',bulkPlaceholder:'linkleri her satıra bir tane olacak şekilde yapıştır... (Enter ile indir, Shift+Enter ile yeni satır)',modeAutoTxt:'auto',modeAudioTxt:'audio',modeMuteTxt:'sessiz',paste:'yapıştır',
    vcDl:'indir',dlBtn:'indir',dlCancel:'iptal',
    bbSave:'kaydet',bbHistory:'geçmiş',bbRemux:'remux',bbConvert:'dönüştür',bbSettings:'ayarlar',bbUpdates:'güncel',bbAbout:'hakkında',bbMore:'diğer',bbDonate:'destek ol',
    accDefault:'klasik',accDefaultDesc:'buz mavisi · dengeli',accPurple:'neon mor',accPurpleDesc:'elektrik moru · derin uzay',accGray:'grafit',accGrayDesc:'nötr gri · sade',accPink:'neon pembe',accPinkDesc:'canlı pembe · sıcak',accCobalt:'cobalt mavisi',accCobaltDesc:'derin mavi · odaklı',
    saveTitleTxt:'nasıl kaydetmek istersin?',saveDlTxt:'indir',saveShareTxt:'paylaş',saveCopyTxt:'kopyala',
    saveNoteTxt:'tarayıcı pop-up\'ları engelliyorsa "indir" butonunu kullanın.',saveDoneTxt:'tamam',
    stModalTitle:'ayarlar',stModalSubtitle:'indirme deneyimini özelleştir',stNavVideo:'video',stNavAudio:'ses',stNavAppearance:'görünüm',stNavMeta:'metadata',stNavFilename:'dosya adı',stNavClose:'kapat',
    stLblQuality:'video kalitesi',stNoteQuality:'tercih edilen kalite seçilir; bulunamazsa en yakın kullanılır.',
    stLblCodec:'youtube codec',stNoteCodec:'h264: max uyumluluk · av1: en iyi kalite, 8k & hdr · vp9: av1 kalitesi',
    stLblVFmt:'video formatı',stLblAFmt:'ses formatı',stNoteAFmt:'flac, wav: kayıpsız · mp3, ogg, opus, m4a: kayıplı',
    stLblBitrate:'ses bit hızı',stNoteBitrate:'yalnızca kayıplı formatlar için geçerli.',
    stLblTheme:'tema',themeAuto:'otomatik',themeLight:'açık',themeDark:'koyu',
    stNoteTheme:'otomatik tema cihaz ekran modunu takip eder.',
    stLblLang:'dil',stNoteLang:'arayüz dili. tarayıcıdan otomatik algılanır.',
    stLblAccent:'renk teması',stNoteAccent:'tema; arka planı, panelleri, parlamaları ve etkileşim renklerini birlikte değiştirir.',
    stLblMeta:'dosya metadatası',stMetaName:'metadata göm',stMetaDesc:'dosyaya başlık, sanatçı ve platform bilgisi gömülür.',
    stSbName:'SponsorBlock',stSbDesc:'sponsor/reklam bölümlerini videodan otomatik keser (YouTube).',
    stSubName:'altyazı göm',stSubDesc:'mevcutsa altyazıyı videoya gömer (varsayılan dil: tr, yoksa en).',
    stLblFnf:'dosya adı formatı',stNoteFnf:'İndirme başlamadan önce dosya adı bu formata göre oluşturulur.',
    stLblFnfEx:'örnek formatlar',
    connecting:'bağlanıyor...',downloading:'indiriliyor...',merging:'birleştiriliyor...',queued:'sırada bekleniyor...',done:'tamamlandı!',
    found:'video bulundu ✓',downloaded:'indirildi ✓',cancelled:'iptal edildi',error:'hata',
    convTitleTxt:'dönüştür',convModalSub:'dosyanı istediğin formata çevir',convDropTitle:'dosya seç veya sürükle',convDropSub:'mp4, webm, mkv, mp3, flac, wav...',
    convFmtLabel:'ÇIKIŞ FORMATINI SEÇ',convBtnSel:'dosya seçin',convBtnReady:'{fmt} olarak dönüştür',
    remuxTitleTxt:'remux',remuxModalSub:'konteyneri kayıpsız onar',remuxDropTitle:'dosya sürükle veya seç',remuxDropSub:'mp4, webm, mp3, ogg, opus, wav, m4a',
    updTitle:'güncellemeler',
    servicesChipTxt:'desteklenen servisler',servicesTitleTxt:'desteklenen platformlar',servicesModalSub:'22 platform · tek bağlantı',
    servicesNoteTxt:'bir platformu desteklemek, teknik uyumluluk dışında ilişki anlamına gelmez. tüm sorumluluk kullanıcıdadır.',
    clipHintTxt:'panonda bir link var, yapıştırmak ister misin?',
    ytWarn:'youtube desteği aktif — bazı videolar youtube erişim kısıtlamalarından etkilenebilir.',
    ytErrTitle:'youtube videosu bulunamadı',ytErrTxt:'youtube bot engelleme aktif olabilir. birkaç dakika bekleyip tekrar deneyin.',
    enterLink:'önce link gir',connErr:'bağlantı hatası',igBusy:'instagram yoğun, 2-3 dk bekle',
    errYoutubeRestricted:'youtube bu indirmeye şu anda izin vermedi. birkaç dakika sonra tekrar deneyin.',errFormatUnavailable:'seçilen format kullanılamıyor. farklı bir format veya kalite deneyin.',
    errRateLimited:'çok fazla istek gönderildi. biraz bekleyip tekrar deneyin.',errServerBusy:'sunucu şu anda yoğun. kısa süre sonra tekrar deneyin.',errTimeout:'işlem beklenenden uzun sürdü. tekrar deneyin.',errFileTooLarge:'dosya izin verilen boyut sınırını aşıyor.',
    errPrivate:'bu video gizli ve indirilemiyor.',errUnavailable:'bu video şu anda kullanılamıyor.',errLive:'canlı yayınlar şu anda desteklenmiyor.',errUnsupported:'bu bağlantı veya platform desteklenmiyor.',
    errPlatformRestricted:'platform bu indirmeye izin vermedi. daha sonra tekrar deneyin.',errNetwork:'bağlantı sorunu oluştu. tekrar deneyin.',errGeneric:'işlem tamamlanamadı. lütfen tekrar deneyin.',errConversion:'dönüştürme tamamlanamadı. dosya formatını kontrol edin.',
    remuxDone:'remux tamamlandı',convDone:'dönüştürüldü ✓',
    uploading:'gönderiliyor...',converting:'dönüştürülüyor...',convDoneLabel:'tamamlandı!',
    historyTitle:'indirme geçmişi',clearHistoryTxt:'geçmişi temizle',historyEmpty:'geçmiş boş',historyLoading:'yükleniyor...',
    donTitle:'destek ol',donSub:'küçük bir katkı ZenithW\'nin devamına yardımcı olur.',
    donPaparaSub:'türkiye — anlık transfer',donCopyBtn:'kopyala',donFollowBtn:'takip et',donThanks:'her destek için teşekkür ederiz 🙏',
    donContactName:'iletişim',donContactBtn:'e-posta gönder',
    aboutWhatTitle: 'ZenithW nedir?',
    aboutWhatText: 'ZenithW; YouTube, TikTok, Instagram, X/Twitter, Reddit ve daha onlarca platformdan video, ses ve playlist indirmeni sağlayan bağımsız, reklamsız bir araçtır. Sunucu tarafında dünyanın en gelişmiş açık kaynak indirme motoru olan <strong>yt-dlp</strong>\'yi kullanır; bu sayede videoyu her zaman kaynağın kendisinden, en yüksek kalitede ve ekstra dönüştürme kaybı olmadan yakalar. Tek yapman gereken linki yapıştırmak — format ve kaliteyi sen seçersin, gerisini ZenithW halleder.',
    aboutTrustTitle: 'Neden güvenebilirsin?',
    aboutTrustText: 'Klasik "indirme" sitelerinin aksine burada seni takip eden reklam ağı, sahte indirme butonu, yönlendirme ya da pop-up yok. İndirme geçmişin sunucuda asla tutulmaz — sadece kendi tarayıcının belleğinde (localStorage) senin cihazında saklanır ve istediğin an tek tıkla silinebilir. Kod tarafı sürekli güvenlik açısından gözden geçiriliyor: yol geçişi (path traversal) engelleri, istek sınırlama (rate limiting) ve sahte IP koruması gibi önlemler baştan itibaren var.',
    aboutOpenTitle: 'açık kaynak',
    aboutOpenText: 'ZenithW\'nin tüm kaynak kodu <a href="https://github.com/kakangeldi82-netizen/zenithw" target="_blank" style="color:var(--accent);">GitHub</a> üzerinde herkese açık ve MIT lisansıyla paylaşılıyor. Arka planda ne olduğunu merak ediyorsan kod satır satır önünde — gizli bir şey yok. İsteyen inceleyebilir, katkıda bulunabilir ya da kendi sunucusunda çalıştırabilir.',
    queueResumeTpl:'yarım kalan bir indirme kuyruğun var ({done}/{total} tamamlandı) — devam etmek ister misin?',
    aboutDevLabel:'geliştirici',aboutContactLabel:'iletişim',aboutStackLabel:'teknoloji',aboutHostLabel:'hosting',aboutLicLabel:'lisans',
    aboutPrivacyLink:'gizlilik',aboutTermsLink:'kullanım koşulları',aboutDmcaLink:'telif bildirimi',aboutStatusLink:'durum',
    qrTitle:'TELEFONA AKTAR',qrHint:'QR kodu telefonunuzla tarayın',
    remuxInfo1:'<strong>remux ne yapar?</strong> dosya konteynerindeki sorunları düzeltir.',
    remuxInfo2:'<strong>kayıpsız:</strong> codec verisini yeni konteynere kopyalar.',
    plQueueTitle:'playlist indiriliyor',
    plQueueQueued:'sırada',plQueueDownloadingItem:'indiriliyor...',plQueueItemDone:'tamamlandı',plQueueItemErr:'hata',
    plQueueCompletedWord:'tamamlandı',plQueueStopBtn:'durdur',plQueueCloseBtn:'kapat',
    plQueueStoppedMsg:'playlist indirme durduruldu',plQueueDoneMsg:'playlist indirme tamamlandı',plQueueStoppingMsg:'durduruluyor, mevcut indirme tamamlanacak',
    historyRedownload:'tekrar indir',historyCopyLink:'link kopyala',historyClearedMsg:'geçmiş temizlendi',
    bulkNeedLink:'en az bir link gir',bulkMaxLinks:'en fazla 10 link aynı anda',bulkSuccessWord:'başarılı',bulkFailWord:'başarısız',
    langComingSoon:'bu dil yakında geliyor 🚧',
    updBadge:'GÜNCEL',
  },
  en:{
    placeholder:'paste link here',bulkPlaceholder:'paste links, one per line... (Enter to download, Shift+Enter for a new line)',modeAutoTxt:'auto',modeAudioTxt:'audio',modeMuteTxt:'mute',paste:'paste',
    vcDl:'download',dlBtn:'download',dlCancel:'cancel',
    bbSave:'save',bbHistory:'history',bbRemux:'remux',bbConvert:'convert',bbSettings:'settings',bbUpdates:'updates',bbAbout:'about',bbMore:'more',bbDonate:'support us',
    accDefault:'classic',accDefaultDesc:'ice blue · balanced',accPurple:'neon purple',accPurpleDesc:'electric violet · deep space',accGray:'graphite',accGrayDesc:'neutral gray · minimal',accPink:'neon pink',accPinkDesc:'vivid pink · warm',accCobalt:'cobalt blue',accCobaltDesc:'deep blue · focused',
    saveTitleTxt:'choose how to save',saveDlTxt:'download',saveShareTxt:'share',saveCopyTxt:'copy',
    saveNoteTxt:'if your browser blocked the popup, use the download button.',saveDoneTxt:'done',
    stModalTitle:'settings',stModalSubtitle:'customize your download experience',stNavVideo:'video',stNavAudio:'audio',stNavAppearance:'appearance',stNavMeta:'metadata',stNavFilename:'filename',stNavClose:'close',
    stLblQuality:'video quality',stNoteQuality:'preferred quality is selected; closest available used if not found.',
    stLblCodec:'youtube codec',stNoteCodec:'h264: max compatibility · av1: best quality, 8k & hdr · vp9: av1 quality',
    stLblVFmt:'video format',stLblAFmt:'audio format',stNoteAFmt:'flac, wav: lossless · mp3, ogg, opus, m4a: lossy',
    stLblBitrate:'audio bitrate',stNoteBitrate:'applies to lossy formats only.',
    stLblTheme:'theme',themeAuto:'auto',themeLight:'light',themeDark:'dark',
    stNoteTheme:'auto theme follows your device display mode.',
    stLblLang:'language',stNoteLang:'interface language. auto-detected from browser.',
    stLblAccent:'color theme',stNoteAccent:'the theme changes the background, panels, glow, and interaction colors together.',
    stLblMeta:'file metadata',stMetaName:'embed metadata',stMetaDesc:'title, artist, and platform info is embedded into the file.',
    stSbName:'SponsorBlock',stSbDesc:'automatically cuts sponsor/ad segments from the video (YouTube).',
    stSubName:'embed subtitles',stSubDesc:'embeds subtitles into the video if available (tries Turkish first, falls back to English).',
    stLblFnf:'filename format',stNoteFnf:'File will be named using this template before download.',
    stLblFnfEx:'example formats',
    connecting:'connecting...',downloading:'downloading...',merging:'merging...',queued:'waiting in queue...',done:'done!',
    found:'video found ✓',downloaded:'downloaded ✓',cancelled:'cancelled',error:'error',
    convTitleTxt:'convert',convModalSub:'convert a file to another format',convDropTitle:'select or drag file',convDropSub:'mp4, webm, mkv, mp3, flac, wav...',
    convFmtLabel:'SELECT OUTPUT FORMAT',convBtnSel:'select a file',convBtnReady:'convert to {fmt}',
    remuxTitleTxt:'remux',remuxModalSub:'repair the container without re-encoding',remuxDropTitle:'drag & drop or select file',remuxDropSub:'supported: mp4, webm, mp3, ogg, opus, wav, m4a',
    updTitle:'updates',
    servicesChipTxt:'supported services',servicesTitleTxt:'supported platforms',servicesModalSub:'22 platforms · one link',
    servicesNoteTxt:'supporting a service does not imply affiliation beyond technical compatibility.',
    clipHintTxt:'found a link in your clipboard — want to paste it?',
    ytWarn:'youtube support is active — some videos may be affected by youtube access restrictions.',
    ytErrTitle:'youtube video not found',ytErrTxt:"youtube's bot detection may be active. please wait a few minutes and try again.",
    enterLink:'enter a link first',connErr:'connection error',igBusy:'instagram is busy, wait 2-3 min',
    errYoutubeRestricted:'youtube did not allow this download. wait a few minutes and try again.',errFormatUnavailable:'the selected format is unavailable. try another format or quality.',
    errRateLimited:'too many requests were sent. wait a moment and try again.',errServerBusy:'the server is busy right now. try again shortly.',errTimeout:'the operation took too long. please try again.',errFileTooLarge:'the file exceeds the allowed size limit.',
    errPrivate:'this video is private and cannot be downloaded.',errUnavailable:'this video is currently unavailable.',errLive:'live streams are not currently supported.',errUnsupported:'this link or platform is not supported.',
    errPlatformRestricted:'the platform did not allow this download. try again later.',errNetwork:'a connection problem occurred. please try again.',errGeneric:'the operation could not be completed. please try again.',errConversion:'conversion could not be completed. check the file format.',
    remuxDone:'remux done',convDone:'converted ✓',
    uploading:'uploading...',converting:'converting...',convDoneLabel:'done!',
    historyTitle:'download history',clearHistoryTxt:'clear history',historyEmpty:'history empty',historyLoading:'loading...',
    donTitle:'support us',donSub:'a small contribution helps keep ZenithW running.',
    donPaparaSub:'turkey — instant transfer',donCopyBtn:'copy',donFollowBtn:'follow',donThanks:'thank you for every bit of support 🙏',
    donContactName:'contact',donContactBtn:'send email',
    aboutWhatTitle: 'What is ZenithW & yt-dlp?',
    aboutWhatText: 'ZenithW is an independent media tool focused on clean, modern design. In the background, it runs <strong>yt-dlp</strong>, the world\'s most advanced open-source download engine. This allows it to fetch high-quality audio and video streams directly from the source servers.',
    aboutTrustTitle: 'Why should you trust us?',
    aboutTrustText: 'Unlike traditional downloader sites, ZenithW has no tracking ad networks, redirects, or pop-ups. Your download history is never stored on the server; it remains strictly inside your browser\'s memory (localStorage).',
    aboutOpenTitle: 'open source',
    aboutOpenText: 'ZenithW\'s entire source code is public on <a href="https://github.com/kakangeldi82-netizen/zenithw" target="_blank" style="color:var(--accent);">GitHub</a> under the MIT license. If you\'re curious what\'s happening behind the scenes, it\'s all right there, line by line — nothing hidden. Anyone can review it, contribute, or even run their own instance.',
    queueResumeTpl:'you have an unfinished download queue ({done}/{total} completed) — want to continue?',
    aboutHowTitle: 'How does it work?',
    aboutHowText: 'Paste the link → ZenithW analyzes the video and shows you the available quality and format options → pick one and download it. Video, audio (mp3/m4a), mute mode, and bulk/playlist downloads are all supported, plus the built-in convert and remux tools for files you already have. The whole process finishes in seconds, without ever leaving the tab.',
    aboutDevLabel:'developer',aboutContactLabel:'contact',aboutStackLabel:'stack',aboutHostLabel:'hosting',aboutLicLabel:'license',
    aboutPrivacyLink:'privacy',aboutTermsLink:'terms of service',aboutDmcaLink:'copyright notice',aboutStatusLink:'status',
    qrTitle:'SEND TO PHONE',qrHint:'Scan QR code with your phone',
    remuxInfo1:'<strong>what does remux do?</strong> fixes issues in the file container.',
    remuxInfo2:'<strong>lossless:</strong> copies the codec data into a new container without re-encoding.',
    plQueueTitle:'downloading playlist',
    plQueueQueued:'queued',plQueueDownloadingItem:'downloading...',plQueueItemDone:'done',plQueueItemErr:'error',
    plQueueCompletedWord:'completed',plQueueStopBtn:'stop',plQueueCloseBtn:'close',
    plQueueStoppedMsg:'playlist download stopped',plQueueDoneMsg:'playlist download completed',plQueueStoppingMsg:'stopping — current download will finish',
    historyRedownload:'redownload',historyCopyLink:'copy link',historyClearedMsg:'history cleared',
    bulkNeedLink:'enter at least one link',bulkMaxLinks:'max 10 links at once',bulkSuccessWord:'successful',bulkFailWord:'failed',
    langComingSoon:'this language is coming soon 🚧',
    updBadge:'LATEST',
  },
  fr:{
    placeholder:'collez un lien vidéo…',bulkPlaceholder:'collez les liens, un par ligne... (Entrée pour télécharger, Maj+Entrée pour une nouvelle ligne)',modeAutoTxt:'auto',modeAudioTxt:'audio',modeMuteTxt:'muet',paste:'coller',
    vcDl:'télécharger',dlBtn:'télécharger',dlCancel:'annuler',
    bbSave:'enregistrer',bbHistory:'historique',bbRemux:'remux',bbConvert:'convertir',bbSettings:'paramètres',bbUpdates:'nouveautés',bbAbout:'à propos',bbMore:'plus',bbDonate:'soutenir',
    accDefault:'classique',accDefaultDesc:'bleu glacier · équilibré',accPurple:'violet néon',accPurpleDesc:'violet électrique · espace',accGray:'graphite',accGrayDesc:'gris neutre · minimal',accPink:'rose néon',accPinkDesc:'rose vif · chaleureux',accCobalt:'bleu cobalt',accCobaltDesc:'bleu profond · précis',
    saveTitleTxt:'comment voulez-vous enregistrer ?',saveDlTxt:'télécharger',saveShareTxt:'partager',saveCopyTxt:'copier',
    saveNoteTxt:'si votre navigateur bloque la fenêtre pop-up, utilisez le bouton "télécharger".',saveDoneTxt:'terminé',
    stModalTitle:'paramètres',stModalSubtitle:'personnalisez votre expérience',stNavVideo:'vidéo',stNavAudio:'audio',stNavAppearance:'apparence',stNavMeta:'métadonnées',stNavFilename:'nom de fichier',stNavClose:'fermer',
    stLblQuality:'qualité vidéo',stNoteQuality:'la qualité préférée est sélectionnée ; la plus proche disponible est utilisée si introuvable.',
    stLblCodec:'codec youtube',stNoteCodec:'h264 : compatibilité maximale · av1 : meilleure qualité, 8k & hdr · vp9 : qualité proche de av1',
    stLblVFmt:'format vidéo',stLblAFmt:'format audio',stNoteAFmt:'flac, wav : sans perte · mp3, ogg, opus, m4a : avec perte',
    stLblBitrate:'débit audio',stNoteBitrate:'s\'applique uniquement aux formats avec perte.',
    stLblTheme:'thème',themeAuto:'auto',themeLight:'clair',themeDark:'sombre',
    stNoteTheme:'le thème auto suit le mode d\'affichage de votre appareil.',
    stLblLang:'langue',stNoteLang:'langue de l\'interface. détectée automatiquement depuis le navigateur.',
    stLblAccent:'thème de couleur',stNoteAccent:'le thème modifie ensemble le fond, les panneaux, les lueurs et les interactions.',
    stLblMeta:'métadonnées du fichier',stMetaName:'intégrer les métadonnées',stMetaDesc:'le titre, l\'artiste et la plateforme sont intégrés au fichier.',
    stSbName:'SponsorBlock',stSbDesc:'coupe automatiquement les segments sponsorisés/publicitaires de la vidéo (YouTube).',
    stSubName:'intégrer les sous-titres',stSubDesc:'intègre les sous-titres à la vidéo si disponibles (essaie le turc en premier, puis l\'anglais).',
    stLblFnf:'format du nom de fichier',stNoteFnf:'le nom du fichier sera généré selon ce modèle avant le téléchargement.',
    stLblFnfEx:'exemples de formats',
    connecting:'connexion...',downloading:'téléchargement...',merging:'fusion...',done:'terminé !',
    found:'vidéo trouvée ✓',downloaded:'téléchargé ✓',cancelled:'annulé',error:'erreur',
    convTitleTxt:'convertir',convModalSub:'convertissez un fichier au format souhaité',convDropTitle:'choisir ou glisser un fichier',convDropSub:'mp4, webm, mkv, mp3, flac, wav...',
    convFmtLabel:'CHOISIR LE FORMAT DE SORTIE',convBtnSel:'choisir un fichier',convBtnReady:'convertir en {fmt}',
    remuxTitleTxt:'remux',remuxModalSub:'réparez le conteneur sans réencodage',remuxDropTitle:'glissez ou choisissez un fichier',remuxDropSub:'formats pris en charge : mp4, webm, mp3, ogg, opus, wav, m4a',
    updTitle:'nouveautés',
    servicesChipTxt:'services pris en charge',servicesTitleTxt:'plateformes prises en charge',servicesModalSub:'22 plateformes · un seul lien',
    servicesNoteTxt:'la prise en charge d\'une plateforme n\'implique aucune affiliation au-delà de la compatibilité technique.',
    clipHintTxt:'un lien a été trouvé dans votre presse-papiers — voulez-vous le coller ?',
    ytWarn:'le support youtube est actif — certaines vidéos peuvent être affectées par les restrictions d’accès de youtube.',
    ytErrTitle:'vidéo youtube introuvable',ytErrTxt:'la détection anti-bot de youtube est peut-être active. réessayez dans quelques minutes.',
    enterLink:'entrez d\'abord un lien',connErr:'erreur de connexion',igBusy:'instagram est occupé, attendez 2-3 min',
    errYoutubeRestricted:'youtube n\'a pas autorisé ce téléchargement. réessayez dans quelques minutes.',errFormatUnavailable:'le format sélectionné est indisponible. essayez un autre format ou une autre qualité.',
    errRateLimited:'trop de requêtes ont été envoyées. patientez puis réessayez.',errServerBusy:'le serveur est occupé. réessayez dans quelques instants.',errTimeout:'l\'opération a pris trop de temps. veuillez réessayer.',errFileTooLarge:'le fichier dépasse la taille autorisée.',
    errPrivate:'cette vidéo est privée et ne peut pas être téléchargée.',errUnavailable:'cette vidéo est actuellement indisponible.',errLive:'les diffusions en direct ne sont pas prises en charge.',errUnsupported:'ce lien ou cette plateforme n\'est pas pris en charge.',
    errPlatformRestricted:'la plateforme n\'a pas autorisé ce téléchargement. réessayez plus tard.',errNetwork:'un problème de connexion est survenu. réessayez.',errGeneric:'l\'opération n\'a pas pu être terminée. veuillez réessayer.',errConversion:'la conversion a échoué. vérifiez le format du fichier.',
    remuxDone:'remux terminé',convDone:'converti ✓',
    uploading:'envoi...',converting:'conversion...',convDoneLabel:'terminé !',
    historyTitle:'historique des téléchargements',clearHistoryTxt:'effacer l\'historique',historyEmpty:'historique vide',historyLoading:'chargement...',
    donTitle:'soutenir zenithw',donSub:'une petite contribution aide ZenithW à continuer.',
    donPaparaSub:'turquie — virement instantané',donCopyBtn:'copier',donFollowBtn:'suivre',donThanks:'merci pour chaque soutien 🙏',
    donContactName:'contact',donContactBtn:'envoyer un e-mail',
    aboutWhatTitle: 'qu\'est-ce que zenithw ?',
    aboutWhatText: 'ZenithW est un outil indépendant et sans publicité qui permet de télécharger des vidéos, de l\'audio et des playlists depuis YouTube, TikTok, Instagram, X/Twitter, Reddit et bien d\'autres plateformes. Côté serveur, il utilise <strong>yt-dlp</strong>, le moteur de téléchargement open-source le plus avancé au monde, ce qui lui permet de récupérer la vidéo directement depuis la source, dans la meilleure qualité, sans perte de conversion supplémentaire. Il vous suffit de coller le lien — vous choisissez le format et la qualité, ZenithW s\'occupe du reste.',
    aboutTrustTitle: 'pourquoi nous faire confiance ?',
    aboutTrustText: 'Contrairement aux sites de téléchargement classiques, il n\'y a ici aucun réseau publicitaire qui vous suit, aucun faux bouton de téléchargement, aucune redirection ni pop-up. Votre historique de téléchargement n\'est jamais stocké sur le serveur — il reste uniquement dans la mémoire de votre propre navigateur (localStorage) et peut être supprimé en un clic à tout moment. Le code est régulièrement revu pour la sécurité : protection contre le path traversal, limitation du débit de requêtes et protection anti-usurpation d\'ip sont en place dès le départ.',
    aboutOpenTitle: 'code source ouvert',
    aboutOpenText: 'Tout le code source de ZenithW est public sur <a href="https://github.com/kakangeldi82-netizen/zenithw" target="_blank" style="color:var(--accent);">GitHub</a> sous licence MIT. Si vous êtes curieux de savoir ce qui se passe en coulisses, tout est là, ligne par ligne — rien n\'est caché. N\'importe qui peut le consulter, contribuer ou même faire tourner sa propre instance.',
    queueResumeTpl:'il vous reste une file de téléchargement inachevée ({done}/{total} terminés) — voulez-vous continuer ?',
    aboutHowTitle: 'comment ça marche ?',
    aboutHowText: 'Vous collez le lien → ZenithW analyse la vidéo et affiche les options de qualité et de format disponibles → vous choisissez et téléchargez. Vidéo, audio (mp3/m4a), mode muet et téléchargement groupé (playlist) sont pris en charge ; vous pouvez aussi convertir ou remuxer vos propres fichiers avec les outils intégrés. Tout le processus se termine en quelques secondes, sans jamais quitter l\'onglet.',
    aboutDevLabel:'développeur',aboutContactLabel:'contact',aboutStackLabel:'technologies',aboutHostLabel:'hébergement',aboutLicLabel:'licence',
    aboutPrivacyLink:'confidentialité',aboutTermsLink:'conditions d\'utilisation',aboutDmcaLink:'avis de droit d\'auteur',aboutStatusLink:'statut',
    qrTitle:'ENVOYER SUR TÉLÉPHONE',qrHint:'scannez le code qr avec votre téléphone',
    remuxInfo1:'<strong>que fait le remux ?</strong> corrige les problèmes du conteneur du fichier.',
    remuxInfo2:'<strong>sans perte :</strong> copie les données du codec dans un nouveau conteneur sans réencodage.',
    plQueueTitle:'téléchargement de la playlist',
    plQueueQueued:'en attente',plQueueDownloadingItem:'téléchargement...',plQueueItemDone:'terminé',plQueueItemErr:'erreur',
    plQueueCompletedWord:'terminé',plQueueStopBtn:'arrêter',plQueueCloseBtn:'fermer',
    plQueueStoppedMsg:'téléchargement de la playlist arrêté',plQueueDoneMsg:'téléchargement de la playlist terminé',plQueueStoppingMsg:'arrêt en cours — le téléchargement actuel va se terminer',
    historyRedownload:'retélécharger',historyCopyLink:'copier le lien',historyClearedMsg:'historique effacé',
    bulkNeedLink:'entrez au moins un lien',bulkMaxLinks:'10 liens maximum à la fois',bulkSuccessWord:'réussi',bulkFailWord:'échoué',
    langComingSoon:'cette langue arrive bientôt 🚧',
    updBadge:'RÉCENT',
  },
  de:{
    placeholder:'video-link hier einfügen…',bulkPlaceholder:'links einfügen, einen pro Zeile... (Enter zum Herunterladen, Umschalt+Enter für neue Zeile)',modeAutoTxt:'auto',modeAudioTxt:'audio',modeMuteTxt:'stumm',paste:'einfügen',
    vcDl:'herunterladen',dlBtn:'herunterladen',dlCancel:'abbrechen',
    bbSave:'speichern',bbHistory:'verlauf',bbRemux:'remux',bbConvert:'konvertieren',bbSettings:'einstellungen',bbUpdates:'neuigkeiten',bbAbout:'über',bbMore:'mehr',bbDonate:'unterstützen',
    accDefault:'klassisch',accDefaultDesc:'eisblau · ausgewogen',accPurple:'neon-lila',accPurpleDesc:'elektrisches lila · weltraum',accGray:'graphit',accGrayDesc:'neutrales grau · minimal',accPink:'neon-pink',accPinkDesc:'lebendiges pink · warm',accCobalt:'kobaltblau',accCobaltDesc:'tiefblau · fokussiert',
    saveTitleTxt:'wie möchtest du speichern?',saveDlTxt:'herunterladen',saveShareTxt:'teilen',saveCopyTxt:'kopieren',
    saveNoteTxt:'wenn dein browser das pop-up blockiert, nutze den "herunterladen"-button.',saveDoneTxt:'fertig',
    stModalTitle:'einstellungen',stModalSubtitle:'download-erlebnis anpassen',stNavVideo:'video',stNavAudio:'audio',stNavAppearance:'erscheinungsbild',stNavMeta:'metadaten',stNavFilename:'dateiname',stNavClose:'schließen',
    stLblQuality:'videoqualität',stNoteQuality:'die bevorzugte qualität wird gewählt; falls nicht verfügbar, wird die nächstliegende genutzt.',
    stLblCodec:'youtube-codec',stNoteCodec:'h264: maximale kompatibilität · av1: beste qualität, 8k & hdr · vp9: qualität nahe an av1',
    stLblVFmt:'videoformat',stLblAFmt:'audioformat',stNoteAFmt:'flac, wav: verlustfrei · mp3, ogg, opus, m4a: verlustbehaftet',
    stLblBitrate:'audio-bitrate',stNoteBitrate:'gilt nur für verlustbehaftete formate.',
    stLblTheme:'design',themeAuto:'auto',themeLight:'hell',themeDark:'dunkel',
    stNoteTheme:'das auto-design folgt dem anzeigemodus deines geräts.',
    stLblLang:'sprache',stNoteLang:'sprache der oberfläche. wird automatisch vom browser erkannt.',
    stLblAccent:'farbthema',stNoteAccent:'das thema ändert hintergrund, flächen, leuchten und interaktionsfarben gemeinsam.',
    stLblMeta:'datei-metadaten',stMetaName:'metadaten einbetten',stMetaDesc:'titel, künstler und plattform werden in die datei eingebettet.',
    stSbName:'SponsorBlock',stSbDesc:'schneidet sponsor-/werbeabschnitte automatisch aus dem video (YouTube).',
    stSubName:'untertitel einbetten',stSubDesc:'bettet Untertitel ins Video ein, falls verfügbar (zuerst Türkisch, sonst Englisch).',
    stLblFnf:'dateinamenformat',stNoteFnf:'der dateiname wird vor dem download nach diesem muster erstellt.',
    stLblFnfEx:'beispielformate',
    connecting:'verbinde...',downloading:'lädt herunter...',merging:'wird zusammengeführt...',done:'fertig!',
    found:'video gefunden ✓',downloaded:'heruntergeladen ✓',cancelled:'abgebrochen',error:'fehler',
    convTitleTxt:'konvertieren',convModalSub:'datei in das gewünschte format umwandeln',convDropTitle:'datei auswählen oder ablegen',convDropSub:'mp4, webm, mkv, mp3, flac, wav...',
    convFmtLabel:'AUSGABEFORMAT WÄHLEN',convBtnSel:'datei auswählen',convBtnReady:'in {fmt} konvertieren',
    remuxTitleTxt:'remux',remuxModalSub:'container ohne neu-encoding reparieren',remuxDropTitle:'datei per drag & drop oder auswählen',remuxDropSub:'unterstützt: mp4, webm, mp3, ogg, opus, wav, m4a',
    updTitle:'neuigkeiten',
    servicesChipTxt:'unterstützte dienste',servicesTitleTxt:'unterstützte plattformen',servicesModalSub:'22 plattformen · ein link',
    servicesNoteTxt:'die unterstützung einer plattform bedeutet keine zusammenarbeit über die technische kompatibilität hinaus.',
    clipHintTxt:'ein link wurde in deiner zwischenablage gefunden — möchtest du ihn einfügen?',
    ytWarn:'youtube-unterstützung ist aktiv — einige videos können von youtube-zugriffsbeschränkungen betroffen sein.',
    ytErrTitle:'youtube-video nicht gefunden',ytErrTxt:'youtubes bot-erkennung ist möglicherweise aktiv. bitte warte ein paar minuten und versuche es erneut.',
    enterLink:'zuerst einen link eingeben',connErr:'verbindungsfehler',igBusy:'instagram ist ausgelastet, 2-3 min warten',
    errYoutubeRestricted:'youtube hat diesen download nicht zugelassen. warte einige minuten und versuche es erneut.',errFormatUnavailable:'das gewählte format ist nicht verfügbar. versuche ein anderes format oder eine andere qualität.',
    errRateLimited:'zu viele anfragen wurden gesendet. warte kurz und versuche es erneut.',errServerBusy:'der server ist derzeit ausgelastet. versuche es gleich erneut.',errTimeout:'der vorgang hat zu lange gedauert. bitte versuche es erneut.',errFileTooLarge:'die datei überschreitet die erlaubte größe.',
    errPrivate:'dieses video ist privat und kann nicht heruntergeladen werden.',errUnavailable:'dieses video ist derzeit nicht verfügbar.',errLive:'livestreams werden derzeit nicht unterstützt.',errUnsupported:'dieser link oder diese plattform wird nicht unterstützt.',
    errPlatformRestricted:'die plattform hat diesen download nicht zugelassen. versuche es später erneut.',errNetwork:'ein verbindungsproblem ist aufgetreten. versuche es erneut.',errGeneric:'der vorgang konnte nicht abgeschlossen werden. bitte versuche es erneut.',errConversion:'die konvertierung konnte nicht abgeschlossen werden. prüfe das dateiformat.',
    remuxDone:'remux abgeschlossen',convDone:'konvertiert ✓',
    uploading:'wird hochgeladen...',converting:'wird konvertiert...',convDoneLabel:'fertig!',
    historyTitle:'downloadverlauf',clearHistoryTxt:'verlauf löschen',historyEmpty:'verlauf leer',historyLoading:'wird geladen...',
    donTitle:'zenithw unterstützen',donSub:'ein kleiner beitrag hilft ZenithW weiterzulaufen.',
    donPaparaSub:'türkei — sofortüberweisung',donCopyBtn:'kopieren',donFollowBtn:'folgen',donThanks:'danke für jede unterstützung 🙏',
    donContactName:'kontakt',donContactBtn:'e-mail senden',
    aboutWhatTitle: 'was ist zenithw?',
    aboutWhatText: 'ZenithW ist ein unabhängiges, werbefreies Tool, mit dem du Videos, Audio und Playlists von YouTube, TikTok, Instagram, X/Twitter, Reddit und vielen weiteren Plattformen herunterladen kannst. Serverseitig nutzt es <strong>yt-dlp</strong>, die weltweit fortschrittlichste Open-Source-Download-Engine — dadurch wird das Video immer direkt von der Quelle, in bestmöglicher Qualität und ohne zusätzlichen Konvertierungsverlust erfasst. Du musst nur den Link einfügen — Format und Qualität wählst du, den Rest erledigt ZenithW.',
    aboutTrustTitle: 'warum kannst du uns vertrauen?',
    aboutTrustText: 'Anders als bei klassischen Download-Seiten gibt es hier kein Werbenetzwerk, das dich verfolgt, keine gefälschten Download-Buttons, keine Weiterleitungen oder Pop-ups. Dein Downloadverlauf wird niemals auf dem Server gespeichert — er bleibt ausschließlich im Speicher deines eigenen Browsers (localStorage) und kann jederzeit mit einem Klick gelöscht werden. Der Code wird laufend auf Sicherheit überprüft: Schutz vor Path Traversal, Rate Limiting und Schutz vor gefälschten IP-Adressen sind von Anfang an vorhanden.',
    aboutOpenTitle: 'offener quellcode',
    aboutOpenText: 'Der gesamte Quellcode von ZenithW ist auf <a href="https://github.com/kakangeldi82-netizen/zenithw" target="_blank" style="color:var(--accent);">GitHub</a> öffentlich einsehbar und steht unter der MIT-Lizenz. Wenn du neugierig bist, was im Hintergrund passiert, ist alles Zeile für Zeile einsehbar — nichts wird versteckt. Jeder kann ihn prüfen, dazu beitragen oder sogar eine eigene Instanz betreiben.',
    queueResumeTpl:'du hast eine unvollständige Download-Warteschlange ({done}/{total} abgeschlossen) — möchtest du fortfahren?',
    aboutHowTitle: 'wie funktioniert es?',
    aboutHowText: 'Du fügst den Link ein → ZenithW analysiert das Video und zeigt dir die verfügbaren Qualitäts- und Formatoptionen → du wählst aus und lädst herunter. Video, Audio (mp3/m4a), Stumm-Modus und Massen-/Playlist-Downloads werden unterstützt; außerdem kannst du mit den integrierten Convert- und Remux-Tools bereits vorhandene Dateien bearbeiten. Der gesamte Vorgang dauert nur wenige Sekunden, ohne den Tab je zu verlassen.',
    aboutDevLabel:'entwickler',aboutContactLabel:'kontakt',aboutStackLabel:'technologie',aboutHostLabel:'hosting',aboutLicLabel:'lizenz',
    aboutPrivacyLink:'datenschutz',aboutTermsLink:'nutzungsbedingungen',aboutDmcaLink:'urheberrechtshinweis',aboutStatusLink:'status',
    qrTitle:'AUFS TELEFON SENDEN',qrHint:'qr-code mit deinem telefon scannen',
    remuxInfo1:'<strong>was macht remux?</strong> behebt probleme im dateicontainer.',
    remuxInfo2:'<strong>verlustfrei:</strong> kopiert die codec-daten in einen neuen container, ohne neu zu kodieren.',
    plQueueTitle:'playlist wird heruntergeladen',
    plQueueQueued:'wartet',plQueueDownloadingItem:'wird heruntergeladen...',plQueueItemDone:'fertig',plQueueItemErr:'fehler',
    plQueueCompletedWord:'abgeschlossen',plQueueStopBtn:'stoppen',plQueueCloseBtn:'schließen',
    plQueueStoppedMsg:'playlist-download gestoppt',plQueueDoneMsg:'playlist-download abgeschlossen',plQueueStoppingMsg:'wird gestoppt — aktueller download wird noch fertiggestellt',
    historyRedownload:'erneut herunterladen',historyCopyLink:'link kopieren',historyClearedMsg:'verlauf gelöscht',
    bulkNeedLink:'mindestens einen link eingeben',bulkMaxLinks:'maximal 10 links gleichzeitig',bulkSuccessWord:'erfolgreich',bulkFailWord:'fehlgeschlagen',
    langComingSoon:'diese sprache kommt bald 🚧',
    updBadge:'NEU',
  }
};
function t(k){return(TX[LANG]||TX.tr)[k]||(TX.tr[k]||k);}
function detectLang(){const l=(navigator.language||'tr').slice(0,2).toLowerCase();return['en','fr','de'].includes(l)?l:'tr';}


function applyLang(){
  document.documentElement.lang=LANG;
  // All elements with matching IDs
  const ids=Object.keys(TX.tr);
  ids.forEach(k=>{const el=document.getElementById(k);if(el){if(el.tagName==='INPUT')el.placeholder=t(k);else el.innerHTML=t(k);}});
  // Any input/textarea explicitly tagged for placeholder translation (key may differ from element id)
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=t(el.getAttribute('data-i18n-ph'));});
  // "diğer" (more) popup menu items — not covered by the id-matching loop above
  const miR=document.getElementById('moreItemRemux');if(miR)miR.textContent=t('bbRemux');
  const miS=document.getElementById('moreItemSettings');if(miS)miS.textContent=t('bbSettings');
  const miA=document.getElementById('moreItemAbout');if(miA)miA.textContent=t('bbAbout');
  const miD=document.getElementById('moreItemDonate');if(miD)miD.textContent=t('bbDonate');
  // Theme buttons
  const ta=document.getElementById('themeAuto');if(ta)ta.textContent=t('themeAuto');
  const tl=document.getElementById('themeLight');if(tl)tl.textContent=t('themeLight');
  const td=document.getElementById('themeDark');if(td)td.textContent=t('themeDark');
  // lang select
  const ls=document.getElementById('langSelect');if(ls)ls.value=LANG;
  // version — tek kaynaktan (version.js) otomatik, elle güncellemeye gerek yok
  const av=document.getElementById('aboutVer');
  if(av&&typeof ZW_VERSION!=='undefined'){
    const dateMap={tr:ZW_VERSION.dateTr,en:ZW_VERSION.dateEn,fr:ZW_VERSION.dateFr,de:ZW_VERSION.dateDe};
    av.textContent=ZW_VERSION.ver+' — '+(dateMap[LANG]||ZW_VERSION.dateEn);
  }
  // conv btn
  _updateConvBtn();
  // yarım kalan indirme kuyruğu varsa banner metnini güncelle
  if(typeof checkQueueResume==='function')checkQueueResume();
}

function setLang(lang){
  LANG=lang;
  try{localStorage.setItem('zw_lang',lang);}catch(e){}
  applyLang();
}

// ── SETTINGS ─────────────────────────────────────────
const S={quality:'1080',codec:'h264',vfmt:'mp4',afmt:'mp3',audioQ:'256',metadata:true,sponsorblock:false,subtitles:false,theme:'dark',fnfTemplate:'{title}.{ext}',accent:'default'};
function saveSt(){try{localStorage.setItem('zw_s',JSON.stringify(S));}catch(e){}}
function loadSt(){try{const r=localStorage.getItem('zw_s');if(r)Object.assign(S,JSON.parse(r));}catch(e){}}
function applyStUI(){
  document.querySelectorAll('#stQChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.v===S.quality));
  document.querySelectorAll('#stCodecChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.v===S.codec));
  document.querySelectorAll('#stVFmtChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.v===S.vfmt));
  document.querySelectorAll('#stAFmtChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.v===S.afmt));
  document.querySelectorAll('#stAQChips .chip').forEach(c=>c.classList.toggle('active',c.dataset.v===S.audioQ));
  document.querySelectorAll('#stAccentChips .accent-option').forEach(option=>{
    const selected=option.dataset.v===(S.accent||'default');
    option.classList.toggle('active',selected);
    option.setAttribute('aria-pressed',String(selected));
  });
  const tm=document.getElementById('togMetadata');if(tm){tm.classList.toggle('on',!!S.metadata);tm.setAttribute('aria-checked',String(!!S.metadata));}
  const tsb=document.getElementById('togSponsorblock');if(tsb){tsb.classList.toggle('on',!!S.sponsorblock);tsb.setAttribute('aria-checked',String(!!S.sponsorblock));}
  const tsu=document.getElementById('togSubtitles');if(tsu){tsu.classList.toggle('on',!!S.subtitles);tsu.setAttribute('aria-checked',String(!!S.subtitles));}
  ['Auto','Light','Dark'].forEach(n=>{const b=document.getElementById('theme'+n);if(b)b.classList.toggle('active',S.theme===n.toLowerCase());});
  const fi=document.getElementById('fnfInput');if(fi){fi.value=S.fnfTemplate||'{title}.{ext}';updateFnfPreview();}
}

// ── THEME ─────────────────────────────────────────────
function setTheme(th){
  if(!['auto','light','dark'].includes(th))th='dark';
  S.theme=th;saveSt();
  ['Auto','Light','Dark'].forEach(n=>{const b=document.getElementById('theme'+n);if(b)b.classList.toggle('active',th===n.toLowerCase());});
  let isLight;
  if(th==='auto'){isLight=!window.matchMedia('(prefers-color-scheme:dark)').matches;}
  else{isLight=(th==='light');}
  document.body.classList.toggle('light',isLight);
  // html arkaplanini da senkron tut: iOS rubber-band sirasinda
  // html'in arkaplani gorunur oluyor, body.light'taki --bg'yi
  // miras alamadigi icin ayrica isaretliyoruz.
  document.documentElement.classList.toggle('light',isLight);
  syncBrowserThemeColor(isLight);
}
function setAccent(acc){
  const themes=['default','purple','gray','pink','cobalt'];
  if(!themes.includes(acc))acc='default';
  S.accent=acc;saveSt();
  document.querySelectorAll('#stAccentChips .accent-option').forEach(option=>{
    const selected=option.dataset.v===acc;
    option.classList.toggle('active',selected);
    option.setAttribute('aria-pressed',String(selected));
  });
  document.body.classList.remove('theme-default','theme-purple','theme-gray','theme-pink','theme-cobalt');
  document.body.classList.add('theme-'+acc);
  syncBrowserThemeColor(document.body.classList.contains('light'));
}
function syncBrowserThemeColor(isLight){
  const dark={default:'#07090d',purple:'#0b0410',gray:'#080808',pink:'#0f0509',cobalt:'#040a16'};
  const light={default:'#eef6fb',purple:'#f7f1fb',gray:'#f3f3f3',pink:'#fff2f7',cobalt:'#eef4ff'};
  const palette=isLight?light:dark;
  const color=palette[S.accent]||palette.default;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',color);
}

// ── MOBILE KEYBOARD FIX (Chrome/Android) ──
// Android Chrome, klavye acilip kapanirken layout viewport'u gec/yanlis
// hesaplayabiliyor; bu da position:fixed;bottom:0 olan .bottom-bar'in
// bir anlik yanlis konumda gorunmesine ("kayma") sebep oluyor.
// visualViewport API ile klavyenin kapladigi alani olcup navbar'i
// translateY ile manuel pinliyoruz. Bu, interactive-widget=resizes-content
// destekleyen yeni Chrome'larda no-op'a yakin calisir (offset ~0),
// eski Chrome'larda ise gercek duzeltmeyi saglar.
(function(){
  const bar=document.querySelector('.bottom-bar');
  if(!bar||!window.visualViewport)return;
  const vv=window.visualViewport;
  let raf=null;
  function apply(){
    raf=null;
    const covered=Math.max(0,(window.innerHeight-vv.height-vv.offsetTop));
    bar.style.transform=covered>2?`translateY(-${covered}px)`:'';
  }
  function onVVChange(){
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(apply);
  }
  vv.addEventListener('resize',onVVChange);
  vv.addEventListener('scroll',onVVChange);
})();

socket.on('connect',()=>{socketId=socket.id;});
socket.on('disconnect',()=>{socketId=null;});
socket.on('progress',d=>{
  if(d.status==='downloading')setProgress(d.percent,t('downloading'),d.speed,false);
  else if(d.status==='merging')setProgress(88,t('merging'),'',false);
  else if(d.status==='queued')setProgress(3,d.message||t('queued'),'',false);
  else if(d.status==='done')setProgress(100,t('done'),'',true);
  else if(d.status==='error')toast(publicErrorMessage(d,0,videoInfo.url||document.getElementById('urlInput')?.value||''),'#ed4245');
});

// ── MODE ──────────────────────────────────────────────
let DL_MODE='auto';
let BULK_MODE=false;
function setMode(m){DL_MODE=m;['Auto','Audio','Mute'].forEach(n=>{const b=document.getElementById('mode'+n);if(b)b.classList.toggle('active',n.toLowerCase()===m);});if(videoInfo.url)openDlModal();}
function toggleBulkMode(){
  BULK_MODE=!BULK_MODE;
  const form=document.querySelector('.url-form');
  const toggle=document.getElementById('bulkToggle');
  const goBtn=document.querySelector('.url-go-btn');
  form.classList.toggle('bulk-mode',BULK_MODE);
  toggle.classList.toggle('active',BULK_MODE);
  if(BULK_MODE){
    goBtn.onclick=fetchBulkVideos;
    goBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3v13M5 16l7 5 7-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }else{
    goBtn.onclick=fetchVideo;
    goBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>';
  }
}

// ── SERVICES ──────────────────────────────────────────
function toggleServices(){
  const o=document.getElementById('servicesOverlay');
  const isOpen=o.classList.contains('open');
  const c=document.getElementById('servicesChip');
  if(isOpen){closeOverlay('servicesOverlay');c.classList.remove('open');}
  else{o.classList.add('open');lockPageScroll();c.classList.add('open');}
}

// ── MORE MENU ─────────────────────────────────────────
function toggleMoreMenu(){const b=document.getElementById('moreBtn'),p=document.getElementById('morePopup'),o=p.classList.contains('open');p.classList.toggle('open',!o);b.classList.toggle('active',!o);}
document.addEventListener('click',e=>{const b=document.getElementById('moreBtn'),p=document.getElementById('morePopup');if(b&&p&&!b.contains(e.target)&&!p.contains(e.target)){p.classList.remove('open');b.classList.remove('active');}});

// ── RADAR PULSE — fires once each time a fresh, valid link is detected ──
let lastRadarUrl='';
function fireRadar(){
  const ring=document.getElementById('radarRing');
  if(!ring)return;
  ring.classList.remove('fire');
  void ring.offsetWidth; // restart animation
  ring.classList.add('fire');
  // The cat gets briefly excited too — big eyes, perked ears
  const wrap=document.getElementById('urlCatWrap');
  if(wrap){
    wrap.classList.remove('bored','rare-yawn','rare-lookback');
    wrap.classList.add('excited');
    setTimeout(()=>wrap.classList.remove('excited'),900);
  }
}

// ── CAT BORED (10s Idle Paw Nibble Easter Egg) ──
let catIdleTimer = null;
function resetCatTimer(){
  const wrap=document.getElementById('urlCatWrap');
  if(wrap)wrap.classList.remove('bored','rare-yawn','rare-lookback');
  if(catIdleTimer)clearTimeout(catIdleTimer);
  catIdleTimer=setTimeout(()=>{
    const val=document.getElementById('urlInput')?.value.trim();
    if(val||!wrap)return;
    const roll=Math.random();
    // ~2% of the time, something rarer than the usual paw-nibble shows up
    if(roll<0.01)wrap.classList.add('rare-yawn');
    else if(roll<0.02)wrap.classList.add('rare-lookback');
    else wrap.classList.add('bored');
  },10000); // 10 seconds
}

// ── CAT SPEECH BUBBLE (click to hear something) ──
const CAT_LINES={
  tr:['miyav 🐾','linki at, ben hallederim','beni okşadın mı şimdi?','pat pat istiyorum','hazır mısın?','naaav','şşt, bir link kokusu alıyorum'],
  en:['meow 🐾','paste a link, i got this','did you just pet me?','pspsps','ready when you are','psst, i smell a link']
};
let catBubbleTimer=null;
function catSpeak(){
  const bubble=document.getElementById('catBubble');
  if(!bubble)return;
  const lines=CAT_LINES[LANG]||CAT_LINES.en;
  bubble.textContent=lines[Math.floor(Math.random()*lines.length)];
  // Balon varsayılan olarak kedinin tam ortasına hizalanıyor (CSS: left:50%),
  // ama kedi sağ kenara yakın oturduğu için uzun/geniş bir replik ekranın
  // dışına taşabilir. Animasyon başlamadan ÖNCE gerçek genişliğe göre ölçüp
  // `left`'i içeri çekiyoruz (transform'a değil left'e dokunuyoruz, çünkü
  // pop animasyonu zaten kendi transform'unu kullanıyor — böylece ne bir
  // "sıçrama" oluyor ne de html/body seviyesinde yatay taşma kalıyor,
  // eskiden navbar/chip'in kaymasına sebep olan da buydu).
  bubble.style.left='50%';
  const r=bubble.getBoundingClientRect();
  const margin=8;
  let shift=0;
  if(r.right>innerWidth-margin)shift=(innerWidth-margin)-r.right;
  else if(r.left<margin)shift=margin-r.left;
  bubble.style.left=shift?`calc(50% + ${shift}px)`:'50%';
  bubble.classList.remove('show');
  void bubble.offsetWidth; // restart animation
  bubble.classList.add('show');
  if(catBubbleTimer)clearTimeout(catBubbleTimer);
  catBubbleTimer=setTimeout(()=>bubble.classList.remove('show'),1600);
}

// ── URL ───────────────────────────────────────────────
function isYT(u){return u.includes('youtube.com')||u.includes('youtu.be');}
function isValidUrl(u){try{const p=new URL(u);return p.protocol==='http:'||p.protocol==='https:';}catch(e){return false;}}
function onInput(){
  if(infoController){infoController.abort();infoController=null;}
  infoSequence++;
  resetCatTimer();
  const v=document.getElementById('urlInput').value;
  document.getElementById('urlClear').classList.toggle('vis',v.length>0);
  document.getElementById('ytWarn').classList.toggle('show',isYT(v));
  document.getElementById('errorWrap').classList.remove('show');
  document.getElementById('videoCard').classList.remove('show');
  document.getElementById('playlistCard').classList.remove('show');
  hideQR();videoInfo={};
  document.getElementById('urlSpinWrap').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--text3)"><circle cx="12" cy="12" r="10"/></svg>';
  const trimmed=v.trim();
  if(trimmed&&isValidUrl(trimmed)&&trimmed!==lastRadarUrl){lastRadarUrl=trimmed;fireRadar();}
  if(!trimmed)lastRadarUrl='';
}
function clearUrl(){document.getElementById('urlInput').value='';document.getElementById('urlTextarea').value='';onInput();document.getElementById('urlInput').focus();}

// ── BULK DOWNLOAD ───────────────────────────────────
async function fetchBulkVideos(){
  const textarea=document.getElementById('urlTextarea');
  const urls=textarea.value.split('\n').map(u=>u.trim()).filter(u=>u&&u.startsWith('http'));
  if(urls.length===0){toast(t('bulkNeedLink'),'#ed4245');return;}
  if(urls.length>10){toast(t('bulkMaxLinks'),'#f59e0b');return;}
  
  const successCount=[];
  const failCount=[];
  
  for(let i=0;i<urls.length;i++){
    const url=urls[i];
    document.getElementById('urlSpinWrap').innerHTML=`<div style="font-size:10px;color:var(--text2)">${i+1}/${urls.length}</div>`;
    try{
      // Bulk deliberately skips /info: /download already extracts the title and
      // prepares the file, so each item costs one backend/upstream job.
      const result=await startDownload({bulk:true,url});
      if(result.ok)successCount.push(url);
      else failCount.push(url);
    }catch(e){
      failCount.push(url);
    }
    await new Promise(r=>setTimeout(r,1000));
  }
  
  document.getElementById('urlSpinWrap').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--text3)"><circle cx="12" cy="12" r="10"/></svg>';
  toast(`${successCount.length} ${t('bulkSuccessWord')}, ${failCount.length} ${t('bulkFailWord')}`,successCount.length>0?'#3bba64':'#ed4245');
  textarea.value='';
  toggleBulkMode();
}
function showErr(icon,msg){document.getElementById('errIcon').textContent=icon;document.getElementById('errTxt').textContent=msg;document.getElementById('errorWrap').classList.add('show');}
const PUBLIC_ERROR_TX={
  youtube_restricted:'errYoutubeRestricted',format_unavailable:'errFormatUnavailable',
  private_video:'errPrivate',copyright_restricted:'errPlatformRestricted',age_restricted:'errUnavailable',video_unavailable:'errUnavailable',live_not_supported:'errLive',
  instagram_ratelimit:'igBusy',platform_restricted:'errPlatformRestricted',unsupported_url:'errUnsupported',playlist_not_supported:'errUnsupported',video_too_long:'errUnavailable',
  network_error:'errNetwork',request_timeout:'errTimeout',file_too_large:'errFileTooLarge',server_busy:'errServerBusy',conversion_failed:'errConversion',remux_incompatible:'errConversion',request_failed:'errGeneric'
};
function publicErrorMessage(payload,status,url){
  const code=payload&&payload.error_code;
  if(code&&PUBLIC_ERROR_TX[code])return t(PUBLIC_ERROR_TX[code]);
  if(status===429)return t('errRateLimited');
  if(status===503)return t('errServerBusy');
  if(status===504)return t('errTimeout');
  if(isYT(url||''))return t('errYoutubeRestricted');
  return t('errGeneric');
}
function showPublicError(payload,status,url,inline){
  const msg=publicErrorMessage(payload,status,url);
  if(inline)showErr('!',msg);else toast(msg,'#ed4245');
}
async function pasteAndFetch(){try{const tx=await navigator.clipboard.readText();if(tx){document.getElementById('urlInput').value=tx;onInput();if(tx.startsWith('http'))fetchVideo();}}catch(e){document.getElementById('urlInput').focus();}}

// ── panoyu otomatik algılama ──
// Sekme yeniden odaklanınca panoda video linkine benzer bir şey var mı diye sessizce bakar.
// Varsa küçük, kapatılabilir bir öneri çubuğu gösterir; hiçbir şeyi otomatik doldurmaz/indirmez,
// karar her zaman kullanıcıya ait. Aynı link bir kere kapatılırsa bu oturumda bir daha sorulmaz.
let _clipHintUrl='';
function _looksLikeVideoLink(s){
  if(!s||s.length>600)return false;
  s=s.trim();
  if(!/^https?:\/\//i.test(s))return false;
  if(/\s/.test(s))return false; // toplu link listesi değil, tek link olsun
  return true;
}
async function checkClipboardForLink(){
  try{
    if(document.getElementById('bulkToggle').classList.contains('active'))return;
    const ai=document.activeElement;
    if(ai&&(ai.id==='urlInput'||ai.id==='urlTextarea'))return; // kullanıcı zaten yazıyor
    if(document.getElementById('urlInput').value.trim())return; // kutuda zaten bir şey var
    if(!navigator.clipboard||!navigator.clipboard.readText)return;
    const perm=navigator.permissions&&navigator.permissions.query?await navigator.permissions.query({name:'clipboard-read'}).catch(()=>null):null;
    if(perm&&perm.state==='denied')return;
    const tx=await navigator.clipboard.readText();
    if(!_looksLikeVideoLink(tx))return;
    let dismissed=[];try{dismissed=JSON.parse(sessionStorage.getItem('zw_clip_dismissed')||'[]');}catch(e){}
    if(dismissed.includes(tx))return;
    _clipHintUrl=tx;
    let host='';try{host=new URL(tx).hostname.replace(/^www\./,'');}catch(e){}
    document.getElementById('clipHintTxt').textContent=t('clipHintTxt').replace('{host}',host||'link');
    document.getElementById('clipHint').classList.add('show');
  }catch(e){/* izin yok ya da okunamadı — sessizce vazgeç */}
}
function useClipboardHint(){
  if(!_clipHintUrl)return;
  document.getElementById('urlInput').value=_clipHintUrl;
  onInput();
  document.getElementById('clipHint').classList.remove('show');
  fetchVideo();
}
function dismissClipboardHint(){
  document.getElementById('clipHint').classList.remove('show');
  if(_clipHintUrl){
    try{
      const d=JSON.parse(sessionStorage.getItem('zw_clip_dismissed')||'[]');
      d.push(_clipHintUrl);
      sessionStorage.setItem('zw_clip_dismissed',JSON.stringify(d.slice(-10)));
    }catch(e){}
  }
  _clipHintUrl='';
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkClipboardForLink();});
window.addEventListener('focus',checkClipboardForLink);

async function fetchVideo(opts){
  opts=opts||{};
  const url=document.getElementById('urlInput').value.trim();
  // Her denemede eski sonucu temizle — bulk'ta fail olan link bir önceki
  // videoyu tekrar indirmesin / başarı sayılmasın.
  videoInfo={};
  if(!url){if(!opts.silent)toast(t('enterLink'),'#ed4245');return false;}
  if(infoController)infoController.abort();
  const controller=new AbortController();
  const sequence=++infoSequence;
  infoController=controller;
  document.getElementById('urlSpinWrap').innerHTML='<div class="spinner"></div>';
  document.getElementById('videoCard').classList.remove('show');
  document.getElementById('playlistCard').classList.remove('show');
  document.getElementById('errorWrap').classList.remove('show');
  hideQR();
  try{
    const res=await fetch(API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:controller.signal});
    const d=await res.json();
    if(sequence!==infoSequence||document.getElementById('urlInput').value.trim()!==url)return false;
    if(d.error){if(!opts.silent)showPublicError(d,res.status,url,true);return false;}

    if(d.is_playlist){
      // Toplu indirme tek video bekler; playlist bulursa bu URL fail sayılır.
      if(opts.forBulk)return false;
      renderPlaylist(d,url);
      toast((d.playlist_count||0)+' video bulundu','#3bba64');
      return true;
    }

    const m=Math.floor((d.duration||0)/60),s=String((d.duration||0)%60).padStart(2,'0');
    document.getElementById('vcTitle').textContent=d.title||'video';
    document.getElementById('vcMeta').textContent=(d.uploader||'')+(d.duration?' · '+m+':'+s:'');
    const th=document.getElementById('vcThumb');th.innerHTML=safeThumbHtml(d.thumbnail);
    document.getElementById('videoCard').classList.add('show');
    videoInfo={url,title:d.title,thumbnail:d.thumbnail,uploader:d.uploader,duration:d.duration};
    if(!opts.silent){toast(t('found'),'#3bba64');showQR(url);}
    return true;
  }catch(e){
    if(e.name!=='AbortError'&&sequence===infoSequence&&!opts.silent)showPublicError({error_code:'network_error'},0,url,true);
    return false;
  }
  finally{
    if(infoController===controller)infoController=null;
    if(sequence===infoSequence)document.getElementById('urlSpinWrap').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--text3)"><circle cx="12" cy="12" r="10"/></svg>';
  }
}

// ── PLAYLIST ──────────────────────────────────────────
let playlistItems=[],playlistSelected=new Set(),playlistTitle='';
function renderPlaylist(d,sourceUrl){
  playlistItems=d.items||[];
  playlistTitle=d.playlist_title||'Playlist';
  playlistSelected=new Set(playlistItems.map((_,i)=>i)); // varsayılan: hepsi seçili

  document.getElementById('plTitle').textContent=playlistTitle;
  document.getElementById('plMeta').textContent=playlistItems.length+' video';

  const list=document.getElementById('plList');
  list.innerHTML=playlistItems.map((it,i)=>{
    const m=Math.floor((it.duration||0)/60),s=String((it.duration||0)%60).padStart(2,'0');
    const dur=it.duration?m+':'+s:'';
    return `<div class="pl-item sel" data-idx="${i}" onclick="togglePlaylistItem(${i})">
      <div class="pl-item-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="pl-item-thumb">${safeThumbHtml(it.thumbnail)}</div>
      <div class="pl-item-info"><div class="pl-item-title">${(i+1)+'. '+escapeHtml(it.title||'video')}</div>${dur?`<div class="pl-item-dur">${dur}</div>`:''}</div>
    </div>`;
  }).join('');

  updatePlaylistSelCount();
  document.getElementById('playlistCard').classList.add('show');
}
function togglePlaylistItem(i){
  const el=document.querySelector(`.pl-item[data-idx="${i}"]`);
  if(playlistSelected.has(i)){playlistSelected.delete(i);el.classList.remove('sel');}
  else{playlistSelected.add(i);el.classList.add('sel');}
  updatePlaylistSelCount();
}
function toggleSelectAllPlaylist(){
  const allSelected=playlistSelected.size===playlistItems.length;
  if(allSelected){playlistSelected.clear();}
  else{playlistSelected=new Set(playlistItems.map((_,i)=>i));}
  document.querySelectorAll('.pl-item').forEach((el,i)=>el.classList.toggle('sel',playlistSelected.has(i)));
  updatePlaylistSelCount();
}
function updatePlaylistSelCount(){
  const n=playlistSelected.size;
  document.getElementById('plDlBtnTxt').textContent=`seçilenleri indir (${n})`;
  document.getElementById('plDlBtn').disabled=(n===0);
  document.getElementById('plSelAllBtn').textContent=(n===playlistItems.length&&n>0)?'seçimi kaldır':'tümünü seç';
}
function openPlaylistDlModal(){
  if(playlistSelected.size===0)return;
  // Playlist indirmeleri tek tek video indirme modalını kullanarak,
  // mevcut format/kalite ayarlarıyla sırayla kuyruğa alınır.
  openPlaylistQueueModal();
}

// ── PLAYLIST QUEUE (sıralı toplu indirme) ──────────────
let plQueueRunning=false,plQueueStopRequested=false;

// Kuyruk durumu localStorage'a yazılır ki sekme kapanır/yenilenirse
// (ya da "durdur"a basılırsa) kaldığın yerden devam edebilesin.
const QUEUE_STATE_KEY='zw_queue_state';
function saveQueueState(selectedIdx,doneIdx,errIdx,fmt,mode,title,items){
  try{
    localStorage.setItem(QUEUE_STATE_KEY,JSON.stringify({
      playlistTitle:title,items,selectedIdx,doneIdx,errIdx,fmt,mode,savedAt:Date.now()
    }));
  }catch(e){}
}
function clearQueueState(){try{localStorage.removeItem(QUEUE_STATE_KEY);}catch(e){}}
function loadQueueState(){
  try{
    const raw=localStorage.getItem(QUEUE_STATE_KEY);
    if(!raw)return null;
    const st=JSON.parse(raw);
    // 24 saatten eski kayıtlara güvenme — linkler bu sürede süresi dolmuş olabilir
    if(!st.savedAt||Date.now()-st.savedAt>24*60*60*1000){clearQueueState();return null;}
    if(!st.items||!st.items.length||!st.selectedIdx||!st.selectedIdx.length)return null;
    if((st.doneIdx||[]).length>=st.selectedIdx.length)return null; // zaten tamamlanmış
    return st;
  }catch(e){return null;}
}
function hideQueueResumeHint(){
  const el=document.getElementById('queueResumeHint');
  if(el)el.classList.remove('show');
}
function checkQueueResume(){
  const st=loadQueueState();
  const el=document.getElementById('queueResumeHint');
  if(!el)return;
  if(!st||plQueueRunning){el.classList.remove('show');return;}
  const done=(st.doneIdx||[]).length,total=st.selectedIdx.length;
  document.getElementById('queueResumeTxt').textContent=t('queueResumeTpl').replace('{done}',done).replace('{total}',total);
  el.classList.add('show');
}
function discardQueue(){
  clearQueueState();
  hideQueueResumeHint();
}
function resumeQueue(){
  const st=loadQueueState();
  if(!st){hideQueueResumeHint();return;}
  playlistItems=st.items;
  playlistTitle=st.playlistTitle||playlistTitle;
  const fullIdx=st.selectedIdx;
  const doneArr=st.doneIdx||[],errArr=st.errIdx||[];

  const list=document.getElementById('plQueueList');
  list.innerHTML=fullIdx.map(i=>{
    const it=playlistItems[i]||{};
    const isDone=doneArr.includes(i),isErr=errArr.includes(i);
    const statusTxt=isDone?t('plQueueItemDone'):(isErr?t('plQueueItemErr'):t('plQueueQueued'));
    const statusCls=isDone?'done':(isErr?'err':'');
    return `<div class="pl-queue-item" id="plq-${i}">
      <div class="pl-queue-title">${escapeHtml(it.title||'video')}</div>
      <div class="pl-queue-status ${statusCls}" id="plq-status-${i}">${statusTxt}</div>
    </div>`;
  }).join('');

  document.getElementById('plQueueProgress').textContent=`${doneArr.length} / ${fullIdx.length} ${t('plQueueCompletedWord')}`;
  document.getElementById('plQueueOverlay').classList.add('open');
  lockPageScroll();

  plQueueStopRequested=false;
  hideQueueResumeHint();
  runPlaylistQueue(fullIdx,doneArr,st.fmt);
}
function openPlaylistQueueModal(){
  const selectedIdx=[...playlistSelected].sort((a,b)=>a-b);
  if(selectedIdx.length===0)return;

  const list=document.getElementById('plQueueList');
  list.innerHTML=selectedIdx.map(i=>{
    const it=playlistItems[i];
    return `<div class="pl-queue-item" id="plq-${i}">
      <div class="pl-queue-title">${escapeHtml(it.title||'video')}</div>
      <div class="pl-queue-status" id="plq-status-${i}">${t('plQueueQueued')}</div>
    </div>`;
  }).join('');

  document.getElementById('plQueueProgress').textContent=`0 / ${selectedIdx.length} ${t('plQueueCompletedWord')}`;
  document.getElementById('plQueueOverlay').classList.add('open');
  lockPageScroll();

  plQueueStopRequested=false;
  hideQueueResumeHint();
  runPlaylistQueue(selectedIdx,[]);
}
async function runPlaylistQueue(fullSelectedIdx,alreadyDone,fmtOverride){
  if(plQueueRunning)return;
  plQueueRunning=true;
  await ensureSocket();
  alreadyDone=alreadyDone||[];
  const doneSet=new Set(alreadyDone);
  const errSet=new Set();
  const total=fullSelectedIdx.length;
  const isAudio=fmtOverride?fmtOverride.mode==='audio':(DL_MODE==='audio');
  const isMute=fmtOverride?fmtOverride.mode==='mute':(DL_MODE==='mute');
  const f=fmtOverride||{quality:S.quality,codec:S.codec,vfmt:S.vfmt,afmt:S.afmt,audioQ:S.audioQ,metadata:S.metadata,mode:DL_MODE};
  const fmt=isAudio?f.afmt:f.vfmt;

  saveQueueState(fullSelectedIdx,[...doneSet],[...errSet],f,f.mode,playlistTitle,playlistItems);

  for(const i of fullSelectedIdx){
    if(doneSet.has(i))continue; // resume'de zaten tamamlanmışsa tekrar indirme
    if(plQueueStopRequested)break;
    const it=playlistItems[i];
    const statusEl=document.getElementById(`plq-status-${i}`);
    if(statusEl){statusEl.classList.remove('err');statusEl.textContent=t('plQueueDownloadingItem');}
    try{
      const dId=crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
      const filename=buildFilename(S.fnfTemplate||'{title}.{ext}',{title:it.title,uploader:'',url:it.url},fmt);
      const res=await fetch(API+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:it.url,quality:f.quality,format:fmt,codec:f.codec,audioQ:f.audioQ,metadata:f.metadata,sid:socketId,download_id:dId,download_name:filename,audio_only:isAudio,mute:isMute,sponsorblock:!!S.sponsorblock,subtitles:!!S.subtitles,sub_langs:['tr','en']})});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){
        errSet.add(i);
        if(statusEl){statusEl.textContent=t('plQueueItemErr');statusEl.classList.add('err');}
      }else{
        if(!payload.download_url)throw new Error('Download file was not prepared');
        triggerNativeDownload(payload.download_url);
        addToLocalHistory({url:it.url,title:it.title||'video',platform:getPlatformName(it.url||''),format:fmt});
        doneSet.add(i);errSet.delete(i);
        if(statusEl){statusEl.textContent=t('plQueueItemDone');statusEl.classList.remove('err');statusEl.classList.add('done');}
      }
    }catch(e){
      errSet.add(i);
      if(statusEl){statusEl.textContent=t('plQueueItemErr');statusEl.classList.add('err');}
    }
    document.getElementById('plQueueProgress').textContent=`${doneSet.size} / ${total} ${t('plQueueCompletedWord')}`;
    saveQueueState(fullSelectedIdx,[...doneSet],[...errSet],f,f.mode,playlistTitle,playlistItems);
  }

  plQueueRunning=false;
  if(plQueueStopRequested){
    // Kasıtlı durdurma — kayıt silinmiyor, kullanıcı istediğinde "devam et" ile kaldığı yerden sürdürebilir.
    toast(t('plQueueStoppedMsg'),'#f59e0b');
  }else{
    toast(t('plQueueDoneMsg'),'#3bba64');
    clearQueueState();
  }
  const plqct=document.getElementById('plQueueCancelTxt');if(plqct)plqct.textContent=t('plQueueCloseBtn');
  checkQueueResume();
  scheduleSocketDisconnect();
}
function triggerNativeDownload(path){
  if(!path)return;
  const a=document.createElement('a');
  a.href=path.startsWith('http')?path:API+path;document.body.appendChild(a);a.click();
  document.body.removeChild(a);
}
const BLOB_SAVE_LIMIT=32*1024*1024;
async function handoffPreparedDownload(payload,allowSaveModal){
  if(!payload||!payload.download_url)throw new Error('Download file was not prepared');
  if(allowSaveModal&&Number(payload.size)>0&&Number(payload.size)<=BLOB_SAVE_LIMIT){
    const transfer=await fetch(payload.download_url.startsWith('http')?payload.download_url:API+payload.download_url);
    if(!transfer.ok)throw new Error('Prepared download expired');
    openSaveModal(await transfer.blob(),payload.filename||'download');
    return 'save-modal';
  }
  triggerNativeDownload(payload.download_url);
  return 'native';
}
function cancelPlaylistQueue(){
  if(plQueueRunning){
    plQueueStopRequested=true;
    toast(t('plQueueStoppingMsg'),'#f59e0b');
  }else{
    closePlaylistQueue();
  }
}
function closePlaylistQueue(){
  if(plQueueRunning){
    plQueueStopRequested=true;
  }
  document.getElementById('plQueueOverlay').classList.remove('open');
  unlockPageScrollIfIdle();
  const plqct2=document.getElementById('plQueueCancelTxt');if(plqct2)plqct2.textContent=t('plQueueStopBtn');
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('urlInput').addEventListener('keydown',e=>{if(e.key==='Enter')fetchVideo();});
  document.getElementById('urlInput').addEventListener('paste',()=>setTimeout(()=>{const v=document.getElementById('urlInput').value;onInput();if(v.startsWith('http'))fetchVideo();},80));
  document.getElementById('urlTextarea').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();fetchBulkVideos();}
  });
  checkQueueResume();
});

function showYtErr(){const p=document.getElementById('ytPopup');p.classList.add('show');if(ytErrTimer)clearTimeout(ytErrTimer);ytErrTimer=setTimeout(()=>p.classList.remove('show'),4500);}

// ── QR ────────────────────────────────────────────────
// URL'leri üçüncü taraf bir QR servisine göndermemek için otomatik QR üretimi
// kapalıdır. Yerel bir QR üretici eklendiğinde bu fonksiyon yeniden açılabilir.
function showQR(){hideQR();}
function hideQR(){document.getElementById('qrWrap').classList.remove('show');}

// ── DL MODAL ─────────────────────────────────────────
function openDlModal(){
  if(!videoInfo.url)return;
  const th=document.getElementById('dlThumb');th.innerHTML=safeThumbHtml(videoInfo.thumbnail);
  document.getElementById('dlVTitle').textContent=videoInfo.title||'video';
  const m=Math.floor((videoInfo.duration||0)/60),s=String((videoInfo.duration||0)%60).padStart(2,'0');
  document.getElementById('dlVMeta').textContent=(videoInfo.uploader||'')+(videoInfo.duration?' · '+m+':'+s:'');
  resetProgress();document.getElementById('dlOverlay').classList.add('open');lockPageScroll();
}
function setProgress(pct,label,speed,done){
  document.getElementById('dlProgWrap').classList.add('show');
  document.getElementById('dlBarFill').style.width=pct+'%';
  document.getElementById('dlProgPct').textContent=pct+'%';
  document.getElementById('dlProgLabel').textContent=label;
  document.getElementById('dlProgSpeed').textContent=speed||'';
  if(done){document.getElementById('dlProgIcon').classList.add('done');document.getElementById('dlProgIcon').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';document.getElementById('dlCancel').classList.remove('vis');}
}
function resetProgress(){
  document.getElementById('dlProgWrap').classList.remove('show');
  document.getElementById('dlBarFill').style.width='0%';
  document.getElementById('dlProgPct').textContent='0%';
  document.getElementById('dlProgLabel').textContent='';
  document.getElementById('dlProgSpeed').textContent='';
  document.getElementById('dlProgIcon').classList.remove('done');
  document.getElementById('dlProgIcon').innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v13M5 16l7 5 7-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.getElementById('dlBtn').disabled=false;
  const dbt=document.getElementById('dlBtnTxt');if(dbt)dbt.textContent=t('dlBtn');
  document.getElementById('dlCancel').classList.remove('vis');
}

async function startDownload(options={}){
  const bulk=!!options.bulk;
  const sourceInfo=bulk?{url:String(options.url||'').trim(),title:''}:videoInfo;
  if(!sourceInfo.url)return {ok:false,error_code:'invalid_url'};
  const isAudio=(DL_MODE==='audio'),isMute=(DL_MODE==='mute'),fmt=isAudio?S.afmt:S.vfmt;
  if(!bulk)await ensureSocket();
  const btn=document.getElementById('dlBtn');
  const btnTxt=document.getElementById('dlBtnTxt');
  const cancelBtn=document.getElementById('dlCancel');
  if(!bulk){
    if(btn)btn.disabled=true;
    if(btnTxt)btnTxt.innerHTML='<div class="spinner"></div>';
    if(cancelBtn)cancelBtn.classList.add('vis');
    setProgress(5,t('connecting'),'',false);
  }
  const requestId=crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
  const controller=new AbortController();
  if(!bulk){dlId=requestId;dlAbort=controller;}
  try{
    const body={url:sourceInfo.url,quality:S.quality,format:fmt,codec:S.codec,audioQ:S.audioQ,metadata:S.metadata,sid:bulk?'':socketId,download_id:requestId,audio_only:isAudio,mute:isMute,sponsorblock:!!S.sponsorblock,subtitles:!!S.subtitles,sub_langs:['tr','en']};
    if(!bulk)body.download_name=buildFilename(S.fnfTemplate||'{title}.{ext}',sourceInfo,fmt);
    const res=await fetch(API+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    if(!bulk)dlAbort=null;
    if(res.status===409)return {ok:false,error_code:'cancelled'};
    const payload=await res.json().catch(()=>({}));
    if(!res.ok){
      if(!bulk){resetProgress();showPublicError(payload,res.status,sourceInfo.url,false);}
      return {ok:false,error_code:payload.error_code||'request_failed',status:res.status};
    }
    // Batch items always use native handoff; a later item cannot replace a
    // small-file Blob waiting in the save modal.
    const handoff=await handoffPreparedDownload(payload,!bulk);
    addToLocalHistory({url:sourceInfo.url,title:sourceInfo.title||payload.filename||'video',platform:getPlatformName(sourceInfo.url||''),format:fmt});
    if(!bulk){
      resetProgress();closeOverlay('dlOverlay');
      if(handoff==='save-modal')lockPageScroll();
      else{toast(t('downloaded'),'#3bba64');fireConfetti();}
    }
    return {ok:true,payload,handoff};
  }catch(e){
    if(!bulk){
      dlAbort=null;resetProgress();
      if(e.name!=='AbortError')showPublicError({error_code:'network_error'},0,sourceInfo.url,false);
    }
    return {ok:false,error_code:e.name==='AbortError'?'cancelled':'network_error'};
  }
  finally{if(!bulk)scheduleSocketDisconnect();}
}
async function cancelDownload(){
  if(dlAbort){dlAbort.abort();dlAbort=null;}
  if(dlId){try{fetch(API+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({download_id:dlId,sid:socketId})});}catch(e){}dlId=null;}
  resetProgress();toast(t('cancelled'),'#f59e0b');scheduleSocketDisconnect();
}

// ── SAVE MODAL ────────────────────────────────────────
// Small celebratory confetti burst — no deps, plain DOM + CSS
const CONFETTI_COLORS=['#3bba64','#ff4a97','#f59e0b','#5b8def','#ffffff'];
function fireConfetti(){
  const host=document.createElement('div');
  host.className='confetti-host';
  document.body.appendChild(host);
  const n=22;
  for(let i=0;i<n;i++){
    const p=document.createElement('span');
    p.className='confetti-piece';
    const angle=(Math.random()*140-70)*(Math.PI/180); // upward-ish spread
    const dist=80+Math.random()*120;
    const dx=Math.sin(angle)*dist;
    const dy=-Math.abs(Math.cos(angle)*dist)-40;
    p.style.setProperty('--dx',dx+'px');
    p.style.setProperty('--dy',dy+'px');
    p.style.setProperty('--rot',(Math.random()*720-360)+'deg');
    p.style.background=CONFETTI_COLORS[i%CONFETTI_COLORS.length];
    p.style.left='calc(50% + '+(Math.random()*40-20)+'px)';
    p.style.animationDelay=(Math.random()*0.12)+'s';
    host.appendChild(p);
  }
  setTimeout(()=>host.remove(),1400);
}
function releasePendingBlob(){if(pendingObjectUrl)URL.revokeObjectURL(pendingObjectUrl);pendingObjectUrl=null;pendingBlob=null;pendingFilename=null;}
function openSaveModal(blob,filename){releasePendingBlob();pendingBlob=blob;pendingFilename=filename;document.getElementById('saveOverlay').classList.add('open');lockPageScroll();}
function saveAction(type){
  if(!pendingBlob)return;
  const url=URL.createObjectURL(pendingBlob);
  pendingObjectUrl=url;
  setTimeout(()=>{URL.revokeObjectURL(url);if(pendingObjectUrl===url){pendingObjectUrl=null;pendingBlob=null;pendingFilename=null;}},60000);
  if(type==='download'){const a=document.createElement('a');a.href=url;a.download=pendingFilename;a.click();toast(t('downloaded'),'#3bba64');fireConfetti();closeOverlay('saveOverlay',true);}
  else if(type==='share'){if(navigator.share&&navigator.canShare&&navigator.canShare({files:[new File([pendingBlob],pendingFilename)]})){navigator.share({files:[new File([pendingBlob],pendingFilename)],title:pendingFilename}).catch(()=>{});fireConfetti();}else{const a=document.createElement('a');a.href=url;a.download=pendingFilename;a.click();toast(t('downloaded'),'#3bba64');fireConfetti();closeOverlay('saveOverlay',true);}}
  else if(type==='copy'){
    const fallback=()=>{const a=document.createElement('a');a.href=url;a.download=pendingFilename;a.click();toast(LANG==='en'?'Copy not supported here, downloaded instead':'Bu tarayıcıda kopyalama desteklenmiyor, indirildi','#f59e0b');closeOverlay('saveOverlay',true);};
    if(navigator.clipboard&&window.ClipboardItem){
      navigator.clipboard.write([new ClipboardItem({[pendingBlob.type]:pendingBlob})])
        .then(()=>toast(LANG==='en'?'copied!':'kopyalandı!','#3bba64'))
        .catch(fallback);
    } else { fallback(); }
  }
}

// ── FILENAME ──────────────────────────────────────────
function buildFilename(tpl,info,fmt){const now=new Date(),date=now.getFullYear()+'-'+(now.getMonth()+1).toString().padStart(2,'0')+'-'+now.getDate().toString().padStart(2,'0');return tpl.replace(/{title}/g,(info.title||'video').replace(/[<>:"/\\|?*]/g,'_')).replace(/{artist}/g,(info.uploader||'unknown').replace(/[<>:"/\\|?*]/g,'_')).replace(/{date}/g,date).replace(/{platform}/g,getPlatformName(info.url||'')).replace(/{ext}/g,fmt||'mp4');}
function getPlatformName(url){if(url.includes('youtube')||url.includes('youtu.be'))return'youtube';if(url.includes('tiktok'))return'tiktok';if(url.includes('instagram'))return'instagram';if(url.includes('twitter')||url.includes('x.com'))return'twitter';if(url.includes('soundcloud'))return'soundcloud';return'video';}
function updateFnfPreview(){const tpl=document.getElementById('fnfInput').value||'{title}.{ext}';S.fnfTemplate=tpl;saveSt();const el=document.getElementById('fnfPreview');if(el)el.textContent='Örnek: '+buildFilename(tpl,{title:'video_başlığı',uploader:'sanatçı',url:''},S.afmt||'mp3');}
function insertFnfTag(tag){const inp=document.getElementById('fnfInput');const pos=inp.selectionStart||inp.value.length;inp.value=inp.value.slice(0,pos)+tag+inp.value.slice(inp.selectionEnd||pos);inp.focus();updateFnfPreview();}
function setFnfTemplate(tpl){document.getElementById('fnfInput').value=tpl;updateFnfPreview();}

// ── SETTINGS UI ───────────────────────────────────────
function openSettings(){document.getElementById('stOverlay').classList.add('open');lockPageScroll();}
function stTab(el){document.querySelectorAll('.st-nav-btn').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-selected','false');});document.querySelectorAll('.st-page').forEach(p=>p.classList.remove('active'));el.classList.add('active');el.setAttribute('aria-selected','true');const pg=document.getElementById('stPage'+el.dataset.page.charAt(0).toUpperCase()+el.dataset.page.slice(1));if(pg)pg.classList.add('active');const content=document.querySelector('.st-content');if(content)content.scrollTop=0;}
function stChip(el,key){el.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');S[key]=el.dataset.v;saveSt();}
function stToggle(key){S[key]=!S[key];const tog=document.getElementById('tog'+key.charAt(0).toUpperCase()+key.slice(1));if(tog){tog.classList.toggle('on',S[key]);tog.setAttribute('aria-checked',String(!!S[key]));}saveSt();}

// ── REMUX ─────────────────────────────────────────────
function openRemux(){document.getElementById('remuxOverlay').classList.add('open');lockPageScroll();}
function showSelectedToolFile(dropId,f){const drop=document.getElementById(dropId);if(!drop)return;const icon=drop.querySelector('.tool-drop-icon'),title=drop.querySelector('.drop-title'),sub=drop.querySelector('.drop-sub');if(icon){icon.classList.add('selected');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/></svg>';}if(title)title.textContent=f.name;if(sub)sub.textContent=(f.size/1024/1024).toFixed(1)+' MB';}
function resetRemuxDrop(){const drop=document.getElementById('remuxDrop');if(!drop)return;const icon=drop.querySelector('.tool-drop-icon'),title=drop.querySelector('.drop-title'),sub=drop.querySelector('.drop-sub');if(icon){icon.classList.remove('selected');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/></svg>';}if(title)title.textContent=t('remuxDropTitle');if(sub)sub.textContent=t('remuxDropSub');const input=document.getElementById('remuxFileInput');if(input)input.value='';}
let remuxBusy=false;
async function handleRemuxFile(inp){
  const f=inp.files[0];if(!f||remuxBusy)return;
  const dot=f.name.lastIndexOf('.');
  const target=dot>=0?f.name.slice(dot+1).toLowerCase():'';
  const allowed=new Set(['mp4','webm','mkv','avi','mov','mp3','flac','ogg','opus','wav','m4a']);
  if(!allowed.has(target)){toast(t('errConversion'),'#ed4245');resetRemuxDrop();return;}
  remuxBusy=true;showSelectedToolFile('remuxDrop',f);toast(t('uploading'),'#5b8def');
  try{
    const base=dot>0?f.name.slice(0,dot):f.name;
    const fd=new FormData();
    fd.append('file',f);fd.append('target_format',target);fd.append('mode','remux');
    fd.append('download_name',`remuxed_${base}.${target}`);
    const res=await fetch(API+'/convert',{method:'POST',body:fd});
    const payload=await res.json().catch(()=>({}));
    if(!res.ok){showPublicError(payload.error_code?payload:{error_code:'conversion_failed'},res.status,'',false);return;}
    if(!payload.download_url)throw new Error('Remuxed file was not prepared');
    await handoffPreparedDownload(payload,true);toast(t('remuxDone'),'#3bba64');
  }catch(e){toast(t('errConversion'),'#ed4245');}
  finally{remuxBusy=false;setTimeout(resetRemuxDrop,1200);}
}
function handleRemuxDrop(e){e.preventDefault();document.getElementById('remuxDrop').classList.remove('drag');const f=e.dataTransfer.files[0];if(!f)return;handleRemuxFile({files:[f]});}

// ── CONVERT ───────────────────────────────────────────
let convFile=null,convTargetFmt='mp3';
function openConvert(){document.getElementById('convOverlay').classList.add('open');lockPageScroll();}
function setConvFmt(el){document.querySelectorAll('#convOverlay .chip').forEach(c=>c.classList.remove('active'));el.classList.add('active');convTargetFmt=el.dataset.v;_updateConvBtn();}
function handleConvFile(inp){const f=inp.files[0];if(!f)return;convFile=f;showSelectedToolFile('convDrop',f);_updateConvBtn();}
function handleConvDrop(e){e.preventDefault();document.getElementById('convDrop').classList.remove('drag');const f=e.dataTransfer.files[0];if(!f)return;convFile=f;showSelectedToolFile('convDrop',f);_updateConvBtn();}
function _updateConvBtn(){const btn=document.getElementById('convBtn'),txt=document.getElementById('convBtnTxt');if(!btn||!txt)return;if(convFile){btn.disabled=false;txt.textContent=t('convBtnReady').replace('{fmt}',convTargetFmt.toUpperCase());}else{btn.disabled=true;txt.textContent=t('convBtnSel');}}
function updateConvBtn(){_updateConvBtn();}// alias for legacy calls
async function startConvert(){
  if(!convFile)return;
  const prog=document.getElementById('convProgress'),btn=document.getElementById('convBtn'),lbl=document.getElementById('convProgLabel'),pct=document.getElementById('convProgPct');
  prog.classList.add('show');btn.disabled=true;lbl.textContent=t('uploading');pct.textContent='—';
  try{
    const dot=convFile.name.lastIndexOf('.');
    const outputName=(dot>0?convFile.name.slice(0,dot):convFile.name)+'.'+convTargetFmt;
    const fd=new FormData();fd.append('file',convFile);fd.append('target_format',convTargetFmt);fd.append('mode','auto');fd.append('download_name',outputName);
    lbl.textContent=t('converting');
    const res=await fetch(API+'/convert',{method:'POST',body:fd});
    const payload=await res.json().catch(()=>({}));
    if(!res.ok){lbl.textContent=t('errConversion');btn.disabled=false;showPublicError(payload.error_code?payload:{error_code:'conversion_failed'},res.status,'',false);return;}
    if(!payload.download_url)throw new Error('Converted file was not prepared');
    lbl.textContent=t('convDoneLabel');pct.textContent='✓';
    await handoffPreparedDownload(payload,true);
    toast(t('convDone'),'#3bba64');
    setTimeout(()=>{prog.classList.remove('show');btn.disabled=false;_updateConvBtn();},1500);
  }catch(e){lbl.textContent=t('errConversion');btn.disabled=false;toast(t('errConversion'),'#ed4245');}
}

// ── OVERLAYS ─────────────────────────────────────────
let pageScrollLockY=0;
function lockPageScroll(){
  if(document.documentElement.classList.contains('modal-open'))return;
  pageScrollLockY=window.scrollY||document.documentElement.scrollTop||0;
  document.body.style.top=`-${pageScrollLockY}px`;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}
function unlockPageScrollIfIdle(){
  if(document.querySelector('.overlay.open'))return;
  const restoreY=pageScrollLockY;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top='';
  window.scrollTo(0,restoreY);
}
function handleOverlay(e,id){if(e.target===document.getElementById(id)){if(id==='plQueueOverlay'){closePlaylistQueue();}else{closeOverlay(id);}}}
function closeOverlay(id,preservePending){document.getElementById(id).classList.remove('open');unlockPageScrollIfIdle();if(id==='servicesOverlay'){const chip=document.getElementById('servicesChip');if(chip)chip.classList.remove('open');}if(id==='saveOverlay'&&!preservePending)releasePendingBlob();}
function openDonate(){document.getElementById('donOverlay').classList.add('open');lockPageScroll();}
function openHistory(){document.getElementById('historyOverlay').classList.add('open');lockPageScroll();loadHistory();}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){['dlOverlay','stOverlay','remuxOverlay','convOverlay','donOverlay','saveOverlay','historyOverlay','servicesOverlay'].forEach(id=>closeOverlay(id));closePlaylistQueue();document.getElementById('servicesChip').classList.remove('open');}});

// ── UTILS ─────────────────────────────────────────────
function toast(msg,color){const el=document.getElementById('toast');document.getElementById('toastTxt').textContent=msg;document.getElementById('toastDot').style.background=color||'#e8e8e8';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000);}
function copyText(txt,btn){navigator.clipboard.writeText(txt).then(()=>{const o=btn.textContent;btn.textContent='✓';setTimeout(()=>btn.textContent=o,2000);});}
function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'});document.getElementById('urlInput').focus();}
function toggleAccordion(el){el.classList.toggle('open');}

// ── HISTORY (localStorage — kullanıcıya özel, sunucuda tutulmaz) ──
const HISTORY_KEY='zw_history';
const HISTORY_LIMIT=100;
function getLocalHistory(){try{const r=localStorage.getItem(HISTORY_KEY);return r?JSON.parse(r):[];}catch(e){return [];}}
function saveLocalHistory(h){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,HISTORY_LIMIT)));}catch(e){}}
function addToLocalHistory(entry){
  const h=getLocalHistory();
  h.unshift({id:(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)),timestamp:new Date().toISOString(),...entry});
  saveLocalHistory(h);
}
function loadHistory(){
  const list=document.getElementById('historyList');
  if(!list)return;
  const history=getLocalHistory();
  if(!history||history.length===0){
    list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3);font-size:12px;">'+t('historyEmpty')+'</div>';
    return;
  }
  list.innerHTML=history.map((h,hi)=>`
    <div style="background:var(--chip-bg);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:10px;background:var(--border);padding:3px 6px;border-radius:4px;color:var(--text2);text-transform:uppercase;">${escapeHtml(h.platform||'')}</span>
        <span style="font-size:10px;background:var(--border);padding:3px 6px;border-radius:4px;color:var(--text2);">${escapeHtml(h.format||'')}</span>
        <span style="font-size:10px;color:var(--text3);margin-left:auto;">${new Date(h.timestamp).toLocaleDateString()}</span>
      </div>
      <div style="font-size:12px;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(h.title||'')}</div>
      <div style="display:flex;gap:8px;">
        <button data-hidx="${hi}" onclick="reDownload(getLocalHistory()[this.dataset.hidx]?.url)" style="background:var(--btn-bg);border:none;border-radius:6px;padding:6px 10px;font-size:10px;font-weight:600;color:var(--btn-color);cursor:pointer;">${t('historyRedownload')}</button>
        <button data-hidx="${hi}" onclick="copyText(getLocalHistory()[this.dataset.hidx]?.url,this)" style="background:var(--chip-bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:10px;font-weight:600;color:var(--text2);cursor:pointer;">${t('historyCopyLink')}</button>
      </div>
    </div>
  `).join('');
}
function clearHistory(){
  saveLocalHistory([]);
  loadHistory();
  toast(t('historyClearedMsg'),'#3bba64');
}
async function reDownload(url){
  closeOverlay('historyOverlay');
  document.getElementById('urlInput').value=url;
  onInput();
  fetchVideo();
}

// ── MICRO-INTERACTION: click ripple (runs only on interaction) ──
(function(){
  const RIPPLE_SEL='.action-btn,.vc-dl,.pl-dl-btn,.url-go-btn,.dl-btn,.save-btn,.bar-btn,.mode-btn,.btn-paste,.chip,.theme-btn';
  document.addEventListener('click',e=>{
    const el=e.target.closest(RIPPLE_SEL);
    if(!el)return;
    const rect=el.getBoundingClientRect();
    const d=Math.max(rect.width,rect.height);
    const r=document.createElement('span');
    r.className='ripple';
    r.style.width=r.style.height=d+'px';
    r.style.left=(e.clientX-rect.left-d/2)+'px';
    r.style.top=(e.clientY-rect.top-d/2)+'px';
    if(getComputedStyle(el).position==='static')el.style.position='relative';
    el.style.overflow=el.style.overflow||'hidden';
    el.appendChild(r);
    setTimeout(()=>r.remove(),650);
  });
})();

// ── INIT ──────────────────────────────────────────────
(function init(){
  loadSt();
  try{const sl=localStorage.getItem('zw_lang');if(sl)LANG=sl;else LANG=detectLang();}catch(e){LANG=detectLang();}
  applyStUI();
  setTheme(S.theme||'dark');
  setAccent(S.accent||'default');
  applyLang(); // LAST — after all functions are defined
  resetCatTimer();
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(S.theme==='auto')setTheme('auto');});
})();