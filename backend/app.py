from gevent import monkey
monkey.patch_all()

import logging
import re
import os
import uuid
import threading
import time
import subprocess
import atexit
import shutil
import secrets
import socket
import ipaddress
import tempfile
from collections import defaultdict, OrderedDict
from urllib.parse import urlparse

from flask import Flask, request, jsonify, send_file, g
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.middleware.proxy_fix import ProxyFix

import yt_dlp
import gevent
import psutil

# ── Logging ─────────────────────────────────────────────
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("zenithw")

logging.getLogger("engineio").setLevel(logging.WARNING)
logging.getLogger("socketio").setLevel(logging.WARNING)
logging.getLogger("werkzeug").setLevel(logging.WARNING)

# ── Flask App ──────────────────────────────────────────
app = Flask(__name__, static_folder=None)

# Railway/Cloudflare arkasında çalışırken gerçek client IP'sini almak için
# ProxyFix middleware. Railway'in internal proxy IP'leri yerine X-Forwarded-For
# zincirinin başındaki (Cloudflare) IP'sini kullanır.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# SECRET_KEY: Production'da mutlaka env variable ile sabit değer set edilmeli.
# Set edilmezse her restart'ta session'lar geçersiz olur.
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if os.environ.get("FLASK_ENV") == "development" or os.environ.get("ALLOW_INSECURE_KEY"):
        SECRET_KEY = secrets.token_hex(32)
        logger.warning("[INIT] Using random SECRET_KEY (development mode)")
    else:
        raise RuntimeError(
            "SECRET_KEY environment variable is required in production. "
            "Set it in Railway dashboard or set FLASK_ENV=development for local dev."
        )
app.config['SECRET_KEY'] = SECRET_KEY

# /convert için maksimum upload boyutu (230 MB)
app.config['MAX_CONTENT_LENGTH'] = 230 * 1024 * 1024

# ── Constants ──────────────────────────────────────────
FFMPEG_TIMEOUT = 300          # ffmpeg subprocess timeout (mute vb.)
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("DOWNLOAD_TIMEOUT_SECONDS", 600))
MAX_CONCURRENT_PER_IP = int(os.environ.get("MAX_CONCURRENT_PER_IP", 5))
MAX_CONCURRENT_DOWNLOADS = int(os.environ.get("MAX_CONCURRENT_DOWNLOADS", 2))
MAX_VIDEO_DURATION_SECONDS = int(os.environ.get("MAX_VIDEO_DURATION_SECONDS", 90 * 60))
MAX_DOWNLOAD_SIZE_BYTES = int(os.environ.get("MAX_DOWNLOAD_SIZE_MB", 1536)) * 1024 * 1024
RATE_LIMIT_WINDOW = 60        # saniye
RATE_LIMIT_MAX_REQUESTS = 10  # istek/dakika
RATE_LIMIT_CLEANUP_INTERVAL = 60  # saniye
FILE_CLEANUP_INTERVAL = 900   # 15 dakika
FILE_MAX_AGE = 1800           # 30 dakika
PLAYLIST_LIMIT = 50

# gevent.Timeout ile durdurulamayan, yt-dlp'nin içeride spawn ettiği
# subprocess isimleri. Timeout sonrası bunlar taranıp öldürülür.
# NOT: ARIA2_PATH = None olduğu için aria2c normal şartlarda hiç spawn
# edilmiyor. "aria2c" burada bilinçli olarak duruyor: yt-dlp konfig hatası
# veya ileride yanlışlıkla aktif edilmesi durumunda ortaya çıkabilecek
# aria2c process'lerinin de reap edilebilmesi için bir güvenlik ağı.
REAPABLE_PROCESS_NAMES = {"ffmpeg", "ffprobe", "aria2c"}


def _snapshot_child_pids():
    """Şu anki process'in çocuklarının PID setini döner (timeout öncesi çağrılır)."""
    try:
        return {p.pid for p in psutil.Process(os.getpid()).children(recursive=True)}
    except Exception:
        return set()


def _reap_new_children(before_pids, download_id=None):
    """
    Timeout sonrası: before_pids'te olmayan (yani timeout süresince doğan)
    ffmpeg/ffprobe/aria2c child process'lerini bulup öldürür.
    yt-dlp bu process'leri kendi içinde subprocess.Popen ile başlattığı için
    PID'lerine doğrudan erişimimiz yok; bu yüzden process ağacını tarıyoruz.
    """
    try:
        current = psutil.Process(os.getpid()).children(recursive=True)
    except Exception:
        return
    for p in current:
        try:
            if p.pid in before_pids:
                continue
            name = (p.name() or "").lower()
            if not any(reapable in name for reapable in REAPABLE_PROCESS_NAMES):
                continue
            logger.warning(f"[REAP] killing orphaned process pid={p.pid} name={name} download_id={download_id}")
            p.kill()
            try:
                p.wait(timeout=5)
            except Exception:
                pass
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        except Exception as e:
            logger.error(f"[REAP ERR] {e}")


def _reap_all_children_on_shutdown():
    """
    Uygulama kapanırken (worker restart, deploy, SIGTERM vb.) geride kalan
    tüm ffmpeg/ffprobe/aria2c child process'lerini temizler. Sadece bu
    process'in kendi child'larını hedef alır; sistemdeki başka process'lere
    dokunmaz.
    """
    try:
        children = psutil.Process(os.getpid()).children(recursive=True)
    except Exception:
        return
    for p in children:
        try:
            name = (p.name() or "").lower()
            if not any(reapable in name for reapable in REAPABLE_PROCESS_NAMES):
                continue
            logger.warning(f"[SHUTDOWN REAP] killing pid={p.pid} name={name}")
            p.kill()
            try:
                p.wait(timeout=5)
            except Exception:
                pass
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        except Exception as e:
            logger.error(f"[SHUTDOWN REAP ERR] {e}")


atexit.register(_reap_all_children_on_shutdown)

# ── İzin verilen origin'ler ────────────────────────────
ALLOWED_ORIGINS = ["https://zenithw.space", "https://www.zenithw.space"]
if os.environ.get("FLASK_ENV") == "development" or os.environ.get("ALLOW_DEV_CORS"):
    ALLOWED_ORIGINS += ["http://localhost:5000", "http://127.0.0.1:3000"]

CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS, async_mode='gevent')

DOWNLOAD_DIR = "./downloads"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# ── Cookies ───────────────────────────────────────────
COOKIES_FILE = os.path.join(os.path.dirname(__file__), "cookies.txt")

cookies_env = os.environ.get("YOUTUBE_COOKIES") or os.environ.get("COOKIES") or os.environ.get("YOUTUBE_COOKIE")
if cookies_env:
    try:
        cookies_content = cookies_env.replace('\\n', '\n').strip()
        fd = os.open(COOKIES_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(cookies_content)
        os.chmod(COOKIES_FILE, 0o600)
        logger.info(f"[INIT] cookies.txt written from env ({len(cookies_content)} bytes)")
    except Exception as e:
        logger.warning(f"[INIT] Failed to write cookies.txt: {e}")
elif os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 10:
    try:
        os.chmod(COOKIES_FILE, 0o600)
    except Exception:
        pass
    logger.info(f"[INIT] cookies.txt found ({os.path.getsize(COOKIES_FILE)} bytes)")
else:
    logger.warning("[INIT] cookies.txt not found - YouTube downloads may be restricted")

# ── Rate limiting (TTL-based) ─────────────────────────
class TTLCache:
    """Thread-safe TTL-based cache for rate limiting."""
    def __init__(self, ttl=60, max_size=10000):
        self.ttl = ttl
        self.max_size = max_size
        self._data = OrderedDict()
        self._lock = threading.Lock()

    def _cleanup(self):
        now = time.time()
        # En eski kayıtlardan başlayarak temizle
        to_remove = []
        for key, timestamps in self._data.items():
            valid = [t for t in timestamps if now - t < self.ttl]
            if not valid:
                to_remove.append(key)
            else:
                self._data[key] = valid
        for key in to_remove:
            del self._data[key]

        # Boyut limiti aşılırsa en eski kayıtları sil
        while len(self._data) > self.max_size:
            self._data.popitem(last=False)

    def add(self, key):
        """Adds a timestamp. Returns True if under limit, False if rate limited."""
        now = time.time()
        with self._lock:
            self._cleanup()
            if key not in self._data:
                self._data[key] = []
            # En yeni kaydı sona taşı (LRU)
            self._data.move_to_end(key)
            self._data[key].append(now)
            return len(self._data[key]) <= RATE_LIMIT_MAX_REQUESTS

rate_limiter = TTLCache(ttl=RATE_LIMIT_WINDOW, max_size=10000)

# ── Client IP tespiti ─────────────────────────────────
TRUST_PROXY = os.environ.get("TRUST_PROXY", "1") != "0"

def get_client_ip():
    if TRUST_PROXY:
        # 1. Öncelik: Cloudflare'in kendi header'ı (CF-Connecting-IP)
        cf_ip = request.headers.get('CF-Connecting-IP')
        if cf_ip:
            candidate = cf_ip.strip()
            if candidate:
                return candidate
        # 2. Fallback: X-Forwarded-For (Railway'de ProxyFix ile parse ediliyor)
        xff = request.headers.get('X-Forwarded-For')
        if xff:
            candidate = xff.split(',')[0].strip()
            if candidate:
                return candidate
    return request.remote_addr or "unknown"

def check_rate_limit(ip):
    return rate_limiter.add(ip)

# ── Cloudflare bypass koruması ──────────────────────────
ENABLE_ORIGIN_LOCK = os.environ.get("ENABLE_ORIGIN_LOCK", "1") != "0"

CLOUDFLARE_IPV4 = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
    "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
    "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]
CLOUDFLARE_IPV6 = [
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
    "2c0f:f248::/32",
]
_CF_NETWORKS = [ipaddress.ip_network(n) for n in CLOUDFLARE_IPV4 + CLOUDFLARE_IPV6]

ORIGIN_SECRET_HEADER = "X-Origin-Verify"
ORIGIN_SECRET_VALUE = os.environ.get("ORIGIN_SECRET", "")

def _is_cloudflare_ip(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(ip in net for net in _CF_NETWORKS)

@app.before_request
def _enforce_cloudflare_origin():
    if not ENABLE_ORIGIN_LOCK:
        return None
    if request.path == "/health":
        return None
    if os.environ.get("FLASK_ENV") == "development" and request.path == "/debug-headers":
        return None

    remote_ip = request.remote_addr or ""

    # NOT: Railway, Cloudflare ile container arasına kendi internal proxy'sini
    # ekliyor. Bu yüzden X-Forwarded-For zincirinin son (rightmost) elemanı
    # Cloudflare'in IP'si DEĞİL, Railway'in kendi internal proxy IP'si oluyor.
    # ProxyFix(x_for=1) bu son elemanı remote_addr yapıyor, dolayısıyla
    # _is_cloudflare_ip() gerçek Cloudflare trafiğinde bile hep False dönüyordu
    # ve TÜM istekler (meşru frontend istekleri dahil) 404 ile reddediliyordu.
    # Railway'in proxy derinliği garantili/sabit olmadığı için IP aralığına
    # güvenmek yerine, asıl güvenlik katmanı olarak Cloudflare'in enjekte ettiği
    # paylaşılan sır (ORIGIN_SECRET_VALUE + X-Origin-Verify header) kullanılıyor.
    # IP kontrolü artık sadece bilgilendirme/log amaçlı, isteği tek başına
    # reddetmiyor.
    if not _is_cloudflare_ip(remote_ip):
        logger.info(f"[ORIGIN-LOCK] Non-Cloudflare-range IP (bilgi amaçlı, engellenmedi): {remote_ip} {request.path}")

    # CORS preflight (OPTIONS) isteklerinde tarayıcı custom header (X-Origin-Verify)
    # gönderemez, bu yüzden preflight'ı burada engellemiyoruz; flask-cors zaten
    # sadece ALLOWED_ORIGINS listesindeki origin'lere doğru CORS header'ları
    # döndürüyor. Asıl doğrulama gerçek istekte (POST/GET vb.) yapılıyor.
    if request.method == "OPTIONS":
        return None

    if ORIGIN_SECRET_VALUE:
        if request.headers.get(ORIGIN_SECRET_HEADER, "") != ORIGIN_SECRET_VALUE:
            logger.warning(f"[ORIGIN-LOCK] Secret header missing/invalid: {remote_ip} {request.path}")
            return jsonify({"error": "Not Found"}), 404
    else:
        logger.warning("[ORIGIN-LOCK] ORIGIN_SECRET ayarlı değil — origin-lock etkin şekilde devre dışı. "
                        "Railway env değişkenlerine ORIGIN_SECRET ekleyip Cloudflare'de aynı değeri "
                        "X-Origin-Verify header'ı olarak enjekte eden bir Transform Rule tanımlayın.")

    return None

# ── Aynı IP'den eşzamanlı istek sınırı ─────────────────
concurrent_ip_lock = threading.Lock()
concurrent_ip_counts = defaultdict(int)

@app.before_request
def _limit_concurrent_requests_per_ip():
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    ip = get_client_ip()
    with concurrent_ip_lock:
        if concurrent_ip_counts[ip] >= MAX_CONCURRENT_PER_IP:
            return jsonify({"error": "Too many concurrent requests. Please wait."}), 429
        concurrent_ip_counts[ip] += 1
    g._concurrent_ip = ip

@app.teardown_request
def _release_concurrent_request_per_ip(exc=None):
    ip = getattr(g, "_concurrent_ip", None)
    if ip is not None:
        with concurrent_ip_lock:
            if ip in concurrent_ip_counts:
                concurrent_ip_counts[ip] -= 1
                if concurrent_ip_counts[ip] <= 0:
                    del concurrent_ip_counts[ip]

# ── Eşzamanlı indirme sınırı ──────────────────────────
download_slots = threading.Semaphore(MAX_CONCURRENT_DOWNLOADS)
queue_lock = threading.Lock()
queue_waiting = 0
active_downloads_count = 0

def _release_download_slot():
    global active_downloads_count
    download_slots.release()
    with queue_lock:
        active_downloads_count = max(0, active_downloads_count - 1)

def acquire_download_slot(sid, cancel_event):
    """Slot boşalana kadar bekler; iptal edilirse DownloadCancelled fırlatır."""
    global queue_waiting, active_downloads_count
    with queue_lock:
        queue_waiting += 1
    try:
        while True:
            if cancel_event.is_set():
                raise yt_dlp.utils.DownloadCancelled("Cancelled")
            if download_slots.acquire(blocking=True, timeout=1):
                with queue_lock:
                    active_downloads_count += 1
                return True
            if sid:
                with queue_lock:
                    ahead = max(0, queue_waiting - 1)
                try:
                    socketio.emit('progress', {
                        'status': 'queued',
                        'message': f"Server is busy, waiting in queue... ({ahead} ahead)"
                    }, room=sid)
                except Exception:
                    pass  # Emit başarısız olsa bile kuyruk beklemeye devam etsin
    finally:
        with queue_lock:
            queue_waiting = max(0, queue_waiting - 1)

# ── FFmpeg ────────────────────────────────────────────
def find_ffmpeg():
    """Cross-platform ffmpeg path finder."""
    path = shutil.which('ffmpeg')
    if path:
        return os.path.dirname(os.path.abspath(path))
    return None

FFMPEG_DIR = find_ffmpeg()
FFMPEG_PATH = shutil.which('ffmpeg')  # Doğrudan tam path
logger.info(f"[INIT] ffmpeg={FFMPEG_DIR}")

# aria2c SSRF bypass riski nedeniyle tamamen devre dışı bırakıldı.
# Gelecekte container seviyesinde egress firewall kurulursa tekrar açılabilir.
ARIA2_PATH = None
logger.info("[INIT] aria2c disabled (SSRF protection)")

# ── Temizlik ──────────────────────────────────────────
def cleanup_old_files():
    try:
        now = time.time()
        for f in os.listdir(DOWNLOAD_DIR):
            fpath = os.path.join(DOWNLOAD_DIR, f)
            if os.path.isfile(fpath) and now - os.path.getmtime(fpath) > FILE_MAX_AGE:
                os.remove(fpath)
    except Exception as e:
        logger.error(f"[CLEANUP] Failed to clean old files: {e}")

def periodic_cleanup():
    while True:
        time.sleep(FILE_CLEANUP_INTERVAL)
        cleanup_old_files()

threading.Thread(target=periodic_cleanup, daemon=True).start()

# ── İptal ─────────────────────────────────────────────
cancel_events = {}
cancel_events_lock = threading.Lock()

# ── Bağlı Socket.IO sid'leri ────────────────────────────
connected_sids = set()
connected_sids_lock = threading.Lock()

def validate_sid(sid):
    if not sid:
        return ""
    with connected_sids_lock:
        return sid if sid in connected_sids else ""

def safe_emit(event, data, room=None):
    """SocketIO emit wrapper with error handling."""
    try:
        socketio.emit(event, data, room=room)
    except Exception as e:
        logger.warning(f"[SOCKET] Emit failed for room {room}: {e}")

# ── Platform helpers ──────────────────────────────────
def is_youtube(u): return "youtube.com" in u or "youtu.be" in u
def is_tiktok(u): return "tiktok.com" in u
def is_instagram(u): return "instagram.com" in u
def is_youtube_live_url(u): return is_youtube(u) and "/live/" in u

UNSUPPORTED_DOMAINS = (
    "spotify.com", "music.apple.com", "deezer.com", "tidal.com",
    "music.amazon.com", "music.youtube.com",
)

def is_unsupported_domain(u):
    ul = u.lower()
    return any(d in ul for d in UNSUPPORTED_DOMAINS)

# ── SSRF Koruması ──────────────────────────────────────
def _is_private_ip(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return (
        ip.is_private or ip.is_loopback or ip.is_link_local or
        ip.is_multicast or ip.is_reserved or ip.is_unspecified
    )

def is_safe_url(u):
    try:
        parsed = urlparse(u)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    lowered = hostname.lower()
    if lowered in ("localhost", "metadata", "metadata.google.internal"):
        return False
    try:
        infos = socket.getaddrinfo(hostname, None)
    except Exception:
        return False
    for info in infos:
        addr = info[4][0]
        if _is_private_ip(addr):
            return False
    return True

# Socket-level SSRF guard: her bağlantı anında hedef IP kontrolü
_orig_create_connection = socket.create_connection

def _guarded_create_connection(address, *args, **kwargs):
    host = address[0]
    try:
        ip = ipaddress.ip_address(host)
        if _is_private_ip(str(ip)):
            raise PermissionError(f"SSRF protection: connection to {host} blocked")
    except ValueError:
        # hostname ise çözümle ve kontrol et
        try:
            infos = socket.getaddrinfo(host, None)
        except Exception:
            infos = []
        for info in infos:
            if _is_private_ip(info[4][0]):
                raise PermissionError(f"SSRF protection: connection to {host} blocked")
    return _orig_create_connection(address, *args, **kwargs)

socket.create_connection = _guarded_create_connection

AUDIO_FMTS = {"mp3", "flac", "wav", "ogg", "opus", "m4a"}

# ── Hata mesajları ────────────────────────────────────
def parse_error(error_msg, url):
    es = error_msg.lower()
    if is_youtube(url):
        if "sign in" in es or "login" in es or "bot" in es:
            return "YouTube bot protection is active. Please wait a few minutes and try again."
        if "private video" in es or ("private" in es and "video" in es):
            return "This YouTube video is private and cannot be downloaded."
        if "copyright" in es:
            return "This video cannot be downloaded due to copyright."
        if "age" in es:
            return "This video is age-restricted. Cookie update may be required."
        if "unavailable" in es or "not available" in es:
            return "This YouTube video is no longer available."
        if "live" in es:
            return "Live streams are not supported."
        if "format" in es:
            return "Requested format not found. Try a different quality."
        return "YouTube download failed. Please try again in a few minutes."
    if is_instagram(url):
        if "rate" in es or "429" in es:
            return "instagram_ratelimit"
        if "login" in es:
            return "This Instagram content is private or requires login."
        return "Instagram download failed. Please try again in a few minutes."
    if is_tiktok(url):
        if "private" in es:
            return "This TikTok video is private."
        return "TikTok download failed."
    if "unsupported url" in es:
        return "This URL is not supported."
    if "no video formats" in es:
        return "No suitable format found for this content."
    if "network" in es or "connection" in es:
        return "Connection error. Please check your internet connection."
    return error_msg[:200]

# ── Base opts ─────────────────────────────────────────
def get_base_opts(url, use_cookies=True):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        },
    }
    if FFMPEG_DIR:
        opts["ffmpeg_location"] = FFMPEG_DIR
    # aria2c kaldırıldı: SSRF korumasını bypass ediyordu
    if use_cookies and os.path.exists(COOKIES_FILE) and not is_instagram(url):
        opts["cookiefile"] = COOKIES_FILE
    return opts

def get_opts_list(url, extra=None):
    opts_list = []
    o = get_base_opts(url, use_cookies=True)
    if extra: o.update(extra)
    opts_list.append(o)
    o = get_base_opts(url, use_cookies=False)
    if extra: o.update(extra)
    opts_list.append(o)
    return opts_list

# ── Format string builder ─────────────────────────────
def build_format_str(url, quality, fmt, codec):
    if fmt in AUDIO_FMTS:
        return "bestaudio/best"
    q = str(quality)
    best = (q == "9999")
    if is_youtube(url):
        if codec == "av1":
            if best:
                return ("bestvideo[vcodec^=av01]+bestaudio[acodec^=opus]"
                        "/bestvideo[vcodec^=av01]+bestaudio/bestvideo+bestaudio/best")
            return (f"bestvideo[vcodec^=av01][height<={q}]+bestaudio[acodec^=opus]"
                    f"/bestvideo[vcodec^=av01][height<={q}]+bestaudio"
                    f"/bestvideo[height<={q}]+bestaudio/best[height<={q}]/best")
        elif codec == "vp9":
            if best:
                return ("bestvideo[vcodec^=vp9]+bestaudio[acodec^=opus]"
                        "/bestvideo[vcodec^=vp9]+bestaudio/bestvideo+bestaudio/best")
            return (f"bestvideo[vcodec^=vp9][height<={q}]+bestaudio[acodec^=opus]"
                    f"/bestvideo[vcodec^=vp9][height<={q}]+bestaudio"
                    f"/bestvideo[height<={q}]+bestaudio/best[height<={q}]/best")
        else:
            if best:
                return "bestvideo+bestaudio/best"
            return (f"bestvideo[height<={q}]+bestaudio"
                    f"/best[height<={q}]/best")
    if best:
        return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
    return (f"bestvideo[ext=mp4][height<={q}]+bestaudio[ext=m4a]"
            f"/bestvideo[height<={q}]+bestaudio/best[height<={q}]/best")

def probe_info(url):
    """
    Süre kontrolü ve dosya adı için gereken bilgiyi (duration, title) tek
    extract_info çağrısında döner. Playlist ise (None, None) döner.
    """
    try:
        opts_list = get_opts_list(url, extra={"skip_download": True, "quiet": True})
        for opts in opts_list:
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info.get("_type") == "playlist" or "entries" in info:
                        return None, None
                    return info.get("duration") or None, info.get("title") or None
            except Exception:
                continue
    except Exception:
        pass
    return None, None


def probe_duration(url):
    """Geriye dönük uyumluluk için: sadece süreyi döner."""
    duration, _ = probe_info(url)
    return duration

def sanitize_filename(name):
    """Dosya adı için güvenli string üretir."""
    if not name:
        return "zenithw"
    # Path traversal ve özel karakterleri temizle
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name[:80]  # Maksimum uzunluk
    return name if name else "zenithw"

# ── Routes ────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "ffmpeg": f"OK ({FFMPEG_DIR})" if FFMPEG_DIR else "MISSING",
        "cookies": f"Loaded ({os.path.getsize(COOKIES_FILE)} bytes)" if os.path.exists(COOKIES_FILE) else "Missing",
        "disk_files": len(os.listdir(DOWNLOAD_DIR)),
        "active_downloads": active_downloads_count,
        "max_concurrent_downloads": MAX_CONCURRENT_DOWNLOADS,
        "queue_waiting": queue_waiting,
    }), 200

if os.environ.get("FLASK_ENV") == "development":
    @app.route("/debug-headers")
    def debug_headers():
        """
        SADECE development ortamında aktif. Production'da bu route hiç
        register edilmez (bkz. FLASK_ENV kontrolü). Sekret değeri hâlâ
        expose edilmez; sadece var/yok ve eşleşme durumu döner.
        """
        return jsonify({
            "received_x_origin_verify_present": "X-Origin-Verify" in request.headers,
            "expected_value_set": bool(ORIGIN_SECRET_VALUE),
            "match": request.headers.get("X-Origin-Verify", "") == ORIGIN_SECRET_VALUE,
            "cf_ray_present": "CF-Ray" in request.headers,
            "cf_connecting_ip_present": "CF-Connecting-IP" in request.headers,
        }), 200

@app.route("/robots.txt")
def robots():
    return "User-agent: *\nDisallow: /\n", 200, {'Content-Type': 'text/plain'}

@app.route("/cancel", methods=["POST"])
def cancel_route():
    ip = get_client_ip()
    data = request.json or {}
    download_id = data.get("download_id", "")
    if download_id:
        with cancel_events_lock:
            entry = cancel_events.get(download_id)
            if entry and entry[1] == ip:
                entry[0].set()
                # Download döngüsü zaten Event objesine kendi referansıyla
                # erişiyor (dict'ten tekrar okumuyor), bu yüzden burada pop
                # etmek güvenli ve /cancel sonrası dict'te kalıntı bırakmaz.
                cancel_events.pop(download_id, None)
        return jsonify({"ok": True}), 200
    return jsonify({"error": "download_id required"}), 400

@app.route("/")
def api_root():
    return jsonify({
        "service": "zenithw-api",
        "status": "ok",
        "message": "This is an API endpoint. Visit zenithw.space for the web interface."
    }), 200

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not Found"}), 404

# ── /info ─────────────────────────────────────────────
@app.route("/info", methods=["POST"])
def get_info():
    ip = get_client_ip()
    if not check_rate_limit(ip):
        return jsonify({"error": "Too many requests. Please wait 1 minute."}), 429
    data = request.json or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL required"}), 400
    if not is_safe_url(url):
        return jsonify({"error": "Invalid or disallowed URL."}), 400
    if is_youtube_live_url(url):
        return jsonify({"error": "Live streams are not currently supported."}), 400
    if is_unsupported_domain(url):
        return jsonify({"error": "This platform is not supported."}), 400

    extra_opts = {
        "extract_flat": "in_playlist",
        "playlistend": PLAYLIST_LIMIT,
    }
    opts_list = get_opts_list(url, extra=extra_opts)
    last_err = None
    for opts in opts_list:
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info.get("_type") == "playlist" or "entries" in info:
                    entries = info.get("entries") or []
                    items = []
                    for e in entries:
                        if not e:
                            continue
                        entry_url = e.get("url") or e.get("webpage_url")
                        if not entry_url and e.get("id"):
                            if is_youtube(url):
                                vid = e["id"]
                                if isinstance(vid, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,32}", vid):
                                    entry_url = f"https://www.youtube.com/watch?v={vid}"
                        if not entry_url:
                            continue
                        thumbs = e.get("thumbnails") or []
                        thumb = e.get("thumbnail") or (thumbs[-1].get("url") if thumbs else None)
                        items.append({
                            "url": entry_url,
                            "title": e.get("title") or "Video",
                            "duration": e.get("duration") or 0,
                            "thumbnail": thumb,
                        })
                    total_count = info.get("playlist_count") or len(items)
                    return jsonify({
                        "is_playlist": True,
                        "playlist_title": info.get("title") or "Playlist",
                        "playlist_count": len(items),
                        "total_entries": total_count,
                        "limited_to": PLAYLIST_LIMIT,
                        "items": items,
                        "platform": info.get("extractor_key", "").lower(),
                    })
                subs = info.get("subtitles") or {}
                auto_subs = info.get("automatic_captions") or {}
                sub_langs = sorted(set(subs.keys()) | set(auto_subs.keys()))
                return jsonify({
                    "is_playlist": False,
                    "title": info.get("title") or "Video",
                    "duration": info.get("duration") or 0,
                    "thumbnail": info.get("thumbnail"),
                    "uploader": info.get("uploader") or info.get("channel") or "",
                    "platform": info.get("extractor_key", "").lower(),
                    "subtitles": sub_langs,
                    "has_manual_subtitles": bool(subs),
                })
        except Exception as e:
            last_err = e
            es = str(e).lower()
            if "login" in es or "private" in es or "cookie" in es:
                break
            continue

    error_msg = str(last_err) if last_err else "Unknown error"
    logger.error(f"[INFO ERR] {url[:60]}: {error_msg[:150]}")
    parsed = parse_error(error_msg, url)
    if parsed == "instagram_ratelimit":
        return jsonify({"error": "instagram_ratelimit"}), 400
    return jsonify({"error": parsed}), 400

# ── /download ─────────────────────────────────────────
@app.route("/download", methods=["POST"])
def download():
    ip = get_client_ip()
    if not check_rate_limit(ip):
        return jsonify({"error": "Too many requests. Please wait 1 minute."}), 429
    cleanup_old_files()
    data = request.json or {}
    url = data.get("url", "").strip()
    quality = str(data.get("quality", "1080"))
    fmt = data.get("format", "mp4").lower()
    codec = data.get("codec", "h264").lower()
    audio_q = str(data.get("audioQ", "256"))
    sid = validate_sid(data.get("sid", ""))
    download_id = data.get("download_id") or str(uuid.uuid4())
    add_meta = bool(data.get("metadata", True))

    want_subs = bool(data.get("subtitles", False))
    sub_langs = data.get("sub_langs") or ["en"]
    if isinstance(sub_langs, str):
        sub_langs = [sub_langs]
    sub_langs = [l for l in sub_langs if isinstance(l, str) and 1 <= len(l) <= 10 and all(c.isalnum() or c == '-' for c in l)][:5]
    embed_subs = bool(data.get("embed_subs", True))

    want_sponsorblock = bool(data.get("sponsorblock", False))
    ALLOWED_SB_CATEGORIES = {
        "sponsor", "intro", "outro", "selfpromo", "preview",
        "filler", "interaction", "music_offtopic", "poi_highlight",
        "chapter", "exclusive_access",
    }
    sb_categories = data.get("sponsorblock_categories") or ["sponsor"]
    if not isinstance(sb_categories, list):
        sb_categories = ["sponsor"]
    sb_categories = [c for c in sb_categories if c in ALLOWED_SB_CATEGORIES][:9] or ["sponsor"]
    sb_mode = data.get("sponsorblock_mode", "remove")
    if sb_mode not in ("remove", "mark"):
        sb_mode = "remove"

    ALLOWED_FORMATS = {"mp4", "webm", "mkv", "avi", "mov"} | AUDIO_FMTS
    ALLOWED_CODECS = {"h264", "av1", "vp9"}
    if fmt not in ALLOWED_FORMATS:
        return jsonify({"error": "Unsupported format"}), 400
    if codec not in ALLOWED_CODECS:
        return jsonify({"error": "Unsupported codec"}), 400
    if not quality.isdigit() or not (1 <= len(quality) <= 4):
        return jsonify({"error": "Invalid quality value"}), 400
    if not audio_q.isdigit():
        audio_q = "256"

    if not url:
        return jsonify({"error": "URL required"}), 400
    if not is_safe_url(url):
        return jsonify({"error": "Invalid or disallowed URL."}), 400
    if is_youtube_live_url(url):
        return jsonify({"error": "Live streams are not currently supported."}), 400
    if is_unsupported_domain(url):
        return jsonify({"error": "This platform is not supported."}), 400

    is_audio = fmt in AUDIO_FMTS
    cancel_event = threading.Event()
    size_exceeded = {"flag": False}
    with cancel_events_lock:
        cancel_events[download_id] = (cancel_event, ip)

    duration, video_title = probe_info(url)
    if duration and duration > MAX_VIDEO_DURATION_SECONDS:
        with cancel_events_lock:
            cancel_events.pop(download_id, None)
        max_min = MAX_VIDEO_DURATION_SECONDS // 60
        return jsonify({"error": f"Video too long (maximum {max_min} minutes)."}), 400

    filename = str(uuid.uuid4())
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    dl_start_time = time.time()

    def progress_hook(d):
        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadCancelled("Cancelled")
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            if (total and total > MAX_DOWNLOAD_SIZE_BYTES) or downloaded > MAX_DOWNLOAD_SIZE_BYTES:
                size_exceeded["flag"] = True
                cancel_event.set()
                if sid:
                    safe_emit('progress', {
                        'status': 'error',
                        'message': f"File size limit exceeded (maximum {MAX_DOWNLOAD_SIZE_BYTES // (1024*1024)} MB)."
                    }, room=sid)
                raise yt_dlp.utils.DownloadCancelled("Size limit exceeded")
            pct = None
            if total > 0:
                pct = max(5, int(downloaded / total * 82))
            else:
                frag_idx = d.get('fragment_index')
                frag_cnt = d.get('fragment_count')
                if frag_idx is not None and frag_cnt:
                    pct = max(5, int(frag_idx / frag_cnt * 82))
                else:
                    pct = min(80, 5 + int(time.time() - dl_start_time) * 2)
            if pct is not None and sid:
                safe_emit('progress', {
                    'percent': pct,
                    'speed': d.get('_speed_str', '').strip(),
                    'eta': d.get('_eta_str', '').strip(),
                    'status': 'downloading'
                }, room=sid)
        elif d['status'] == 'finished' and sid:
            safe_emit('progress', {'percent': 88, 'status': 'merging'}, room=sid)

    slot_acquired = False
    try:
        acquire_download_slot(sid, cancel_event)
        slot_acquired = True
        fmt_str = build_format_str(url, quality, fmt, codec)
        logger.info(f"[DL] q={quality} fmt={fmt} codec={codec} audio={is_audio}")

        if is_audio:
            if not FFMPEG_DIR:
                with cancel_events_lock:
                    cancel_events.pop(download_id, None)
                return jsonify({"error": "FFmpeg is required for audio conversion."}), 400
            codec_map = {
                "mp3": "mp3", "flac": "flac", "wav": "wav",
                "ogg": "vorbis", "opus": "opus", "m4a": "m4a"
            }
            preferred = codec_map.get(fmt, "mp3")
            preferred_q = audio_q if fmt in ("mp3", "ogg", "m4a") else "0"
            postprocessors = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": preferred,
                    "preferredquality": preferred_q
                }
            ]
            if add_meta:
                postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
            if want_sponsorblock:
                postprocessors.append({
                    "key": "SponsorBlock",
                    "categories": sb_categories,
                    "api": "https://sponsor.ajay.app",
                })
                if sb_mode == "remove":
                    postprocessors.append({
                        "key": "ModifyChapters",
                        "remove_sponsor_segments": sb_categories,
                    })
            extra = {
                "format": fmt_str,
                "outtmpl": filepath + ".%(ext)s",
                "progress_hooks": [progress_hook],
                "postprocessors": postprocessors,
            }
        else:
            is_mute = data.get("mute", False)
            merge_fmt = "mp4"
            if fmt == "webm": merge_fmt = "webm"
            elif fmt == "mkv": merge_fmt = "mkv"
            elif fmt == "avi": merge_fmt = "avi"
            elif fmt == "mov": merge_fmt = "mov"
            elif codec in ("av1", "vp9") and fmt != "mp4": merge_fmt = "webm"
            postprocessors = []
            if add_meta:
                postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
            if want_sponsorblock:
                postprocessors.append({
                    "key": "SponsorBlock",
                    "categories": sb_categories,
                    "api": "https://sponsor.ajay.app",
                })
                if sb_mode == "remove":
                    postprocessors.append({
                        "key": "ModifyChapters",
                        "remove_sponsor_segments": sb_categories,
                    })
            extra = {
                "format": fmt_str,
                "outtmpl": filepath + ".%(ext)s",
                "progress_hooks": [progress_hook],
                "merge_output_format": merge_fmt,
            }
            if want_subs and FFMPEG_DIR:
                extra["writesubtitles"] = True
                extra["writeautomaticsub"] = True
                extra["subtitleslangs"] = sub_langs
                extra["subtitlesformat"] = "srt/best"
                postprocessors.append({"key": "FFmpegEmbedSubtitle"})
            if postprocessors:
                extra["postprocessors"] = postprocessors

        opts_list = get_opts_list(url, extra=extra)
        success = False
        last_err = None
        timed_out = False
        logger.info(f"[DL] starting download (timeout={DOWNLOAD_TIMEOUT_SECONDS}s)")

        for opts in opts_list:
            if cancel_event.is_set():
                break
            before_pids = _snapshot_child_pids()
            try:
                # NOT: gevent.Timeout subprocess'leri (ffmpeg merge) durduramaz,
                # sadece Python kodunu kapsar. Bu yüzden timeout/exception
                # sonrası _reap_new_children ile process ağacı taranıp
                # timeout süresince doğan ffmpeg/aria2c process'leri öldürülür.
                # Ayrıca uzun süren işlemler için gunicorn --timeout (660s)
                # devreye girer ve worker'ı restart eder. Bu yüzden
                # DOWNLOAD_TIMEOUT_SECONDS < gunicorn timeout.
                with gevent.Timeout(DOWNLOAD_TIMEOUT_SECONDS, TimeoutError(f"{DOWNLOAD_TIMEOUT_SECONDS}s exceeded")):
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        ydl.download([url])
                success = True
                # Başarılı tamamlanma sonrası da savunma amaçlı reap:
                # yt-dlp kendi spawn ettiği ffmpeg/ffprobe process'lerini
                # normalde kendi içinde reap eder, ancak postprocessor
                # zincirinde (merge/metadata/sponsorblock/subtitle embed)
                # birden fazla ffmpeg çağrısı olabiliyor ve gevent altında
                # nadir durumlarda process arkada kalabiliyor. Bu döngü
                # sadece BU indirmenin before/after PID farkına bakar,
                # aynı anda çalışan başka indirmelerin process'lerine
                # dokunmaz.
                _reap_new_children(before_pids, download_id)
                break
            except yt_dlp.utils.DownloadCancelled:
                _reap_new_children(before_pids, download_id)
                raise
            except TimeoutError as e:
                timed_out = True
                last_err = e
                logger.error(f"[DL TIMEOUT] {DOWNLOAD_TIMEOUT_SECONDS}s exceeded")
                _reap_new_children(before_pids, download_id)
                break
            except (MemoryError, SystemError, KeyboardInterrupt, SystemExit):
                # Bunlar bir sonraki opts denemesiyle "düzelmeyecek" ciddi
                # hatalar; sessizce yutup devam etmek yerine process/worker
                # seviyesine kadar yükseltiliyor.
                _reap_new_children(before_pids, download_id)
                raise
            except Exception as e:
                last_err = e
                es = str(e).lower()
                logger.error(f"[DL FAIL] {es[:100]}")
                _reap_new_children(before_pids, download_id)
                if "login" in es or "private" in es or "cookie" in es:
                    break
                continue

        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadCancelled("Cancelled")

        if timed_out:
            with cancel_events_lock:
                cancel_events.pop(download_id, None)
            for f in os.listdir(DOWNLOAD_DIR):
                if f.startswith(filename):
                    try: os.remove(os.path.join(DOWNLOAD_DIR, f))
                    except: pass
            if sid:
                safe_emit('progress', {'status': 'error', 'message': 'Download timed out, please try again.'}, room=sid)
            return jsonify({"error": "Download timed out, please try again."}), 504

        if not success:
            raise last_err or Exception("All attempts failed")

        logger.info("[DL] download completed, processing file...")

        full_path = None
        for f in sorted(os.listdir(DOWNLOAD_DIR)):
            if f.startswith(filename):
                full_path = os.path.join(DOWNLOAD_DIR, f)
                break

        if not full_path:
            with cancel_events_lock:
                cancel_events.pop(download_id, None)
            return jsonify({"error": "File not found"}), 500

        if not is_audio and data.get("mute", False) and FFMPEG_DIR:
            logger.info("[DL] mute step starting")
            # Path parse düzeltmesi: os.path.splitext kullan
            base, ext = os.path.splitext(full_path)
            muted_path = base + ".muted" + ext
            try:
                ffmpeg_cmd = FFMPEG_PATH or os.path.join(FFMPEG_DIR, "ffmpeg")
                result = subprocess.run(
                    [ffmpeg_cmd, "-y", "-i", full_path,
                     "-c", "copy", "-an", muted_path],
                    capture_output=True, text=True, timeout=FFMPEG_TIMEOUT
                )
                if result.returncode == 0 and os.path.exists(muted_path):
                    os.remove(full_path)
                    os.rename(muted_path, full_path)
                else:
                    logger.error(f"[MUTE FFMPEG FAIL] {result.stderr[:200]}")
            except Exception as e:
                logger.error(f"[MUTE FFMPEG ERR] {e}")
            finally:
                try:
                    if os.path.exists(muted_path):
                        os.remove(muted_path)
                except Exception:
                    pass

        try:
            final_size = os.path.getsize(full_path)
        except OSError:
            final_size = 0
        if final_size > MAX_DOWNLOAD_SIZE_BYTES:
            try:
                os.remove(full_path)
            except Exception:
                pass
            with cancel_events_lock:
                cancel_events.pop(download_id, None)
            if sid:
                safe_emit('progress', {'status': 'error', 'message': 'File size limit exceeded.'}, room=sid)
            max_mb = MAX_DOWNLOAD_SIZE_BYTES // (1024 * 1024)
            return jsonify({"error": f"File size limit exceeded (maximum {max_mb} MB)."}), 400

        if sid:
            safe_emit('progress', {'percent': 100, 'status': 'done'}, room=sid)

        if slot_acquired:
            _release_download_slot()
            slot_acquired = False

        # Dosya adını video başlığından türet (mümkünse), yoksa sabit isme düş
        ext = os.path.splitext(full_path)[1].lstrip('.') or fmt
        safe_title = sanitize_filename(video_title) if video_title else "zenithw"
        download_name = f"{safe_title}.{ext}"
        logger.info(f"[DL] sending response: {download_name} ({final_size} bytes)")
        response = send_file(full_path, as_attachment=True, download_name=download_name)
        response.headers['X-Download-Id'] = download_id
        response.headers['Access-Control-Expose-Headers'] = 'X-Download-Id'

        @response.call_on_close
        def cleanup():
            try:
                if full_path and os.path.exists(full_path):
                    os.remove(full_path)
            except Exception as e:
                logger.error(f"[CLEANUP] Failed to remove {full_path}: {e}")
            with cancel_events_lock:
                cancel_events.pop(download_id, None)

        return response

    except yt_dlp.utils.DownloadCancelled:
        for f in os.listdir(DOWNLOAD_DIR):
            if f.startswith(filename):
                try: os.remove(os.path.join(DOWNLOAD_DIR, f))
                except: pass
        with cancel_events_lock:
            cancel_events.pop(download_id, None)
        if size_exceeded["flag"]:
            max_mb = MAX_DOWNLOAD_SIZE_BYTES // (1024 * 1024)
            if sid:
                safe_emit('progress', {'status': 'error', 'message': f"File size limit exceeded (maximum {max_mb} MB)."}, room=sid)
            return jsonify({"error": f"File size limit exceeded (maximum {max_mb} MB)."}), 400
        if sid:
            safe_emit('progress', {'percent': 0, 'status': 'cancelled'}, room=sid)
        return jsonify({"error": "cancelled"}), 409
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[DL ERR] {error_msg[:200]}")
        with cancel_events_lock:
            cancel_events.pop(download_id, None)
        try:
            for f in os.listdir(DOWNLOAD_DIR):
                if f.startswith(filename):
                    try: os.remove(os.path.join(DOWNLOAD_DIR, f))
                    except: pass
        except Exception:
            pass
        if sid:
            safe_emit('progress', {'status': 'error', 'message': error_msg[:100]}, room=sid)
        parsed = parse_error(error_msg, url)
        if parsed == "instagram_ratelimit":
            return jsonify({"error": "instagram_ratelimit"}), 400
        return jsonify({"error": parsed}), 400
    finally:
        if slot_acquired:
            _release_download_slot()
            slot_acquired = False

# ── /thumbnail ─────────────────────────────────────────
@app.route("/thumbnail", methods=["POST"])
def download_thumbnail():
    ip = get_client_ip()
    if not check_rate_limit(ip):
        return jsonify({"error": "Too many requests. Please wait 1 minute."}), 429
    data = request.json or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL required"}), 400
    if not is_safe_url(url):
        return jsonify({"error": "Invalid or disallowed URL."}), 400
    if is_youtube_live_url(url):
        return jsonify({"error": "Live streams are not currently supported."}), 400
    if is_unsupported_domain(url):
        return jsonify({"error": "This platform is not supported."}), 400
    if not FFMPEG_DIR:
        return jsonify({"error": "FFmpeg required"}), 400

    filename = str(uuid.uuid4())
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    extra = {
        "skip_download": True,
        "writethumbnail": True,
        "outtmpl": filepath + ".%(ext)s",
        "postprocessors": [
            {"key": "FFmpegThumbnailsConvertor", "format": "jpg"},
        ],
    }
    opts_list = get_opts_list(url, extra=extra)
    last_err = None
    for opts in opts_list:
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            full_path = None
            for f in sorted(os.listdir(DOWNLOAD_DIR)):
                if f.startswith(filename):
                    full_path = os.path.join(DOWNLOAD_DIR, f)
                    break
            if not full_path:
                continue
            response = send_file(full_path, as_attachment=True, download_name="thumbnail.jpg")

            @response.call_on_close
            def _cleanup_thumb():
                try:
                    if os.path.exists(full_path):
                        os.remove(full_path)
                except Exception as e:
                    logger.error(f"[THUMB CLEANUP] {e}")

            return response
        except Exception as e:
            last_err = e
            continue

    error_msg = str(last_err) if last_err else "Thumbnail could not be retrieved"
    logger.error(f"[THUMB ERR] {error_msg[:150]}")
    return jsonify({"error": parse_error(error_msg, url)}), 400

# ── /convert ───────────────────────────────────────────
ALLOWED_CONVERT_FORMATS = {
    "mp3", "flac", "wav", "ogg", "opus", "m4a",
    "mp4", "webm", "mkv", "avi", "mov",
}

ALLOWED_INPUT_EXTS = {
    ".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac",
    ".mp4", ".webm", ".mkv", ".avi", ".mov", ".m4v", ".flv", ".wmv", ".3gp",
}

def safe_input_suffix(original_filename):
    ext = os.path.splitext(original_filename or "")[1].lower()
    # ALLOWED_INPUT_EXTS whitelist zaten ".."/".."-benzeri değerleri dışlıyor,
    # ama ekstra netlik için tek nokta + kısa uzunluk kontrolü de ekleniyor.
    if (
        ext in ALLOWED_INPUT_EXTS
        and ext.count('.') == 1
        and 2 <= len(ext) <= 5
        and all(c.isalnum() for c in ext[1:])
    ):
        return ext
    return ".bin"

@app.route("/convert", methods=["POST"])
def convert_file():
    ip = get_client_ip()
    if not check_rate_limit(ip):
        return jsonify({"error": "Too many requests. Please wait 1 minute."}), 429
    if 'file' not in request.files:
        return jsonify({"error": "File required"}), 400
    file = request.files['file']
    target_format = request.form.get('target_format', 'mp3').lower()
    if not file or file.filename == '':
        return jsonify({"error": "Invalid file"}), 400
    if target_format not in ALLOWED_CONVERT_FORMATS:
        return jsonify({"error": "Unsupported target format"}), 400
    if not FFMPEG_DIR:
        return jsonify({"error": "FFmpeg required"}), 400

    input_path = None
    output_path = None
    try:
        suffix = safe_input_suffix(file.filename)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=DOWNLOAD_DIR) as input_temp:
            input_path = input_temp.name
            file.save(input_path)

        base_no_ext = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(os.path.dirname(input_path), base_no_ext + '.' + target_format)

        ffmpeg_cmd = FFMPEG_PATH or os.path.join(FFMPEG_DIR, "ffmpeg")
        cmd = [ffmpeg_cmd, '-i', input_path, '-y']

        audio_formats = {'mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a'}
        if target_format in audio_formats:
            cmd.extend(['-vn'])
            if target_format == 'mp3':
                cmd.extend(['-codec:a', 'libmp3lame', '-q:a', '2'])
            elif target_format == 'flac':
                cmd.extend(['-codec:a', 'flac'])
            elif target_format == 'wav':
                cmd.extend(['-codec:a', 'pcm_s16le'])
            elif target_format == 'ogg':
                cmd.extend(['-codec:a', 'libvorbis', '-q:a', '5'])
            elif target_format == 'opus':
                cmd.extend(['-codec:a', 'libopus', '-b:a', '128k'])
            elif target_format == 'm4a':
                cmd.extend(['-codec:a', 'aac', '-b:a', '192k'])
        else:
            if target_format == 'mp4':
                cmd.extend(['-c:v', 'libx264', '-c:a', 'aac'])
            elif target_format == 'webm':
                cmd.extend(['-c:v', 'libvpx-vp9', '-c:a', 'libopus'])
            elif target_format == 'mkv':
                cmd.extend(['-c:v', 'libx264', '-c:a', 'aac'])
            elif target_format == 'avi':
                cmd.extend(['-c:v', 'libx264', '-c:a', 'mp3'])
            elif target_format == 'mov':
                cmd.extend(['-c:v', 'libx264', '-c:a', 'aac'])

        cmd.append(output_path)

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
        if result.returncode != 0:
            logger.error(f"[CONV FFMPEG ERR] {result.stderr[:300]}")
            return jsonify({"error": "Conversion failed. Please check the file format."}), 400

        try:
            if input_path and os.path.exists(input_path):
                os.unlink(input_path)
        except Exception:
            pass

        _out = output_path
        response = send_file(_out, as_attachment=True, download_name=f"converted.{target_format}")

        @response.call_on_close
        def _cleanup_conv():
            try:
                if _out and os.path.exists(_out):
                    os.unlink(_out)
            except Exception as e:
                logger.error(f"[CONV CLEANUP] {e}")

        return response

    except subprocess.TimeoutExpired:
        logger.error("[CONV ERR] ffmpeg timeout")
        try:
            if output_path and os.path.exists(output_path):
                os.unlink(output_path)
        except Exception:
            pass
        return jsonify({"error": "Conversion timed out."}), 400
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[CONV ERR] {error_msg[:200]}")
        try:
            if output_path and os.path.exists(output_path):
                os.unlink(output_path)
        except Exception:
            pass
        return jsonify({"error": "An error occurred during conversion."}), 400
    finally:
        try:
            if input_path and os.path.exists(input_path):
                os.unlink(input_path)
        except Exception:
            pass

# ── Socket.IO Events ──────────────────────────────────
@socketio.on('connect')
def on_connect():
    with connected_sids_lock:
        connected_sids.add(request.sid)
    logger.info(f"+ {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    with connected_sids_lock:
        connected_sids.discard(request.sid)
    logger.info(f"- {request.sid}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", debug=False, port=port)