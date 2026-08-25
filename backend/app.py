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
import hmac
import socket
import ipaddress
import tempfile
import contextvars
from collections import defaultdict, OrderedDict, deque
from contextlib import contextmanager
from importlib.metadata import PackageNotFoundError, version as package_version
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

# Cloudflare Free/Pro proxy sınırı 100 MB. Multipart sınır başlıkları için
# pay bırakarak büyük yüklemelerin Railway'e ulaşmadan 413 almasını önlüyoruz.
MAX_UPLOAD_SIZE_BYTES = 95 * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE_BYTES

# ── Constants ──────────────────────────────────────────
FFMPEG_TIMEOUT = int(os.environ.get("FFMPEG_TIMEOUT_SECONDS", 120))
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("DOWNLOAD_TIMEOUT_SECONDS", 600))
MAX_CONCURRENT_PER_IP = int(os.environ.get("MAX_CONCURRENT_PER_IP", 5))
MAX_CONCURRENT_DOWNLOADS = int(os.environ.get("MAX_CONCURRENT_DOWNLOADS", 2))
MAX_CONCURRENT_CONVERSIONS = int(os.environ.get("MAX_CONCURRENT_CONVERSIONS", 1))
MAX_CONCURRENT_INFO = int(os.environ.get("MAX_CONCURRENT_INFO", 4))
MAX_CONCURRENT_THUMBNAILS = int(os.environ.get("MAX_CONCURRENT_THUMBNAILS", 2))
MAX_DOWNLOAD_QUEUE = int(os.environ.get("MAX_DOWNLOAD_QUEUE", 12))
MAX_QUEUE_WAIT_SECONDS = int(os.environ.get("MAX_QUEUE_WAIT_SECONDS", 120))
INFO_TIMEOUT_SECONDS = int(os.environ.get("INFO_TIMEOUT_SECONDS", 45))
INFO_CACHE_TTL_SECONDS = int(os.environ.get("INFO_CACHE_TTL_SECONDS", 45))
INFO_CACHE_MAX_SIZE = int(os.environ.get("INFO_CACHE_MAX_SIZE", 256))
THUMBNAIL_TIMEOUT_SECONDS = int(os.environ.get("THUMBNAIL_TIMEOUT_SECONDS", 60))
MAX_VIDEO_DURATION_SECONDS = int(os.environ.get("MAX_VIDEO_DURATION_SECONDS", 90 * 60))
MAX_DOWNLOAD_SIZE_BYTES = int(os.environ.get("MAX_DOWNLOAD_SIZE_MB", 1536)) * 1024 * 1024
MAX_CONVERT_OUTPUT_SIZE_BYTES = int(os.environ.get("MAX_CONVERT_OUTPUT_SIZE_MB", 1024)) * 1024 * 1024
MAX_SPOOL_SIZE_BYTES = int(os.environ.get("MAX_SPOOL_SIZE_MB", 4096)) * 1024 * 1024
MIN_FREE_DISK_BYTES = int(os.environ.get("MIN_FREE_DISK_MB", 512)) * 1024 * 1024
DOWNLOAD_SPOOL_RESERVATION_BYTES = int(
    os.environ.get("DOWNLOAD_SPOOL_RESERVATION_MB", 2048)
) * 1024 * 1024
CONVERT_SPOOL_RESERVATION_BYTES = (
    app.config['MAX_CONTENT_LENGTH'] + MAX_CONVERT_OUTPUT_SIZE_BYTES
)
MAX_CONCURRENT_TRANSFERS = int(os.environ.get("MAX_CONCURRENT_TRANSFERS", 2))
MAX_CONCURRENT_TRANSFERS_PER_IP = int(os.environ.get("MAX_CONCURRENT_TRANSFERS_PER_IP", 2))
TRANSFER_QUEUE_WAIT_SECONDS = int(os.environ.get("TRANSFER_QUEUE_WAIT_SECONDS", 120))
PREPARED_FILE_TTL = int(os.environ.get("PREPARED_FILE_TTL", 10 * 60))
PROGRESS_EMIT_INTERVAL = float(os.environ.get("PROGRESS_EMIT_INTERVAL", "0.2"))
RATE_LIMIT_WINDOW = 60  # saniye
RATE_LIMIT_MAX_REQUESTS = 10  # istek/dakika
CONVERSION_RATE_LIMIT_WINDOW = int(os.environ.get("CONVERSION_RATE_LIMIT_WINDOW", 600))
CONVERSION_RATE_LIMIT_MAX_REQUESTS = int(os.environ.get("CONVERSION_RATE_LIMIT_MAX_REQUESTS", 2))
RATE_LIMIT_CLEANUP_INTERVAL = 60  # saniye
FILE_CLEANUP_INTERVAL = 900  # 15 dakika
FILE_MAX_AGE = 1800  # 30 dakika
PLAYLIST_LIMIT = 50


def _env_flag(name, default=False):
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _bounded_env_int(name, default, minimum, maximum):
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return min(maximum, max(minimum, value))


MAINTENANCE_MODE = _env_flag("MAINTENANCE_MODE")
MAINTENANCE_MESSAGE = (
    os.environ.get(
        "MAINTENANCE_MESSAGE",
        "Pati ekibimiz sunucuların kablolarını düzeltiyor. Kısa süre sonra yeniden buradayız.",
    ).strip()[:240]
)
MAINTENANCE_UNTIL = os.environ.get("MAINTENANCE_UNTIL", "").strip()[:64]
MAINTENANCE_RETRY_AFTER = _bounded_env_int(
    "MAINTENANCE_RETRY_AFTER", 900, 60, 86400
)
MAINTENANCE_BLOCKED_PATHS = frozenset({
    "/info", "/download", "/thumbnail", "/convert",
})


def _load_pot_provider_config():
    """Validate the optional private PO Token provider endpoint at startup."""
    raw_url = os.environ.get("YOUTUBE_POT_PROVIDER_URL", "").strip()
    if not raw_url:
        return None, None, None
    try:
        parsed = urlparse(raw_url)
        port = parsed.port or 4416
    except ValueError as exc:
        raise RuntimeError("YOUTUBE_POT_PROVIDER_URL has an invalid port") from exc
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "http":
        raise RuntimeError("YOUTUBE_POT_PROVIDER_URL must use http on Railway's private network")
    if not host or not (1 <= port <= 65535):
        raise RuntimeError("YOUTUBE_POT_PROVIDER_URL must contain a valid hostname and port")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise RuntimeError("YOUTUBE_POT_PROVIDER_URL must not contain credentials, query, or fragment")
    if parsed.path not in ("", "/"):
        raise RuntimeError("YOUTUBE_POT_PROVIDER_URL must be a base URL without a path")
    if not (host.endswith(".railway.internal") or host in {"localhost", "127.0.0.1", "::1"}):
        raise RuntimeError(
            "YOUTUBE_POT_PROVIDER_URL must target a Railway private hostname or local loopback"
        )
    normalized_host = f"[{host}]" if ":" in host else host
    return f"http://{normalized_host}:{port}", host, port


POT_PROVIDER_URL, POT_PROVIDER_HOST, POT_PROVIDER_PORT = _load_pot_provider_config()

# YENİ: connected_sids TTL temizlik süresi (1 saat)
CONNECTED_SID_MAX_AGE = 3600
# YENİ: cancel_events TTL temizlik süresi (1 saat)
CANCEL_EVENT_MAX_AGE = 3600

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


def _reap_new_children(before_pids, download_id=None, file_token=None):
    """
    Timeout sonrası: before_pids'te olmayan ve komut satırında bu indirmeye ait
    benzersiz dosya token'ını taşıyan ffmpeg/ffprobe/aria2c child process'lerini
    bulup öldürür.
    yt-dlp bu process'leri kendi içinde subprocess.Popen ile başlattığı için
    PID'lerine doğrudan erişimimiz yok; bu yüzden process ağacını tarıyoruz.
    Sadece "snapshot'tan sonra doğdu" ölçütü yeterli değildir: eşzamanlı başka
    bir indirme veya /convert işlemi de aynı aralıkta FFmpeg başlatabilir.
    """
    if not file_token:
        logger.warning(f"[REAP] skipped: missing file token for download_id={download_id}")
        return
    token = str(file_token).lower()
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
            try:
                command_line = " ".join(p.cmdline()).lower()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            if token not in command_line:
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
    def __init__(self, ttl=60, max_size=10000, max_requests=RATE_LIMIT_MAX_REQUESTS):
        self.ttl = ttl
        self.max_size = max_size
        self.max_requests = max_requests
        self._data = OrderedDict()
        self._lock = threading.Lock()

    def _cleanup_all(self):
        """Tüm key'leri tarayan pahalı (O(n)) temizlik. Sadece periyodik
        background thread tarafından çağrılmalı -- her request'te DEĞİL
        (önceden add() içinde her çağrıda tüm cache taranıyordu, bu da
        eşzamanlı trafik altında her isteği tek bir lock üzerinden
        O(tracked_ip_count) maliyetle serialize ediyordu)."""
        now = time.time()
        to_remove = []
        with self._lock:
            for key, timestamps in self._data.items():
                while timestamps and now - timestamps[0] >= self.ttl:
                    timestamps.popleft()
                if not timestamps:
                    to_remove.append(key)
            for key in to_remove:
                del self._data[key]

            # Boyut limiti aşılırsa en eski kayıtları sil
            while len(self._data) > self.max_size:
                self._data.popitem(last=False)

    def add(self, key):
        """Adds a timestamp. Returns True if under limit, False if rate limited.
        Sadece kendi key'inin listesini budar (ucuz, O(kendi kaydı)); süresi
        dolan diğer key'lerin global temizliği ayrı bir arka plan thread'inde
        (_cleanup_all) yapılır."""
        now = time.time()
        with self._lock:
            timestamps = self._data.get(key)
            if timestamps is None:
                timestamps = deque()
                self._data[key] = timestamps
            while timestamps and now - timestamps[0] >= self.ttl:
                timestamps.popleft()

            # En yeni kaydı sona taşı (LRU)
            self._data.move_to_end(key)

            # Reddedilen istekleri kaydetmeyerek tek bir saldırganın timestamp
            # listesini sınırsız büyütmesini önle. Bu, standart sliding-window
            # davranışıdır: en eski kabul edilmiş istek süresi dolunca yeni bir
            # istek için yer açılır.
            if len(timestamps) >= self.max_requests:
                return False
            timestamps.append(now)

            # max_size sınırını yalnızca periyodik sweep'e bırakmak, spoofed IP
            # selinde bir temizlik aralığı boyunca sınırsız büyümeye izin verir.
            # OrderedDict sayesinde en eski kaydı burada O(1) maliyetle atıyoruz.
            while len(self._data) > self.max_size:
                self._data.popitem(last=False)
            return True


rate_limiter = TTLCache(
    ttl=RATE_LIMIT_WINDOW,
    max_size=10000,
    max_requests=RATE_LIMIT_MAX_REQUESTS,
)
conversion_rate_limiter = TTLCache(
    ttl=CONVERSION_RATE_LIMIT_WINDOW,
    max_size=10000,
    max_requests=CONVERSION_RATE_LIMIT_MAX_REQUESTS,
)

# ── Client IP tespiti ─────────────────────────────────
TRUST_PROXY = os.environ.get("TRUST_PROXY", "1") != "0"


def _normalize_client_ip(value):
    try:
        return str(ipaddress.ip_address((value or "").strip()))
    except ValueError:
        return ""


def get_client_ip():
    if TRUST_PROXY:
        # 1. Öncelik: Cloudflare'in kendi header'ı (CF-Connecting-IP)
        cf_ip = request.headers.get('CF-Connecting-IP')
        if cf_ip:
            candidate = _normalize_client_ip(cf_ip)
            if candidate:
                return candidate
        # 2. Fallback: X-Forwarded-For (Railway'de ProxyFix ile parse ediliyor)
        xff = request.headers.get('X-Forwarded-For')
        if xff:
            candidate = _normalize_client_ip(xff.split(',')[0])
            if candidate:
                return candidate
    return _normalize_client_ip(request.remote_addr) or "unknown"


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

if ENABLE_ORIGIN_LOCK and not ORIGIN_SECRET_VALUE:
    if os.environ.get("FLASK_ENV") == "development" or os.environ.get("ALLOW_INSECURE_ORIGIN_LOCK"):
        logger.warning("[INIT] Origin lock is running without ORIGIN_SECRET (development override)")
    else:
        raise RuntimeError(
            "ORIGIN_SECRET environment variable is required when ENABLE_ORIGIN_LOCK is enabled. "
            "Set it in Railway/Cloudflare, disable ENABLE_ORIGIN_LOCK explicitly, or use "
            "ALLOW_INSECURE_ORIGIN_LOCK=1 only for local development."
        )


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
        logger.debug(
            f"[ORIGIN-LOCK] Non-Cloudflare-range IP (bilgi amaçlı, engellenmedi): "
            f"{remote_ip} {request.path}"
        )

    # CORS preflight (OPTIONS) isteklerinde tarayıcı custom header (X-Origin-Verify)
    # gönderemez, bu yüzden preflight'ı burada engellemiyoruz; flask-cors zaten
    # sadece ALLOWED_ORIGINS listesindeki origin'lere doğru CORS header'ları
    # döndürüyor. Asıl doğrulama gerçek istekte (POST/GET vb.) yapılıyor.
    if request.method == "OPTIONS":
        return None

    if ORIGIN_SECRET_VALUE:
        if not hmac.compare_digest(request.headers.get(ORIGIN_SECRET_HEADER, ""), ORIGIN_SECRET_VALUE):
            logger.warning(f"[ORIGIN-LOCK] Secret header missing/invalid: {remote_ip} {request.path}")
            return jsonify({"error": "Not Found"}), 404
    else:
        logger.warning("[ORIGIN-LOCK] ORIGIN_SECRET ayarlı değil — origin-lock etkin şekilde devre dışı. "
                       "Railway env değişkenlerine ORIGIN_SECRET ekleyip Cloudflare'de aynı değeri "
                       "X-Origin-Verify header'ı olarak enjekte eden bir Transform Rule tanımlayın.")

    return None


@app.before_request
def _enforce_maintenance_mode():
    """Bakım sırasında yeni ve pahalı işleri durdur; mevcut dosya/cancel akışını koru."""
    if not MAINTENANCE_MODE or request.method == "OPTIONS":
        return None
    normalized_path = request.path.rstrip("/") or "/"
    if normalized_path not in MAINTENANCE_BLOCKED_PATHS:
        return None

    response = jsonify({
        "error": "ZenithW is temporarily unavailable during maintenance.",
        "error_code": "maintenance",
        "maintenance": True,
        "message": MAINTENANCE_MESSAGE,
        "until": MAINTENANCE_UNTIL or None,
        "retry_after": MAINTENANCE_RETRY_AFTER,
    })
    response.status_code = 503
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Retry-After"] = str(MAINTENANCE_RETRY_AFTER)
    return response

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
conversion_slots = threading.Semaphore(MAX_CONCURRENT_CONVERSIONS)
info_slots = threading.Semaphore(MAX_CONCURRENT_INFO)
thumbnail_slots = threading.Semaphore(MAX_CONCURRENT_THUMBNAILS)
transfer_slots = threading.Semaphore(MAX_CONCURRENT_TRANSFERS)
transfer_lock = threading.Lock()
active_transfers_count = 0
active_transfers_per_ip = defaultdict(int)
info_cache_lock = threading.Lock()
info_response_cache = OrderedDict()
info_inflight = {}
info_cache_hits = 0
info_cache_misses = 0
queue_lock = threading.Lock()
queue_waiting = 0
active_downloads_count = 0


class DownloadQueueFull(Exception):
    pass


class DownloadQueueTimeout(Exception):
    pass


class SpoolBudgetExceeded(Exception):
    pass


def service_busy(message, retry_after=10, status=503):
    response = jsonify({"error": message, "error_code": "server_busy"})
    response.status_code = status
    response.headers["Retry-After"] = str(retry_after)
    return response


def acquire_transfer_slot(ip):
    """Wait for a bounded native-transfer slot without consuming the file token."""
    global active_transfers_count
    deadline = time.monotonic() + TRANSFER_QUEUE_WAIT_SECONDS
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False
        if not transfer_slots.acquire(blocking=True, timeout=min(1, remaining)):
            continue
        with transfer_lock:
            if active_transfers_per_ip[ip] < MAX_CONCURRENT_TRANSFERS_PER_IP:
                active_transfers_per_ip[ip] += 1
                active_transfers_count += 1
                return True
        transfer_slots.release()
        time.sleep(min(0.25, max(0, remaining)))


def release_transfer_slot(ip):
    global active_transfers_count
    with transfer_lock:
        if active_transfers_per_ip.get(ip, 0) > 0:
            active_transfers_per_ip[ip] -= 1
            if active_transfers_per_ip[ip] <= 0:
                active_transfers_per_ip.pop(ip, None)
            active_transfers_count = max(0, active_transfers_count - 1)
            transfer_slots.release()


def _release_download_slot():
    global active_downloads_count
    download_slots.release()
    with queue_lock:
        active_downloads_count = max(0, active_downloads_count - 1)


def acquire_download_slot(sid, cancel_event):
    """Slot boşalana kadar bekler; iptal edilirse DownloadCancelled fırlatır."""
    global queue_waiting, active_downloads_count
    with queue_lock:
        if queue_waiting >= MAX_DOWNLOAD_QUEUE:
            raise DownloadQueueFull("Download queue is full")
        queue_waiting += 1
    wait_deadline = time.monotonic() + MAX_QUEUE_WAIT_SECONDS
    last_queue_emit = 0.0
    last_ahead = None
    try:
        while True:
            if cancel_event.is_set():
                raise yt_dlp.utils.DownloadCancelled("Cancelled")
            remaining = wait_deadline - time.monotonic()
            if remaining <= 0:
                raise DownloadQueueTimeout("Download queue wait timed out")
            if download_slots.acquire(blocking=True, timeout=min(1, remaining)):
                with queue_lock:
                    active_downloads_count += 1
                return True
            if sid:
                with queue_lock:
                    ahead = max(0, queue_waiting - 1)
                now = time.monotonic()
                if ahead != last_ahead or now - last_queue_emit >= 5:
                    try:
                        socketio.emit('progress', {
                            'status': 'queued',
                            'message': f"Server is busy, waiting in queue... ({ahead} ahead)"
                        }, room=sid)
                        last_queue_emit = now
                        last_ahead = ahead
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

# yt-dlp n-challenge çözücüsü için Deno (veya Node/PhantomJS) JS runtime'ı ve
# yt-dlp-ejs paketi gerekiyor. Bunlardan biri eksikse yt-dlp sessizce yavaş/
# eksik bir fallback'e düşüyor (throttle veya "bot" hatası olarak karşımıza
# çıkabiliyor). Deploy sonrası loglardan görünür olsun diye burada kontrol
# ediyoruz.
try:
    import deno as _deno_package
    _DENO_PATH = str(_deno_package.find_deno_bin())
except (ImportError, AttributeError, OSError):
    # Local development fallback. Production installs the pinned PyPI binary.
    _DENO_PATH = shutil.which("deno")
_DENO_VERSION = None
if _DENO_PATH:
    try:
        _deno_version_result = subprocess.run(
            [_DENO_PATH, "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        _DENO_VERSION = (_deno_version_result.stdout or "").splitlines()[0].strip() or None
    except (OSError, subprocess.SubprocessError):
        _DENO_VERSION = None
try:
    import yt_dlp_ejs  # noqa: F401
    _EJS_AVAILABLE = True
except ImportError:
    _EJS_AVAILABLE = False

try:
    _POT_PLUGIN_VERSION = package_version("bgutil-ytdlp-pot-provider")
except PackageNotFoundError:
    _POT_PLUGIN_VERSION = None

if POT_PROVIDER_URL and not _POT_PLUGIN_VERSION:
    raise RuntimeError(
        "YOUTUBE_POT_PROVIDER_URL is configured but bgutil-ytdlp-pot-provider is not installed"
    )

if _DENO_PATH and _EJS_AVAILABLE:
    logger.info(
        f"[INIT] yt-dlp JS solver: OK "
        f"(deno={_DENO_PATH}, version={_DENO_VERSION or 'unknown'}, yt-dlp-ejs=loaded)"
    )
else:
    logger.warning(
        f"[INIT] yt-dlp JS solver INCOMPLETE (deno={'found' if _DENO_PATH else 'MISSING'}, "
        f"yt-dlp-ejs={'loaded' if _EJS_AVAILABLE else 'MISSING'}) — "
        "n-challenge çözümü yavaş/eksik fallback'e düşebilir, throttle veya "
        "bot-detection hatalarına yol açabilir."
    )

if POT_PROVIDER_URL:
    logger.info(
        f"[INIT] YouTube PO Token provider configured "
        f"(host={POT_PROVIDER_HOST}:{POT_PROVIDER_PORT}, plugin={_POT_PLUGIN_VERSION}, "
        "client=mweb, video_fallback=default)"
    )
else:
    logger.info("[INIT] YouTube PO Token provider disabled (YOUTUBE_POT_PROVIDER_URL not set)")

# aria2c SSRF bypass riski nedeniyle tamamen devre dışı bırakıldı.
# Gelecekte container seviyesinde egress firewall kurulursa tekrar açılabilir.
ARIA2_PATH = None
logger.info("[INIT] aria2c disabled (SSRF protection)")

# ── Temizlik ──────────────────────────────────────────
# YENİ: Kesin dosya temizliği için pending cleanups (path -> register timestamp)
_pending_cleanups = {}
_pending_cleanups_lock = threading.Lock()
_prepared_files = {}
_prepared_files_lock = threading.Lock()
_spool_lock = threading.Lock()
_spool_reservations = {}
_spool_paths = {}
# Bir dosya bu süreden uzun süredir pending_cleanups'ta kalıyorsa (yani normal
# akış -- send_file/call_on_close -- onu hiç kapatmamış demektir; muhtemelen
# terk edilmiş bir download/convert), periyodik cleanup tarafından zorla
# silinir. _register_cleanup() dosya diske yazılır yazılmaz (stream/mute
# başlamadan önce) çağrıldığı için süre; olası mute adımını (FFMPEG_TIMEOUT),
# indirme sürecinin kendisini (DOWNLOAD_TIMEOUT_SECONDS) ve büyük dosyayı
# yavaş bir bağlantıyla client'a stream etme süresini (FILE_MAX_AGE kadar
# ekstra pay) kapsayacak şekilde geniş tutuluyor. Böylece hâlâ aktif olarak
# indirilmekte olan büyük/yavaş dosyalar yanlışlıkla silinmez.
PENDING_CLEANUP_MAX_AGE = FFMPEG_TIMEOUT + DOWNLOAD_TIMEOUT_SECONDS + FILE_MAX_AGE


def _register_cleanup(path):
    with _pending_cleanups_lock:
        _pending_cleanups[path] = time.time()


def _unregister_cleanup(path):
    with _pending_cleanups_lock:
        _pending_cleanups.pop(path, None)


def _spool_path_key(path):
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


def reserve_spool(byte_count, purpose):
    """Reserve aggregate disk capacity before accepting an expensive job."""
    byte_count = max(0, int(byte_count))
    if byte_count <= 0 or byte_count > MAX_SPOOL_SIZE_BYTES:
        return None
    try:
        free_bytes = shutil.disk_usage(DOWNLOAD_DIR).free
    except OSError:
        return None
    with _spool_lock:
        logical_total = sum(item["bytes"] for item in _spool_reservations.values())
        active_reserved = sum(
            item["bytes"] for item in _spool_reservations.values()
            if item["state"] == "active"
        )
        if logical_total + byte_count > MAX_SPOOL_SIZE_BYTES:
            return None
        # Prepared bytes are already reflected in free_bytes. Active reservations
        # are future growth, so subtract them before admitting another job.
        if free_bytes < MIN_FREE_DISK_BYTES + active_reserved + byte_count:
            return None
        reservation_id = secrets.token_urlsafe(24)
        _spool_reservations[reservation_id] = {
            "bytes": byte_count,
            "purpose": purpose,
            "state": "active",
            "path": None,
        }
        return reservation_id


def commit_spool(reservation_id, path, actual_bytes):
    """Convert an active estimate into the exact prepared-file reservation."""
    actual_bytes = max(0, int(actual_bytes))
    if not reservation_id or actual_bytes <= 0:
        return False
    path_key = _spool_path_key(path)
    with _spool_lock:
        record = _spool_reservations.get(reservation_id)
        if not record:
            return False
        other_total = sum(
            item["bytes"] for key, item in _spool_reservations.items()
            if key != reservation_id
        )
        if other_total + actual_bytes > MAX_SPOOL_SIZE_BYTES:
            return False
        old_path = record.get("path")
        if old_path:
            _spool_paths.pop(old_path, None)
        record.update(bytes=actual_bytes, state="prepared", path=path_key)
        _spool_paths[path_key] = reservation_id
        return True


def release_spool(reservation_id):
    if not reservation_id:
        return
    with _spool_lock:
        record = _spool_reservations.pop(reservation_id, None)
        if record and record.get("path"):
            _spool_paths.pop(record["path"], None)


def release_spool_for_path(path):
    if not path:
        return
    path_key = _spool_path_key(path)
    with _spool_lock:
        reservation_id = _spool_paths.pop(path_key, None)
        if reservation_id:
            _spool_reservations.pop(reservation_id, None)


def spool_snapshot():
    with _spool_lock:
        records = list(_spool_reservations.values())
    return {
        "reserved_bytes": sum(item["bytes"] for item in records),
        "active_reserved_bytes": sum(
            item["bytes"] for item in records if item["state"] == "active"
        ),
        "prepared_bytes": sum(
            item["bytes"] for item in records if item["state"] == "prepared"
        ),
    }


def has_minimum_free_disk():
    try:
        return shutil.disk_usage(DOWNLOAD_DIR).free >= MIN_FREE_DISK_BYTES
    except OSError:
        return False


def _force_cleanup(path):
    """Dosyayı diskten siler ve pending_cleanups'tan çıkarır.
    NOT: _pending_cleanups_lock tutulurken çağrılmamalı -- kendi içinde
    locku alır (reentrant olmayan threading.Lock nedeniyle nested acquire
    deadlock'a yol açar)."""
    removed = False
    try:
        if path and os.path.exists(path):
            os.remove(path)
        removed = not path or not os.path.exists(path)
    except Exception:
        pass
    try:
        if removed:
            release_spool_for_path(path)
        with _pending_cleanups_lock:
            if removed:
                _pending_cleanups.pop(path, None)
    except Exception:
        pass


def cleanup_download_artifacts(file_token):
    """Remove only files belonging to one internal download token.

    yt-dlp may leave .part, subtitle, thumbnail or post-processing files behind
    after cancellation and timeout. Requiring an exact token or ``token.``
    prefix prevents a short token from deleting another job's artifacts.
    """
    if not isinstance(file_token, str) or not DOWNLOAD_ID_RE.fullmatch(file_token):
        return 0
    try:
        names = os.listdir(DOWNLOAD_DIR)
    except OSError:
        return 0
    removed = 0
    for name in names:
        if name != file_token and not name.startswith(f"{file_token}."):
            continue
        path = os.path.join(DOWNLOAD_DIR, name)
        if not os.path.isfile(path):
            continue
        existed = os.path.exists(path)
        _force_cleanup(path)
        if existed and not os.path.exists(path):
            removed += 1
    return removed


def prepare_native_download(path, download_name, owner_ip, reservation_id):
    """Tamamlanan dosyayı kısa ömürlü, tahmin edilemez bir indirme token'ına bağlar."""
    try:
        actual_bytes = os.path.getsize(path)
    except OSError as exc:
        raise SpoolBudgetExceeded("Prepared file is no longer available") from exc
    if not commit_spool(reservation_id, path, actual_bytes):
        raise SpoolBudgetExceeded("Prepared-file spool budget exceeded")
    expires_at = time.time() + PREPARED_FILE_TTL
    with _prepared_files_lock:
        while True:
            token = secrets.token_urlsafe(32)
            if token not in _prepared_files:
                _prepared_files[token] = {
                    "path": path,
                    "download_name": download_name,
                    "owner_ip": owner_ip,
                    "expires_at": expires_at,
                    "reservation_id": reservation_id,
                }
                return token


def cleanup_expired_prepared_files():
    now = time.time()
    expired_paths = []
    with _prepared_files_lock:
        for token, entry in list(_prepared_files.items()):
            if now >= entry["expires_at"]:
                expired_paths.append(entry["path"])
                del _prepared_files[token]
    for path in expired_paths:
        _force_cleanup(path)


def cleanup_old_files():
    try:
        now = time.time()
        for f in os.listdir(DOWNLOAD_DIR):
            fpath = os.path.join(DOWNLOAD_DIR, f)
            if os.path.isfile(fpath) and now - os.path.getmtime(fpath) > FILE_MAX_AGE:
                _force_cleanup(fpath)
        # YENİ: pending_cleanups'ta uzun süredir (PENDING_CLEANUP_MAX_AGE'den
        # fazla) bekleyen, yani normal akışta hiç kapanmamış/unutulmuş
        # kayıtları zorla temizle. Lock'u sadece snapshot almak için tutuyoruz;
        # _force_cleanup() kendi locku aldığı için burada lock tutarken
        # çağrılmıyor (deadlock önlemi).
        with _pending_cleanups_lock:
            stale_paths = [p for p, ts in _pending_cleanups.items()
                           if now - ts > PENDING_CLEANUP_MAX_AGE]
        for path in stale_paths:
            _force_cleanup(path)
    except Exception as e:
        logger.error(f"[CLEANUP] Failed to clean old files: {e}")


def periodic_cleanup():
    while True:
        time.sleep(FILE_CLEANUP_INTERVAL)
        cleanup_old_files()
        cleanup_stale_cancel_events()  # YENİ
        cleanup_expired_prepared_files()


def periodic_rate_limiter_cleanup():
    """rate_limiter'ın O(n) global taramasını request path'inden ayırıp
    kendi periyodik thread'ine taşır (bkz. OPTIMIZATIONS.md Finding 2)."""
    while True:
        time.sleep(RATE_LIMIT_CLEANUP_INTERVAL)
        rate_limiter._cleanup_all()
        conversion_rate_limiter._cleanup_all()


def periodic_prepared_file_cleanup():
    while True:
        time.sleep(60)
        cleanup_expired_prepared_files()


threading.Thread(target=periodic_cleanup, daemon=True).start()
threading.Thread(target=periodic_rate_limiter_cleanup, daemon=True).start()
threading.Thread(target=periodic_prepared_file_cleanup, daemon=True).start()

# ── İptal ─────────────────────────────────────────────
cancel_events = {}
cancel_events_lock = threading.Lock()
DOWNLOAD_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def reserve_download_id(requested_id, cancel_event, ip):
    """Geçerli ve aktif kayıtlarla çakışmayan bir download_id ayırır.

    Frontend iptal isteğini indirme tamamlanmadan gönderebildiği için istemcinin
    ürettiği ID korunur; fakat formatı doğrulanır ve aynı aktif ID'nin başka bir
    isteği ezmesine izin verilmez.
    """
    if requested_id not in (None, ""):
        if not isinstance(requested_id, str):
            raise ValueError("Invalid download_id")
        candidate = requested_id.strip()
        if not DOWNLOAD_ID_RE.fullmatch(candidate):
            raise ValueError("Invalid download_id")
        with cancel_events_lock:
            if candidate in cancel_events:
                return None
            cancel_events[candidate] = (cancel_event, ip, time.time())
        return candidate

    # Server-generated UUID çakışması teorik olarak mümkün olduğundan kayıt
    # kontrolü ve ekleme aynı lock altında yapılır.
    with cancel_events_lock:
        while True:
            candidate = str(uuid.uuid4())
            if candidate not in cancel_events:
                cancel_events[candidate] = (cancel_event, ip, time.time())
                return candidate


def discard_cancel_event(download_id):
    """Idempotently release one request's process-local cancellation record."""
    if not download_id:
        return
    with cancel_events_lock:
        cancel_events.pop(download_id, None)


# YENİ: Stale cancel event'lerini temizle
def cleanup_stale_cancel_events():
    now = time.time()
    with cancel_events_lock:
        stale = []
        for dl_id, entry in cancel_events.items():
            # entry: (event, ip, timestamp)
            if len(entry) >= 3 and now - entry[2] > CANCEL_EVENT_MAX_AGE:
                stale.append(dl_id)
        for dl_id in stale:
            del cancel_events[dl_id]
            logger.info(f"[CANCEL CLEANUP] Removed stale cancel_event: {dl_id}")

# ── Bağlı Socket.IO sid'leri ────────────────────────────
# YENİ: connected_sids artık dict (sid -> timestamp), memory leak önlendi
connected_sids = {}
connected_sids_lock = threading.Lock()


def validate_sid(sid):
    if not sid:
        return ""
    with connected_sids_lock:
        now = time.time()
        # Eski kayıtları temizle
        stale = [s for s, ts in connected_sids.items() if now - ts > CONNECTED_SID_MAX_AGE]
        for s in stale:
            del connected_sids[s]
        # SID geçerli mi kontrol et
        if sid in connected_sids:
            connected_sids[sid] = now  # timestamp güncelle
            return sid
        return ""


def safe_emit(event, data, room=None):
    """SocketIO emit wrapper with error handling."""
    try:
        socketio.emit(event, data, room=room)
    except Exception as e:
        logger.warning(f"[SOCKET] Emit failed for room {room}: {e}")

# ── Platform helpers ──────────────────────────────────
# NOT: Önceden "domain in url" substring kontrolü yapılıyordu (ör. "youtube.com" in u).
# Bu, https://evil.com/?x=youtube.com gibi URL'lerde yanlış pozitif/negatif
# sınıflandırmaya yol açabiliyordu -- gerçek güvenlik kontrolü değil (SSRF
# koruması is_safe_url()/DNS çözümlemesi üzerinden ayrı yapılıyor), ama
# extractor_args/PO-token seçimini ve platform bazlı hata mesajlarını
# yanlış URL'lere uygulayabiliyordu. Artık yalnızca gerçek hostname (ve alt
# alan adları) eşleşiyor.
def _get_hostname(u):
    try:
        return (urlparse(u).hostname or "").lower()
    except Exception:
        return ""


def _hostname_matches(hostname, domain):
    return bool(hostname) and (hostname == domain or hostname.endswith("." + domain))


def is_youtube(u):
    h = _get_hostname(u)
    return _hostname_matches(h, "youtube.com") or _hostname_matches(h, "youtu.be")


def is_tiktok(u):
    return _hostname_matches(_get_hostname(u), "tiktok.com")


def is_instagram(u):
    return _hostname_matches(_get_hostname(u), "instagram.com")


def is_youtube_live_url(u): return is_youtube(u) and "/live/" in u

UNSUPPORTED_DOMAINS = (
    "spotify.com", "music.apple.com", "deezer.com", "tidal.com",
    "music.amazon.com",
)


def is_unsupported_domain(u):
    h = _get_hostname(u)
    return any(_hostname_matches(h, d) for d in UNSUPPORTED_DOMAINS)

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
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        return False
    # URL validation and the guarded connection share the exact host+port IP
    # tuple. This removes duplicate DNS work without caching a boolean-only
    # safety decision or introducing a second rebinding opportunity.
    return bool(_resolve_safe_host_cached(hostname, port, allow_private_provider=False))


# Socket-level SSRF guard: her bağlantı anında hedef IP kontrolü
_orig_create_connection = socket.create_connection
_orig_socket_connect = socket.socket.connect
_orig_socket_connect_ex = socket.socket.connect_ex

# Hostname -> doğrulanmış public IP listesi için kısa TTL'li cache.
# Yalnızca boolean "safe" sonucu cache'lemek güvenli değildir: sonraki gerçek
# bağlantı hostname'i tekrar çözümler ve DNS rebinding ile private IP'ye
# gidebilir. Bu cache doğrulanan IP'leri saklar; bağlantı da hostname yerine
# doğrudan bu IP'lerden birine kurulur. Engellenen sonuçlar cache'lenmez.
SSRF_HOST_CACHE_TTL = 30  # saniye -- rebinding penceresini kısa tutmak için
SSRF_HOST_CACHE_MAX_SIZE = 2000
_ssrf_safe_host_cache = OrderedDict()  # (host, port, private-provider-policy) -> (expiry, approved_ips)
_ssrf_safe_host_cache_lock = threading.Lock()
_ssrf_trusted_private_target = contextvars.ContextVar(
    "ssrf_trusted_private_target", default=frozenset()
)


def _is_pot_provider_destination(host, port):
    if not POT_PROVIDER_HOST or not isinstance(host, str):
        return False
    try:
        normalized_port = int(port)
    except (TypeError, ValueError):
        return False
    return (
        host.lower().rstrip(".") == POT_PROVIDER_HOST
        and normalized_port == POT_PROVIDER_PORT
    )


def _trusted_private_ip(ip_str, port):
    try:
        normalized_ip = str(ipaddress.ip_address(ip_str.split("%", 1)[0]))
        normalized_port = int(port)
    except (TypeError, ValueError):
        return False
    return (normalized_ip, normalized_port) in _ssrf_trusted_private_target.get()


def _resolve_safe_host_cached(host, port, allow_private_provider=False):
    """Resolve public hosts, plus the one explicitly configured POT service."""
    if not isinstance(host, str):
        return ()
    try:
        normalized_port = int(port)
    except (TypeError, ValueError):
        return ()
    if not (1 <= normalized_port <= 65535):
        return ()
    cache_key = (host.lower(), normalized_port, bool(allow_private_provider))
    now = time.time()
    with _ssrf_safe_host_cache_lock:
        cached = _ssrf_safe_host_cache.get(cache_key)
        if cached is not None and now < cached[0]:
            _ssrf_safe_host_cache.move_to_end(cache_key)
            return cached[1]
        if cached is not None:
            _ssrf_safe_host_cache.pop(cache_key, None)
    try:
        infos = socket.getaddrinfo(host, normalized_port, type=socket.SOCK_STREAM)
    except Exception:
        return ()

    trusted_provider = (
        allow_private_provider and _is_pot_provider_destination(host, normalized_port)
    )
    safe_ips = []
    for info in infos:
        ip_str = info[4][0]
        # Bir hostname hem public hem private adres döndürüyorsa tamamını engelle;
        # resolver sırası değiştiğinde private adrese düşme riski alınmamalı.
        # Tek istisna, startup'ta doğrulanan sabit POT provider host+port'udur.
        if _is_private_ip(ip_str) and not trusted_provider:
            return ()
        if ip_str not in safe_ips:
            safe_ips.append(ip_str)
    if not safe_ips:
        return ()

    result = tuple(safe_ips)
    with _ssrf_safe_host_cache_lock:
        _ssrf_safe_host_cache[cache_key] = (now + SSRF_HOST_CACHE_TTL, result)
        _ssrf_safe_host_cache.move_to_end(cache_key)
        while len(_ssrf_safe_host_cache) > SSRF_HOST_CACHE_MAX_SIZE:
            _ssrf_safe_host_cache.popitem(last=False)
    return result


@contextmanager
def _pot_provider_network_scope(url):
    """Allow only the configured POT host's resolved IPs during YouTube work.

    yt-dlp can resolve the provider hostname before calling the low-level
    socket method, so that method may receive a raw Railway-private IP and no
    longer know its original hostname. Keep the exact resolved IP+port pairs
    in a context-local allowlist for the lifetime of this extraction only.
    """
    if not (POT_PROVIDER_URL and is_youtube(url)):
        yield
        return
    safe_ips = _resolve_safe_host_cached(
        POT_PROVIDER_HOST,
        POT_PROVIDER_PORT,
        allow_private_provider=True,
    )
    trusted_targets = {
        (str(ipaddress.ip_address(ip.split("%", 1)[0])), POT_PROVIDER_PORT)
        for ip in safe_ips
    }
    previous_targets = _ssrf_trusted_private_target.get()
    context_token = _ssrf_trusted_private_target.set(
        frozenset(previous_targets | trusted_targets)
    )
    try:
        yield
    finally:
        _ssrf_trusted_private_target.reset(context_token)


def _guarded_create_connection(address, *args, **kwargs):
    host, port = address
    try:
        ip = ipaddress.ip_address(host)
        if _is_private_ip(str(ip)) and not _trusted_private_ip(str(ip), port):
            raise PermissionError(f"SSRF protection: connection to {host} blocked")
        return _orig_create_connection(address, *args, **kwargs)
    except ValueError:
        # Hostname'i bir kez çözümle, doğrulanan IP'ye doğrudan bağlan. Böylece
        # güvenlik kontrolü ile gerçek bağlantı arasında ikinci DNS çözümlemesi
        # (TOCTOU / DNS rebinding) oluşmaz.
        allow_private_provider = (
            _is_pot_provider_destination(host, port)
            and bool(_ssrf_trusted_private_target.get())
        )
        safe_ips = _resolve_safe_host_cached(
            host,
            port,
            allow_private_provider=allow_private_provider,
        )
        if not safe_ips:
            raise PermissionError(f"SSRF protection: connection to {host} blocked")

        last_error = None
        for safe_ip in safe_ips:
            context_token = None
            try:
                if _is_private_ip(safe_ip):
                    trusted_targets = set(_ssrf_trusted_private_target.get())
                    trusted_targets.add(
                        (str(ipaddress.ip_address(safe_ip.split("%", 1)[0])), int(port))
                    )
                    context_token = _ssrf_trusted_private_target.set(
                        frozenset(trusted_targets)
                    )
                return _orig_create_connection((safe_ip, port), *args, **kwargs)
            except OSError as exc:
                last_error = exc
            finally:
                if context_token is not None:
                    _ssrf_trusted_private_target.reset(context_token)
        if last_error is not None:
            raise last_error
        raise OSError(f"Could not connect to {host}")


def _safe_socket_address(address, socket_family=None):
    """Low-level socket kullanıcılarını da private/link-local ağlardan uzak tutar.

    requests/urllib3 gibi bazı istemciler socket.create_connection yerine
    socket.socket.connect çağırabildiği için yalnızca üst seviye wrapper yeterli
    değildir. Hostname gelirse güvenli public IP'ye burada sabitlenir; IP gelirse
    bağlantıdan hemen önce tekrar kontrol edilir.
    """
    if not isinstance(address, tuple) or len(address) < 2:
        return address
    host, port, *rest = address
    if not isinstance(host, str):
        raise PermissionError("SSRF protection: invalid socket destination")
    try:
        ip = ipaddress.ip_address(host.split("%", 1)[0])
    except ValueError:
        allow_private_provider = (
            _is_pot_provider_destination(host, port)
            and bool(_ssrf_trusted_private_target.get())
        )
        safe_ips = _resolve_safe_host_cached(
            host,
            port,
            allow_private_provider=allow_private_provider,
        )
        if not safe_ips:
            raise PermissionError(f"SSRF protection: connection to {host} blocked")
        if socket_family == socket.AF_INET:
            safe_ips = tuple(ip for ip in safe_ips if ipaddress.ip_address(ip.split("%", 1)[0]).version == 4)
        elif socket_family == socket.AF_INET6:
            safe_ips = tuple(ip for ip in safe_ips if ipaddress.ip_address(ip.split("%", 1)[0]).version == 6)
        if not safe_ips:
            raise OSError(f"No address compatible with socket family for {host}")
        host = safe_ips[0]
    else:
        if _is_private_ip(str(ip)) and not _trusted_private_ip(str(ip), port):
            raise PermissionError(f"SSRF protection: connection to {host} blocked")
    return (host, port, *rest)


def _guarded_socket_connect(sock, address):
    return _orig_socket_connect(sock, _safe_socket_address(address, sock.family))


def _guarded_socket_connect_ex(sock, address):
    return _orig_socket_connect_ex(sock, _safe_socket_address(address, sock.family))


socket.create_connection = _guarded_create_connection
socket.socket.connect = _guarded_socket_connect
socket.socket.connect_ex = _guarded_socket_connect_ex

AUDIO_FMTS = {"mp3", "flac", "wav", "ogg", "opus", "m4a"}

# ── Hata mesajları ────────────────────────────────────
PUBLIC_ERROR_MESSAGES = {
    "playlist_not_supported": "Playlist downloads are not supported. Select a single video.",
    "video_too_long": "This video is longer than the allowed limit.",
    "youtube_restricted": "YouTube did not allow this download. Please wait a few minutes and try again.",
    "private_video": "This video is private and cannot be downloaded.",
    "copyright_restricted": "This video cannot be downloaded due to a copyright restriction.",
    "age_restricted": "This video is age-restricted and cannot be accessed right now.",
    "format_unavailable": "The selected format is not available. Try another format or quality.",
    "video_unavailable": "This video is currently unavailable.",
    "live_not_supported": "Live streams are not currently supported.",
    "instagram_ratelimit": "Instagram is temporarily limiting requests. Please try again shortly.",
    "platform_restricted": "The platform did not allow this download. Please try again later.",
    "unsupported_url": "This link or platform is not supported.",
    "network_error": "A connection problem occurred. Please try again.",
    "request_timeout": "The request took too long. Please try again.",
    "request_failed": "The request could not be completed. Please try again.",
}


def classify_error(error_msg, url):
    """Map upstream/technical failures to stable codes safe for public clients."""
    es = str(error_msg or "").lower()
    if "playlist downloads are not supported" in es:
        return "playlist_not_supported"
    if "video too long" in es:
        return "video_too_long"
    if "timed out" in es or "timeout" in es:
        return "request_timeout"
    if is_youtube(url):
        if "private video" in es or ("private" in es and "video" in es):
            return "private_video"
        if "copyright" in es:
            return "copyright_restricted"
        if any(token in es for token in ("age-restricted", "age restricted", "confirm your age")):
            return "age_restricted"
        # "Requested format is not available" also contains "not available";
        # classify it before the generic unavailable-video branch.
        if "format" in es:
            return "format_unavailable"
        if "live" in es:
            return "live_not_supported"
        if "unavailable" in es or "not available" in es:
            return "video_unavailable"
        if any(token in es for token in ("sign in", "login", "bot", "403", "forbidden", "po token")):
            return "youtube_restricted"
        return "youtube_restricted"
    if is_instagram(url):
        if "rate" in es or "429" in es:
            return "instagram_ratelimit"
        if "login" in es or "private" in es:
            return "platform_restricted"
        return "platform_restricted"
    if is_tiktok(url):
        return "platform_restricted"
    if "unsupported url" in es:
        return "unsupported_url"
    if "no video formats" in es or "requested format" in es:
        return "format_unavailable"
    if any(token in es for token in ("network", "connection", "403", "forbidden")):
        return "network_error"
    return "request_failed"


def parse_error(error_msg, url):
    code = classify_error(error_msg, url)
    if code == "instagram_ratelimit":
        return code  # Legacy frontend compatibility.
    return PUBLIC_ERROR_MESSAGES[code]


def public_error_payload(error_msg, url):
    code = classify_error(error_msg, url)
    return {
        "error": PUBLIC_ERROR_MESSAGES[code],
        "error_code": code,
    }


def remember_primary_error(primary_error, candidate):
    """Keep the first meaningful failure across cookie/cookieless fallbacks."""
    if primary_error is None:
        return candidate
    primary_text = str(primary_error).lower()
    candidate_text = str(candidate).lower()
    # A cookie-file parsing/config error is only about the first attempt; if
    # the cookieless fallback also fails, that later failure is more useful.
    if "cookie" in primary_text and "cookie" not in candidate_text:
        return candidate
    return primary_error

# ── Base opts ─────────────────────────────────────────
FFMPEG_LOCAL_PROTOCOLS = "file,pipe,crypto,data"


def get_base_opts(url, use_cookies=True, youtube_player_clients=None):
    opts = {
        "quiet": True,
        "no_warnings": True,
        # Ağ indirmelerini Python içinde tut; böylece socket seviyesindeki SSRF
        # koruması her bağlantıda uygulanır. FFmpeg yalnızca yerel post-process
        # girdilerini okuyabilir ve uzak manifest/segment açamaz.
        "hls_prefer_native": True,
        "external_downloader": {
            "default": "native",
            "http": "native",
            "https": "native",
            "m3u8": "native",
            "dash": "native",
        },
        "external_downloader_args": {
            "ffmpeg_i": ["-protocol_whitelist", FFMPEG_LOCAL_PROTOCOLS],
        },
        "postprocessor_args": {
            "ffmpeg_i": ["-protocol_whitelist", FFMPEG_LOCAL_PROTOCOLS],
        },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        },
    }
    if POT_PROVIDER_URL and is_youtube(url):
        # Keep provider failures visible in Railway logs while public clients
        # continue receiving the sanitized error_code/message payload.
        opts["no_warnings"] = False
        opts["extractor_args"] = {
            "youtube": {
                "player_client": youtube_player_clients or ["mweb"],
                # yt-dlp's auto policy can decide not to fetch a token before
                # it filters the mweb formats that require one. Since a
                # provider is explicitly configured, always request the token.
                "fetch_pot": ["always"],
            },
            "youtubepot-bgutilhttp": {
                "base_url": [POT_PROVIDER_URL],
            },
        }
        if _DENO_PATH:
            # Do not rely on yt-dlp rediscovering the Nix-provided runtime in
            # the worker environment; pass the verified executable directly.
            opts["js_runtimes"] = {
                "deno": {"path": _DENO_PATH},
            }
            # The installed yt-dlp-ejs package is preferred. This official npm
            # source is a fallback when yt-dlp rejects/misses the local script
            # bundle after a YouTube player update.
            opts["remote_components"] = {"ejs:npm"}
    if FFMPEG_DIR:
        opts["ffmpeg_location"] = FFMPEG_DIR
    # aria2c kaldırıldı: SSRF korumasını bypass ediyordu
    if use_cookies and os.path.exists(COOKIES_FILE) and not is_instagram(url):
        opts["cookiefile"] = COOKIES_FILE
    return opts


def get_opts_list(url, extra=None, youtube_video_fallback=False):
    opts_list = []
    o = get_base_opts(url, use_cookies=True)
    if extra:
        o.update(extra)
    opts_list.append(o)
    # Cookie gerçekten kullanılıyorsa ikinci denemeyi cookie'siz fallback olarak
    # ekle. Cookie dosyası yokken veya Instagram'da iki özdeş upstream isteği
    # çalıştırmak yalnızca hata/latency yükünü ikiye katlıyordu.
    if "cookiefile" in o:
        o = get_base_opts(url, use_cookies=False)
        if extra:
            o.update(extra)
        opts_list.append(o)
    # mweb + PO Token ana YouTube yoludur. Bazı videolarda yalnızca ses
    # formatları dönerken video formatları mweb yanıtında eksik kalabiliyor.
    # Bu durumda yalnızca video indirmelerinde yt-dlp'nin güncel varsayılan
    # istemci grubunu bir kez dene; çalışan MP3 yolunu ek istekle yavaşlatma.
    if youtube_video_fallback and POT_PROVIDER_URL and is_youtube(url):
        o = get_base_opts(
            url,
            use_cookies=False,
            youtube_player_clients=["default"],
        )
        if extra:
            o.update(extra)
        opts_list.append(o)
    return opts_list

# ── Format string builder ─────────────────────────────
def build_format_str(url, quality, fmt, codec, mute=False):
    if fmt in AUDIO_FMTS:
        return "bestaudio/best"
    q = str(quality)
    best = (q == "9999")
    if is_youtube(url):
        if mute:
            height_filter = "" if best else f"[height<={q}]"
            if codec == "av1":
                return f"bestvideo[vcodec^=av01]{height_filter}/bestvideo{height_filter}"
            if codec == "vp9":
                return f"bestvideo[vcodec^=vp9]{height_filter}/bestvideo{height_filter}"
            return f"bestvideo[vcodec^=avc1]{height_filter}/bestvideo{height_filter}"
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


def enforce_download_limits(info, *, incomplete=False):
    """Playlist ve süre sınırlarını yt-dlp'nin tek extraction akışında uygular."""
    # yt-dlp playlist container'ını match_filter'a incomplete=True ve
    # playlist_index olmadan geçirir. Entry'lerde playlist_index bulunduğu için
    # yalnızca container reddedilir; video+playlist URL'sinde noplaylist tek
    # videoyu seçmeye devam eder.
    if incomplete and info.get("playlist") and info.get("playlist_index") is None:
        return "Playlist downloads are not supported. Select a single video."
    duration = info.get("duration")
    if duration and duration > MAX_VIDEO_DURATION_SECONDS:
        max_min = MAX_VIDEO_DURATION_SECONDS // 60
        return f"Video too long (maximum {max_min} minutes)."
    safe_protocols = {
        "", "http", "https", "m3u8", "m3u8_native",
        "dash", "http_dash_segments", "https_fragments",
    }

    def has_unsafe_protocol(raw_protocol):
        # yt-dlp, ayrı video+ses akışlarını seçtiğinde üst protokolü
        # "https+https" veya "m3u8_native+https" biçiminde birleştirir.
        # Her parçayı tek tek doğrula; böylece güvenli birleşimler çalışırken
        # "https+file" gibi yerel/tehlikeli bir protokol yine reddedilir.
        parts = {
            part.strip().lower()
            for part in str(raw_protocol or "").split("+")
            if part.strip()
        }
        return any(part not in safe_protocols for part in parts)

    if has_unsafe_protocol(info.get("protocol")):
        return "Remote media protocol is not allowed."
    for selected_format in info.get("requested_formats") or ():
        if isinstance(selected_format, dict) and has_unsafe_protocol(selected_format.get("protocol")):
            return "Remote media protocol is not allowed."
    return None


def sanitize_filename(name):
    """Dosya adı için güvenli string üretir."""
    if not name:
        return "zenithw"
    # Path traversal ve özel karakterleri temizle
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    name = name[:80]  # Maksimum uzunluk
    return name if name else "zenithw"


def safe_download_name(requested_name, fallback_stem, extension):
    stem = fallback_stem or "zenithw"
    if isinstance(requested_name, str) and requested_name.strip():
        stem = os.path.splitext(os.path.basename(requested_name.strip()))[0]
    return f"{sanitize_filename(stem)}.{extension}"


_NON_MEDIA_EXTENSIONS = {
    ".part", ".ytdl", ".srt", ".vtt", ".ass", ".lrc", ".json",
    ".jpg", ".jpeg", ".png", ".webp",
}


def _validated_output_path(path, file_token, allowed_extensions=None):
    """yt-dlp'den gelen yolu DOWNLOAD_DIR içinde var olan güvenli dosyaya çevirir."""
    if not isinstance(path, (str, os.PathLike)):
        return None
    candidate = os.path.realpath(os.path.abspath(os.fspath(path)))
    download_root = os.path.realpath(os.path.abspath(DOWNLOAD_DIR))
    try:
        if os.path.commonpath((candidate, download_root)) != download_root:
            return None
    except ValueError:
        return None
    basename = os.path.basename(candidate)
    if not basename.startswith(f"{file_token}.") or not os.path.isfile(candidate):
        return None
    extension = os.path.splitext(candidate)[1].lower()
    if allowed_extensions is not None:
        if extension not in allowed_extensions:
            return None
    elif extension in _NON_MEDIA_EXTENSIONS:
        return None
    return candidate


def resolve_downloaded_media_path(info, file_token):
    """yt-dlp'nin döndürdüğü resmi filepath alanlarından final medyayı bulur.

    Klasörü prefix ile taramak; subtitle, thumbnail, .part veya fragment dosyasını
    asıl medya sanabiliyordu. Burada yalnızca extraction sonucuna bağlı yollar
    kabul edilir ve her aday DOWNLOAD_DIR/file_token sınırına karşı doğrulanır.
    """
    if not isinstance(info, dict):
        return None
    candidates = [info.get("filepath"), info.get("_filename")]
    for item in info.get("requested_downloads") or ():
        if isinstance(item, dict):
            candidates.append(item.get("filepath"))
    for item in info.get("requested_formats") or ():
        if isinstance(item, dict):
            candidates.append(item.get("filepath"))
    for candidate in candidates:
        resolved = _validated_output_path(candidate, file_token)
        if resolved:
            return resolved
    return None


def resolve_downloaded_thumbnail_path(info, file_token):
    """Thumbnail sonucunu yt-dlp metadata'sından veya deterministik JPG yolundan bulur."""
    candidates = []
    if isinstance(info, dict):
        for item in info.get("thumbnails") or ():
            if isinstance(item, dict):
                candidates.append(item.get("filepath"))
    candidates.append(os.path.join(DOWNLOAD_DIR, f"{file_token}.jpg"))
    for candidate in candidates:
        resolved = _validated_output_path(candidate, file_token, {".jpg", ".jpeg"})
        if resolved:
            return resolved
    return None


ALLOWED_SPONSORBLOCK_CATEGORIES = {
    "sponsor", "intro", "outro", "selfpromo", "preview",
    "filler", "interaction", "music_offtopic", "poi_highlight",
    "chapter", "exclusive_access",
}
ALLOWED_DOWNLOAD_FORMATS = {"mp4", "webm", "mkv", "avi", "mov"} | AUDIO_FMTS
ALLOWED_VIDEO_CODECS = {"h264", "av1", "vp9"}


class DownloadRequestError(ValueError):
    pass


def parse_download_request(data):
    """Validate and normalize the JSON contract before reserving job state."""
    if not isinstance(data, dict):
        raise DownloadRequestError("Invalid request body")

    raw_url = data.get("url", "")
    url = raw_url.strip() if isinstance(raw_url, str) else ""
    quality = str(data.get("quality", "1080"))
    raw_format = data.get("format", "mp4")
    raw_codec = data.get("codec", "h264")
    fmt = raw_format.lower() if isinstance(raw_format, str) else ""
    codec = raw_codec.lower() if isinstance(raw_codec, str) else ""
    audio_q = str(data.get("audioQ", "256"))

    if fmt not in ALLOWED_DOWNLOAD_FORMATS:
        raise DownloadRequestError("Unsupported format")
    if codec not in ALLOWED_VIDEO_CODECS:
        raise DownloadRequestError("Unsupported codec")
    if not quality.isdigit() or not (1 <= len(quality) <= 4):
        raise DownloadRequestError("Invalid quality value")
    if not audio_q.isdigit():
        audio_q = "256"
    if not url:
        raise DownloadRequestError("URL required")
    if not is_safe_url(url):
        raise DownloadRequestError("Invalid or disallowed URL.")
    if is_youtube_live_url(url):
        raise DownloadRequestError("Live streams are not currently supported.")
    if is_unsupported_domain(url):
        raise DownloadRequestError("This platform is not supported.")

    sub_langs = data.get("sub_langs") or ["en"]
    if isinstance(sub_langs, str):
        sub_langs = [sub_langs]
    if not isinstance(sub_langs, list):
        sub_langs = ["en"]
    sub_langs = [
        lang for lang in sub_langs
        if isinstance(lang, str)
        and 1 <= len(lang) <= 10
        and all(char.isalnum() or char == "-" for char in lang)
    ][:5]

    sb_categories = data.get("sponsorblock_categories") or ["sponsor"]
    if not isinstance(sb_categories, list):
        sb_categories = ["sponsor"]
    sb_categories = [
        category for category in sb_categories
        if category in ALLOWED_SPONSORBLOCK_CATEGORIES
    ][:9] or ["sponsor"]
    sb_mode = data.get("sponsorblock_mode", "remove")
    if sb_mode not in ("remove", "mark"):
        sb_mode = "remove"

    is_audio = fmt in AUDIO_FMTS
    mute = bool(data.get("mute", False))
    youtube_video_only_mute = mute and not is_audio and is_youtube(url)
    mute_needs_strip = mute and not is_audio and not youtube_video_only_mute
    if mute_needs_strip and not FFMPEG_DIR:
        raise DownloadRequestError("FFmpeg is required for mute downloads.")

    return {
        "url": url,
        "quality": quality,
        "format": fmt,
        "codec": codec,
        "audio_q": audio_q,
        "sid": data.get("sid", ""),
        "requested_download_id": data.get("download_id"),
        "requested_download_name": data.get("download_name"),
        "add_meta": bool(data.get("metadata", True)),
        "mute": mute,
        "want_subs": bool(data.get("subtitles", False)),
        "sub_langs": sub_langs,
        "want_sponsorblock": bool(data.get("sponsorblock", False)),
        "sb_categories": sb_categories,
        "sb_mode": sb_mode,
        "is_audio": is_audio,
        "youtube_video_only_mute": youtube_video_only_mute,
        "mute_needs_strip": mute_needs_strip,
    }


# ── Routes ────────────────────────────────────────────
PREPARED_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{40,64}$")


@app.route("/files/<token>")
def download_prepared_file(token):
    if not PREPARED_TOKEN_RE.fullmatch(token):
        return jsonify({"error": "Not Found"}), 404

    owner_ip = get_client_ip()
    preliminary_expired_path = None
    with _prepared_files_lock:
        preliminary = _prepared_files.get(token)
        if preliminary is None:
            return jsonify({"error": "Download expired or already used"}), 410
        if time.time() >= preliminary["expires_at"]:
            preliminary_expired_path = preliminary["path"]
            del _prepared_files[token]
        elif not hmac.compare_digest(preliminary["owner_ip"], owner_ip):
            return jsonify({"error": "Not Found"}), 404
    if preliminary_expired_path is not None:
        _force_cleanup(preliminary_expired_path)
        return jsonify({"error": "Download expired"}), 410

    transfer_acquired = False
    if request.method != "HEAD":
        if not acquire_transfer_slot(owner_ip):
            return service_busy(
                "Too many active file transfers. Please try again shortly.",
                retry_after=5,
            )
        transfer_acquired = True

    expired_path = None
    try:
        with _prepared_files_lock:
            entry = _prepared_files.get(token)
            if entry is None:
                return jsonify({"error": "Download expired or already used"}), 410
            path = entry["path"]
            download_name = entry["download_name"]
            expected_ip = entry["owner_ip"]
            expires_at = entry["expires_at"]
            if time.time() >= expires_at:
                expired_path = path
                del _prepared_files[token]
            elif not hmac.compare_digest(expected_ip, owner_ip):
                return jsonify({"error": "Not Found"}), 404
            elif request.method != "HEAD":
                # Token tek kullanımlıktır; eşzamanlı ikinci GET aynı dosyayı açamaz.
                del _prepared_files[token]

        if expired_path is not None:
            _force_cleanup(expired_path)
            return jsonify({"error": "Download expired"}), 410
        if not os.path.isfile(path):
            _force_cleanup(path)
            return jsonify({"error": "Download no longer available"}), 410

        try:
            response = send_file(path, as_attachment=True, download_name=download_name)
        except Exception:
            _force_cleanup(path)
            raise

        if request.method != "HEAD":
            @response.call_on_close
            def _cleanup_prepared_file():
                try:
                    _force_cleanup(path)
                finally:
                    release_transfer_slot(owner_ip)

            transfer_acquired = False

        return response
    finally:
        if transfer_acquired:
            release_transfer_slot(owner_ip)


@app.route("/health")
def health():
    # YENİ: queue_lock ile korundu, race condition önlendi
    with queue_lock:
        _active = active_downloads_count
        _waiting = queue_waiting
    # NOT: os.listdir(DOWNLOAD_DIR) yerine zaten bakımı yapılan
    # _pending_cleanups sayacı kullanılıyor -- /health sık pollanabilen bir
    # endpoint olduğu için her çağrıda dizin taramak gereksiz I/O ekliyordu
    # (bkz. OPTIMIZATIONS.md Finding 7).
    with _pending_cleanups_lock:
        _disk_files = len(_pending_cleanups)
    with transfer_lock:
        _active_transfers = active_transfers_count
    with info_cache_lock:
        _info_cache_entries = len(info_response_cache)
        _info_inflight = len(info_inflight)
        _info_cache_hits = info_cache_hits
        _info_cache_misses = info_cache_misses
    _spool = spool_snapshot()
    try:
        _free_disk = shutil.disk_usage(DOWNLOAD_DIR).free
    except OSError:
        _free_disk = 0
    return jsonify({
        "status": "ok",
        "maintenance": MAINTENANCE_MODE,
        "maintenance_message": MAINTENANCE_MESSAGE if MAINTENANCE_MODE else "",
        "maintenance_until": MAINTENANCE_UNTIL if MAINTENANCE_MODE else "",
        "deployment_mode": "single_worker_process_local_state",
        "horizontal_scaling_safe": False,
        "expected_gunicorn_workers": 1,
        "ffmpeg": f"OK ({FFMPEG_DIR})" if FFMPEG_DIR else "MISSING",
        "js_solver": "OK" if (_DENO_PATH and _EJS_AVAILABLE) else "INCOMPLETE",
        "po_token_provider": "CONFIGURED" if POT_PROVIDER_URL else "DISABLED",
        "cookies": f"Loaded ({os.path.getsize(COOKIES_FILE)} bytes)" if os.path.exists(COOKIES_FILE) else "Missing",
        "disk_files": _disk_files,
        "active_downloads": _active,
        "max_concurrent_downloads": MAX_CONCURRENT_DOWNLOADS,
        "max_download_queue": MAX_DOWNLOAD_QUEUE,
        "queue_waiting": _waiting,
        "active_transfers": _active_transfers,
        "max_concurrent_transfers": MAX_CONCURRENT_TRANSFERS,
        "spool_reserved_bytes": _spool["reserved_bytes"],
        "spool_prepared_bytes": _spool["prepared_bytes"],
        "max_spool_bytes": MAX_SPOOL_SIZE_BYTES,
        "free_disk_bytes": _free_disk,
        "info_cache_entries": _info_cache_entries,
        "info_inflight": _info_inflight,
        "info_cache_hits": _info_cache_hits,
        "info_cache_misses": _info_cache_misses,
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
    if not check_rate_limit(ip):
        return jsonify({"error": "Too many requests. Please wait 1 minute."}), 429
    data = request.json or {}
    download_id = data.get("download_id", "")
    if download_id:
        if not isinstance(download_id, str) or not DOWNLOAD_ID_RE.fullmatch(download_id.strip()):
            return jsonify({"error": "Invalid download_id"}), 400
        download_id = download_id.strip()
        with cancel_events_lock:
            entry = cancel_events.get(download_id)
            if entry and entry[1] == ip:
                entry[0].set()
                # Kayıt, indirme greenlet'i gerçekten sonlanana kadar tutulur.
                # Burada silmek aynı ID'nin erken yeniden ayrılmasına ve eski
                # isteğin yeni kaydı temizlemesine izin verirdi.
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


@app.errorhandler(413)
def request_too_large(e):
    max_mb = MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
    return jsonify({
        "error": f"Uploaded file exceeds the {max_mb} MB limit.",
        "error_code": "file_too_large",
    }), 413


@app.after_request
def prevent_api_indexing(response):
    """API uçlarının arama sonucu olarak dizine alınmasını engelle."""
    response.headers.setdefault("X-Robots-Tag", "noindex, nofollow")
    return response

# ── /info ─────────────────────────────────────────────
def _info_cache_key(url):
    """Keep cache entries separate when extraction access policy changes."""
    uses_cookie_file = os.path.isfile(COOKIES_FILE) and not is_instagram(url)
    return (url, uses_cookie_file, bool(POT_PROVIDER_URL))


def _acquire_info_work(cache_key):
    """Return cached payload or elect exactly one extractor for this key."""
    global info_cache_hits, info_cache_misses
    now = time.monotonic()
    with info_cache_lock:
        cached = info_response_cache.get(cache_key)
        if cached is not None and now < cached[0]:
            info_response_cache.move_to_end(cache_key)
            info_cache_hits += 1
            return cached[1], None, False
        if cached is not None:
            info_response_cache.pop(cache_key, None)

        info_cache_misses += 1
        event = info_inflight.get(cache_key)
        if event is not None:
            return None, event, False
        event = threading.Event()
        info_inflight[cache_key] = event
        return None, event, True


def _get_cached_info(cache_key):
    now = time.monotonic()
    with info_cache_lock:
        cached = info_response_cache.get(cache_key)
        if cached is None:
            return None
        if now >= cached[0]:
            info_response_cache.pop(cache_key, None)
            return None
        info_response_cache.move_to_end(cache_key)
        return cached[1]


def _store_cached_info(cache_key, payload):
    with info_cache_lock:
        info_response_cache[cache_key] = (
            time.monotonic() + INFO_CACHE_TTL_SECONDS,
            payload,
        )
        info_response_cache.move_to_end(cache_key)
        while len(info_response_cache) > INFO_CACHE_MAX_SIZE:
            info_response_cache.popitem(last=False)


def _finish_info_work(cache_key, event):
    with info_cache_lock:
        if info_inflight.get(cache_key) is event:
            info_inflight.pop(cache_key, None)
    event.set()


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

    cache_key = _info_cache_key(url)
    cached_payload, inflight_event, is_leader = _acquire_info_work(cache_key)
    if cached_payload is not None:
        return jsonify(cached_payload), 200

    if not is_leader:
        if not inflight_event.wait(INFO_TIMEOUT_SECONDS + 1):
            return service_busy("Metadata request is still running. Please try again shortly.", retry_after=2)
        cached_payload = _get_cached_info(cache_key)
        if cached_payload is not None:
            return jsonify(cached_payload), 200
        return service_busy("Metadata lookup failed. Please try again shortly.", retry_after=2)

    slot_acquired = False
    try:
        if not info_slots.acquire(blocking=False):
            return service_busy("Metadata service is busy. Please try again shortly.", retry_after=5)
        slot_acquired = True
        payload, status = get_info_with_slot(url)
        if status == 200:
            _store_cached_info(cache_key, payload)
        return jsonify(payload), status
    finally:
        if slot_acquired:
            info_slots.release()
        _finish_info_work(cache_key, inflight_event)


def get_info_with_slot(url):
    extra_opts = {
        "extract_flat": "in_playlist",
        "playlistend": PLAYLIST_LIMIT,
    }
    if is_youtube(url):
        # /info only needs metadata (title, duration, thumbnail). yt-dlp may
        # otherwise reject the whole lookup while choosing a default format,
        # even though the metadata was extracted successfully. Actual format
        # availability and the PO-token-backed media request are still
        # validated by /download.
        extra_opts["ignore_no_formats_error"] = True
    opts_list = get_opts_list(url, extra=extra_opts)
    last_err = None
    primary_err = None
    deadline = time.monotonic() + INFO_TIMEOUT_SECONDS
    for attempt_index, opts in enumerate(opts_list):
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Metadata extraction timed out")
            with gevent.Timeout(remaining, TimeoutError("Metadata extraction timed out")):
                with _pot_provider_network_scope(url):
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
                    return {
                        "is_playlist": True,
                        "playlist_title": info.get("title") or "Playlist",
                        "playlist_count": len(items),
                        "total_entries": total_count,
                        "limited_to": PLAYLIST_LIMIT,
                        "items": items,
                        "platform": info.get("extractor_key", "").lower(),
                    }, 200
                subs = info.get("subtitles") or {}
                auto_subs = info.get("automatic_captions") or {}
                sub_langs = sorted(set(subs.keys()) | set(auto_subs.keys()))
                return {
                    "is_playlist": False,
                    "title": info.get("title") or "Video",
                    "duration": info.get("duration") or 0,
                    "thumbnail": info.get("thumbnail"),
                    "uploader": info.get("uploader") or info.get("channel") or "",
                    "platform": info.get("extractor_key", "").lower(),
                    "subtitles": sub_langs,
                    "has_manual_subtitles": bool(subs),
                }, 200
        except TimeoutError as e:
            last_err = e
            primary_err = e
            break
        except Exception as e:
            last_err = e
            primary_err = remember_primary_error(primary_err, e)
            es = str(e).lower()
            if "cookie" in es and attempt_index + 1 < len(opts_list):
                continue
            if "429" in es or "too many requests" in es:
                # A second cookie-less attempt hits the same Railway egress IP
                # immediately and only extends YouTube's upstream cooldown.
                break
            if "login" in es or "private" in es:
                break
            continue

    public_err = primary_err or last_err
    error_msg = str(public_err) if public_err else "Unknown error"
    logger.error(f"[INFO ERR] {url[:60]}: {error_msg[:150]}")
    if isinstance(last_err, TimeoutError):
        return {
            "error": "Metadata request timed out. Please try again.",
            "error_code": "request_timeout",
        }, 504
    payload = public_error_payload(error_msg, url)
    if payload["error_code"] == "instagram_ratelimit":
        payload["error"] = "instagram_ratelimit"  # Legacy frontend compatibility.
    return payload, 400


def make_download_progress_hook(sid, cancel_event, size_exceeded, spool_exceeded,
                                dl_start_time):
    """Create the throttled yt-dlp progress hook used by one download job."""
    last_progress = {"time": 0.0, "percent": None, "status": None}
    last_disk_check = {"time": 0.0}

    def emit_progress(payload, force=False):
        if not sid:
            return
        now = time.monotonic()
        percent = payload.get("percent")
        status = payload.get("status")
        same_value = percent == last_progress["percent"] and status == last_progress["status"]
        too_soon = now - last_progress["time"] < PROGRESS_EMIT_INTERVAL
        if not force and (same_value or too_soon):
            return
        last_progress.update(time=now, percent=percent, status=status)
        safe_emit("progress", payload, room=sid)

    def progress_hook(data):
        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadCancelled("Cancelled")
        if data["status"] == "downloading":
            now = time.monotonic()
            if now - last_disk_check["time"] >= 1:
                last_disk_check["time"] = now
                if not has_minimum_free_disk():
                    spool_exceeded["flag"] = True
                    cancel_event.set()
                    raise yt_dlp.utils.DownloadCancelled("Spool disk watermark reached")
            total = data.get("total_bytes") or data.get("total_bytes_estimate", 0)
            downloaded = data.get("downloaded_bytes", 0)
            if (total and total > MAX_DOWNLOAD_SIZE_BYTES) or downloaded > MAX_DOWNLOAD_SIZE_BYTES:
                size_exceeded["flag"] = True
                cancel_event.set()
                if sid:
                    safe_emit("progress", {
                        "status": "error",
                        "message": f"File size limit exceeded (maximum {MAX_DOWNLOAD_SIZE_BYTES // (1024 * 1024)} MB).",
                    }, room=sid)
                raise yt_dlp.utils.DownloadCancelled("Size limit exceeded")
            if total > 0:
                percent = max(5, int(downloaded / total * 82))
            elif data.get("fragment_index") is not None and data.get("fragment_count"):
                percent = max(5, int(data["fragment_index"] / data["fragment_count"] * 82))
            else:
                percent = min(80, 5 + int(time.time() - dl_start_time) * 2)
            speed = data.get("_speed_str", "").strip()
            if "unknown" in speed.lower():
                speed = ""
            emit_progress({
                "percent": percent,
                "speed": speed,
                "eta": data.get("_eta_str", "").strip(),
                "status": "downloading",
            })
        elif data["status"] == "finished" and sid:
            emit_progress({"percent": 88, "status": "merging"}, force=True)

    return progress_hook


def build_download_options(url, *, quality, fmt, codec, audio_q, mute, is_audio,
                           add_meta, want_sponsorblock, sb_categories, sb_mode,
                           want_subs, sub_langs, filepath, progress_hook):
    """Build yt-dlp options without mixing plan construction into the route."""
    fmt_str = build_format_str(url, quality, fmt, codec, mute=mute)
    if is_audio:
        codec_map = {
            "mp3": "mp3", "flac": "flac", "wav": "wav",
            "ogg": "vorbis", "opus": "opus", "m4a": "m4a",
        }
        preferred = codec_map.get(fmt, "mp3")
        preferred_q = audio_q if fmt in ("mp3", "ogg", "m4a") else "0"
        postprocessors = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": preferred,
            "preferredquality": preferred_q,
        }]
        extra = {
            "format": fmt_str,
            "outtmpl": filepath + ".%(ext)s",
            "progress_hooks": [progress_hook],
            "postprocessors": postprocessors,
        }
    else:
        merge_fmt = fmt if fmt in ("webm", "mkv", "avi", "mov") else "mp4"
        postprocessors = []
        extra = {
            "format": fmt_str,
            "outtmpl": filepath + ".%(ext)s",
            "progress_hooks": [progress_hook],
            "merge_output_format": merge_fmt,
        }

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
    if not is_audio and want_subs and FFMPEG_DIR:
        extra["writesubtitles"] = True
        extra["writeautomaticsub"] = True
        extra["subtitleslangs"] = sub_langs
        extra["subtitlesformat"] = "srt/best"
        postprocessors.append({"key": "FFmpegEmbedSubtitle"})
    if postprocessors:
        extra["postprocessors"] = postprocessors

    # Metadata and download stay in one extraction. noplaylist selects the
    # single video from video+playlist URLs; match_filter rejects containers.
    extra["noplaylist"] = True
    extra["match_filter"] = enforce_download_limits
    return get_opts_list(
        url,
        extra=extra,
        youtube_video_fallback=is_youtube(url) and not is_audio,
    )


class DownloadAttemptResult:
    """Outcome of run_download_attempts(): which opts_list entry (if any)
    produced a finished file, plus enough error context for the route to
    build the right HTTP response. Deliberately a plain attribute bag, not
    a class hierarchy -- the route still owns all the response-building
    decisions, this just reports what happened.
    """
    __slots__ = ("success", "full_path", "video_title", "timed_out", "last_err", "primary_err")

    def __init__(self, success=False, full_path=None, video_title=None,
                 timed_out=False, last_err=None, primary_err=None):
        self.success = success
        self.full_path = full_path
        self.video_title = video_title
        self.timed_out = timed_out
        self.last_err = last_err
        self.primary_err = primary_err


def run_download_attempts(url, opts_list, *, download_id, filename, video_title,
                           request_deadline, cancel_event):
    """Runs the yt-dlp extract_info(download=True) retry loop for /download.

    Tries each entry in opts_list in order (the client-fallback ladder built
    by get_opts_list), stopping at the first one that produces a finished
    media file. This is a line-for-line extraction of the previous inline
    loop (OPTIMIZATIONS.md Finding 11): same end-to-end deadline handling,
    same child-process reaping via _reap_new_children, same cookie/429/
    login/format fallback rules between attempts.

    yt_dlp.utils.DownloadCancelled and the process-fatal exceptions
    (MemoryError/SystemError/KeyboardInterrupt/SystemExit) are re-raised
    exactly as before so the route's existing except blocks keep handling
    them unchanged. Every other outcome -- success, timeout, or exhausted
    retries -- is reported back via the returned DownloadAttemptResult so
    the route stays the single place that turns outcomes into HTTP
    responses.
    """
    result = DownloadAttemptResult(video_title=video_title)
    primary_err = None
    last_err = None

    for attempt_index, opts in enumerate(opts_list):
        if cancel_event.is_set():
            break
        if is_youtube(url):
            youtube_args = opts.get("extractor_args", {}).get("youtube", {})
            player_clients = ",".join(youtube_args.get("player_client") or ()) or "auto"
            logger.info(
                f"[DL] YouTube attempt {attempt_index + 1}/{len(opts_list)} "
                f"client={player_clients}"
            )
        before_pids = _snapshot_child_pids()
        try:
            # NOT: gevent.Timeout subprocess'leri (ffmpeg merge) durduramaz,
            # sadece Python kodunu kapsar. Bu yüzden timeout/exception
            # sonrası _reap_new_children ile process ağacı taranıp
            # timeout süresince doğan ffmpeg/aria2c process'leri öldürülür.
            # Ayrıca uzun süren işlemler için gunicorn --timeout (660s)
            # devreye girer ve worker'ı restart eder. Bu yüzden
            # DOWNLOAD_TIMEOUT_SECONDS < gunicorn timeout.
            remaining = request_deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"{DOWNLOAD_TIMEOUT_SECONDS}s end-to-end deadline exceeded")
            with gevent.Timeout(remaining, TimeoutError(f"{DOWNLOAD_TIMEOUT_SECONDS}s end-to-end deadline exceeded")):
                with _pot_provider_network_scope(url):
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        download_info = ydl.extract_info(url, download=True)
                        if not isinstance(download_info, dict):
                            raise ValueError(
                                "Playlist downloads are not supported. Select a single video."
                            )
                        if download_info.get("_type") in ("playlist", "multi_video") or "entries" in download_info:
                            raise ValueError(
                                "Playlist downloads are not supported. Select a single video."
                            )
                        limit_error = enforce_download_limits(download_info, incomplete=False)
                        if limit_error:
                            raise ValueError(limit_error)
                        full_path = resolve_downloaded_media_path(download_info, filename)
                        if not full_path:
                            raise FileNotFoundError("Downloaded media file path not found")
                        result.full_path = full_path
                        result.video_title = download_info.get("title") or result.video_title
                        result.success = True
                        break
        except yt_dlp.utils.DownloadCancelled:
            _reap_new_children(before_pids, download_id, filename)
            raise
        except TimeoutError as e:
            result.timed_out = True
            last_err = e
            primary_err = e
            logger.error(f"[DL TIMEOUT] {DOWNLOAD_TIMEOUT_SECONDS}s exceeded")
            _reap_new_children(before_pids, download_id, filename)
            break
        except (MemoryError, SystemError, KeyboardInterrupt, SystemExit):
            _reap_new_children(before_pids, download_id, filename)
            raise
        except Exception as e:
            last_err = e
            primary_err = remember_primary_error(primary_err, e)
            es = str(e).lower()
            logger.error(f"[DL FAIL] {es[:100]}")
            _reap_new_children(before_pids, download_id, filename)
            if "cookie" in es and attempt_index + 1 < len(opts_list):
                continue
            if "429" in es or "too many requests" in es:
                # Do not double-hit the same rate-limited YouTube endpoint
                # with the immediate cookie-less fallback.
                break
            if ("login" in es or "private" in es or "video too long" in es
                    or "playlist downloads are not supported" in es
                    or "downloaded media file path not found" in es):
                break
            if attempt_index + 1 < len(opts_list):
                next_youtube_args = (
                    opts_list[attempt_index + 1]
                    .get("extractor_args", {})
                    .get("youtube", {})
                )
                next_clients = next_youtube_args.get("player_client") or ()
                next_is_video_fallback = list(next_clients) == ["default"]
                format_missing = any(token in es for token in (
                    "requested format", "no video formats", "only images",
                    "format is not available", "format unavailable",
                ))
                if next_is_video_fallback and not format_missing:
                    break
            continue

    result.last_err = last_err
    result.primary_err = primary_err
    return result


def apply_mute_postprocessing(full_path):
    """Strips the audio track from an already-downloaded file via a second
    FFmpeg stream-copy pass (OPTIMIZATIONS.md Finding 11's media
    post-processing extraction).

    This is only a fallback path now: build_format_str's
    youtube_video_only_mute selection (Finding 2) avoids this entirely on
    YouTube by requesting a video-only format up front. Non-YouTube
    extractors that only expose muxed formats still land here.

    Mutates the file on disk in place -- the stripped copy is renamed over
    full_path -- and raises on any FFmpeg failure so the caller's existing
    error handling and artifact cleanup take over unchanged.
    """
    logger.info("[DL] mute step starting")
    base, ext = os.path.splitext(full_path)
    muted_path = base + ".muted" + ext
    _register_cleanup(muted_path)
    try:
        ffmpeg_cmd = FFMPEG_PATH or os.path.join(FFMPEG_DIR, "ffmpeg")
        result = subprocess.run(
            [ffmpeg_cmd, "-y", "-protocol_whitelist", FFMPEG_LOCAL_PROTOCOLS,
             "-i", full_path,
             "-c", "copy", "-an", muted_path],
            capture_output=True, text=True, timeout=FFMPEG_TIMEOUT
        )
        if result.returncode == 0 and os.path.exists(muted_path):
            os.remove(full_path)
            _unregister_cleanup(full_path)
            os.rename(muted_path, full_path)
            _unregister_cleanup(muted_path)
            _register_cleanup(full_path)
        else:
            logger.error(f"[MUTE FFMPEG FAIL] {result.stderr[:200]}")
            raise RuntimeError("Mute processing failed")
    except Exception as e:
        logger.error(f"[MUTE FFMPEG ERR] {e}")
        raise
    finally:
        try:
            if os.path.exists(muted_path):
                os.remove(muted_path)
                _unregister_cleanup(muted_path)
        except Exception:
            pass


def finalize_prepared_download(full_path, *, fmt, video_title, requested_download_name,
                                ip, spool_reservation_id, sid, download_id, release_slot,
                                state):
    """Idempotent job finalizer for a completed /download attempt
    (OPTIMIZATIONS.md Finding 11): validates the final size, emits the
    'done' progress event, hands the artifact off for native file transfer,
    and returns the Flask response.

    Repeated calls with the same state return the first result without issuing
    another token or releasing the slot again. `release_slot` is called at most
    once -- at the same point the processing slot was freed before this
    extraction, right after
    the size check and before native-transfer prep -- so the caller's own
    slot_acquired bookkeeping (and the route's `finally` fallback release)
    stays correct. Returns (response_tuple, reservation_consumed); the
    caller should clear its own spool_reservation_id bookkeeping when
    reservation_consumed is True, since ownership of that reservation has
    passed to the prepared-file lifecycle.
    """
    with state["lock"]:
        if state.get("completed"):
            return state["result"]

        try:
            final_size = os.path.getsize(full_path)
        except OSError:
            final_size = 0

        if final_size <= 0:
            try:
                os.remove(full_path)
                _unregister_cleanup(full_path)
            except Exception:
                pass
            discard_cancel_event(download_id)
            if sid:
                safe_emit('progress', {'status': 'error', 'error_code': 'request_failed'}, room=sid)
            state["result"] = ((
                jsonify({
                    "error": "The prepared download is empty or could not be read.",
                    "error_code": "request_failed",
                }),
                500,
            ), False)
            state["completed"] = True
            return state["result"]

        if final_size > MAX_DOWNLOAD_SIZE_BYTES:
            try:
                os.remove(full_path)
                _unregister_cleanup(full_path)
            except Exception:
                pass
            discard_cancel_event(download_id)
            if sid:
                safe_emit('progress', {'status': 'error', 'error_code': 'file_too_large'}, room=sid)
            max_mb = MAX_DOWNLOAD_SIZE_BYTES // (1024 * 1024)
            state["result"] = ((
                jsonify({"error": f"File size limit exceeded (maximum {max_mb} MB).", "error_code": "file_too_large"}),
                400,
            ), False)
            state["completed"] = True
            return state["result"]

        if not state.get("slot_released"):
            release_slot()
            state["slot_released"] = True

        ext = os.path.splitext(full_path)[1].lstrip('.') or fmt
        fallback_title = sanitize_filename(video_title) if video_title else "zenithw"
        download_name = safe_download_name(requested_download_name, fallback_title, ext)
        if "token" not in state:
            state["token"] = prepare_native_download(
                full_path, download_name, ip, spool_reservation_id
            )
        token = state["token"]
        # "done" means that the client can actually start the handoff.  Emitting
        # it before native-download preparation made the UI show 100% while the
        # response/token preparation could still fail or remain pending.
        if sid and not state.get("done_emitted"):
            safe_emit('progress', {'percent': 100, 'status': 'done'}, room=sid)
            state["done_emitted"] = True
        if not state.get("cancel_discarded"):
            discard_cancel_event(download_id)
            state["cancel_discarded"] = True
        logger.info(f"[DL] ready for native transfer: {download_name} ({final_size} bytes)")
        state["result"] = ((
            jsonify({
                "ok": True,
                "download_id": download_id,
                "download_url": f"/files/{token}",
                "filename": download_name,
                "size": final_size,
                "expires_in": PREPARED_FILE_TTL,
            }),
            200,
        ), True)
        state["completed"] = True
        return state["result"]


# ── /download ─────────────────────────────────────────
@app.route("/download", methods=["POST"])
def download():
    ip = get_client_ip()
    if not check_rate_limit(ip):
        return jsonify({"error": "Too many requests. Please wait 1 minute."}), 429
    # NOT: cleanup_old_files() burada senkron çağrılmıyor artık -- zaten
    # periodic_cleanup() arka plan thread'i FILE_CLEANUP_INTERVAL'de bir
    # aynı işi yapıyor. Her /download isteğinde tüm DOWNLOAD_DIR'i
    # listeleyip stat'lamak gereksiz I/O + gecikme ekliyordu (bkz.
    # OPTIMIZATIONS.md Finding 3).
    try:
        dl_request = parse_download_request(request.json or {})
    except DownloadRequestError as exc:
        return jsonify({"error": str(exc)}), 400

    url = dl_request["url"]
    quality = dl_request["quality"]
    fmt = dl_request["format"]
    codec = dl_request["codec"]
    audio_q = dl_request["audio_q"]
    sid = validate_sid(dl_request["sid"])
    requested_download_id = dl_request["requested_download_id"]
    requested_download_name = dl_request["requested_download_name"]
    add_meta = dl_request["add_meta"]
    mute = dl_request["mute"]
    want_subs = dl_request["want_subs"]
    sub_langs = dl_request["sub_langs"]
    want_sponsorblock = dl_request["want_sponsorblock"]
    sb_categories = dl_request["sb_categories"]
    sb_mode = dl_request["sb_mode"]
    is_audio = dl_request["is_audio"]
    youtube_video_only_mute = dl_request["youtube_video_only_mute"]
    mute_needs_strip = dl_request["mute_needs_strip"]
    cancel_event = threading.Event()
    size_exceeded = {"flag": False}
    spool_exceeded = {"flag": False}
    try:
        download_id = reserve_download_id(requested_download_id, cancel_event, ip)
    except ValueError:
        return jsonify({"error": "Invalid download_id"}), 400
    if download_id is None:
        # Frontend 409'u kullanıcı iptali olarak özel ele alıyor; çakışmayı 400
        # döndürerek gerçek hata mesajının gösterilmesini sağla.
        return jsonify({"error": "download_id is already active"}), 400

    video_title = None
    filename = str(uuid.uuid4())
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    full_path = None
    dl_start_time = time.time()
    request_deadline = time.monotonic() + DOWNLOAD_TIMEOUT_SECONDS
    spool_reservation_id = None
    finalization_state = {"lock": threading.Lock()}
    progress_hook = make_download_progress_hook(
        sid,
        cancel_event,
        size_exceeded,
        spool_exceeded,
        dl_start_time,
    )

    slot_acquired = False
    try:
        acquire_download_slot(sid, cancel_event)
        slot_acquired = True

        reservation_bytes = DOWNLOAD_SPOOL_RESERVATION_BYTES
        if mute_needs_strip:
            reservation_bytes = min(
                MAX_SPOOL_SIZE_BYTES,
                reservation_bytes + MAX_DOWNLOAD_SIZE_BYTES,
            )
        spool_reservation_id = reserve_spool(reservation_bytes, "download")
        if not spool_reservation_id:
            raise SpoolBudgetExceeded("Download spool capacity is full")

        logger.info(
            f"[DL] q={quality} fmt={fmt} codec={codec} audio={is_audio} "
            f"mute_plan={'video-only' if youtube_video_only_mute else 'strip' if mute_needs_strip else 'none'}"
        )

        if is_audio and not FFMPEG_DIR:
            discard_cancel_event(download_id)
            return jsonify({"error": "FFmpeg is required for audio conversion."}), 400
        opts_list = build_download_options(
            url,
            quality=quality,
            fmt=fmt,
            codec=codec,
            audio_q=audio_q,
            mute=mute,
            is_audio=is_audio,
            add_meta=add_meta,
            want_sponsorblock=want_sponsorblock,
            sb_categories=sb_categories,
            sb_mode=sb_mode,
            want_subs=want_subs,
            sub_langs=sub_langs,
            filepath=filepath,
            progress_hook=progress_hook,
        )
        logger.info(f"[DL] starting download (timeout={DOWNLOAD_TIMEOUT_SECONDS}s)")
        attempt_result = run_download_attempts(
            url, opts_list,
            download_id=download_id,
            filename=filename,
            video_title=video_title,
            request_deadline=request_deadline,
            cancel_event=cancel_event,
        )
        success = attempt_result.success
        full_path = attempt_result.full_path
        video_title = attempt_result.video_title
        timed_out = attempt_result.timed_out
        last_err = attempt_result.last_err
        primary_err = attempt_result.primary_err

        if cancel_event.is_set():
            raise yt_dlp.utils.DownloadCancelled("Cancelled")

        if timed_out:
            discard_cancel_event(download_id)
            cleanup_download_artifacts(filename)
            if sid:
                safe_emit('progress', {'status': 'error', 'error_code': 'request_timeout'}, room=sid)
            return jsonify({"error": "The download took too long. Please try again.", "error_code": "request_timeout"}), 504

        if not success:
            raise primary_err or last_err or Exception("All attempts failed")

        logger.info("[DL] download completed, processing file...")

        if not full_path:
            discard_cancel_event(download_id)
            return jsonify({"error": "File not found"}), 500

        # YENİ: Kesin temizlik için register et
        _register_cleanup(full_path)

        if mute_needs_strip:
            apply_mute_postprocessing(full_path)

        def _release_download_slot_once():
            nonlocal slot_acquired
            if slot_acquired:
                _release_download_slot()
                slot_acquired = False

        response, reservation_consumed = finalize_prepared_download(
            full_path,
            fmt=fmt,
            video_title=video_title,
            requested_download_name=requested_download_name,
            ip=ip,
            spool_reservation_id=spool_reservation_id,
            sid=sid,
            download_id=download_id,
            release_slot=_release_download_slot_once,
            state=finalization_state,
        )
        if reservation_consumed:
            spool_reservation_id = None
        return response

    except DownloadQueueFull:
        discard_cancel_event(download_id)
        if sid:
            safe_emit('progress', {'status': 'error', 'error_code': 'server_busy'}, room=sid)
        return service_busy("Download queue is full. Please try again shortly.", retry_after=10)
    except DownloadQueueTimeout:
        discard_cancel_event(download_id)
        if sid:
            safe_emit('progress', {'status': 'error', 'error_code': 'server_busy'}, room=sid)
        return service_busy("Download queue wait timed out. Please try again.", retry_after=10)
    except SpoolBudgetExceeded:
        discard_cancel_event(download_id)
        if full_path:
            _force_cleanup(full_path)
        if sid:
            safe_emit('progress', {'status': 'error', 'error_code': 'server_busy'}, room=sid)
        return service_busy(
            "Temporary file capacity is full. Please try again after active transfers finish.",
            retry_after=10,
        )
    except yt_dlp.utils.DownloadCancelled:
        cleanup_download_artifacts(filename)
        discard_cancel_event(download_id)
        if spool_exceeded["flag"]:
            if sid:
                safe_emit('progress', {'status': 'error', 'error_code': 'server_busy'}, room=sid)
            return service_busy(
                "Temporary disk capacity is low. Please try again later.",
                retry_after=15,
            )
        if size_exceeded["flag"]:
            max_mb = MAX_DOWNLOAD_SIZE_BYTES // (1024 * 1024)
            if sid:
                safe_emit('progress', {'status': 'error', 'error_code': 'file_too_large'}, room=sid)
            return jsonify({"error": f"File size limit exceeded (maximum {max_mb} MB).", "error_code": "file_too_large"}), 400
        if sid:
            safe_emit('progress', {'percent': 0, 'status': 'cancelled'}, room=sid)
        return jsonify({"error": "cancelled"}), 409
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[DL ERR] {error_msg[:200]}")
        discard_cancel_event(download_id)
        cleanup_download_artifacts(filename)
        payload = public_error_payload(error_msg, url)
        if sid:
            safe_emit('progress', {'status': 'error', 'error_code': payload['error_code']}, room=sid)
        if payload["error_code"] == "instagram_ratelimit":
            payload["error"] = "instagram_ratelimit"  # Legacy frontend compatibility.
        return jsonify(payload), 400
    finally:
        if spool_reservation_id:
            release_spool(spool_reservation_id)
            spool_reservation_id = None
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
    if not thumbnail_slots.acquire(blocking=False):
        return service_busy("Thumbnail service is busy. Please try again shortly.", retry_after=5)
    try:
        if not is_safe_url(url):
            return jsonify({"error": "Invalid or disallowed URL."}), 400
        if is_youtube_live_url(url):
            return jsonify({"error": "Live streams are not currently supported."}), 400
        if is_unsupported_domain(url):
            return jsonify({"error": "This platform is not supported."}), 400
        if not FFMPEG_DIR:
            return jsonify({"error": "FFmpeg required"}), 400
        return download_thumbnail_with_slot(url)
    finally:
        thumbnail_slots.release()


def download_thumbnail_with_slot(url):
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
    opts_list = get_opts_list(
        url,
        extra=extra,
        # /download ile aynı bot-detection kurtarma zinciri: mweb bot
        # korumasına takılırsa "default" player client ile son bir kez dene.
        youtube_video_fallback=is_youtube(url),
    )
    last_err = None
    primary_err = None
    deadline = time.monotonic() + THUMBNAIL_TIMEOUT_SECONDS
    for opts in opts_list:
        before_pids = _snapshot_child_pids()
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Thumbnail request timed out")
            with gevent.Timeout(remaining, TimeoutError("Thumbnail request timed out")):
                with _pot_provider_network_scope(url):
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        info = ydl.extract_info(url, download=True)
                full_path = resolve_downloaded_thumbnail_path(info, filename)
                if not full_path:
                    continue
                _register_cleanup(full_path)
                response = send_file(full_path, as_attachment=True, download_name="thumbnail.jpg")

                @response.call_on_close
                def _cleanup_thumb():
                    _force_cleanup(full_path)

                return response
        except TimeoutError as e:
            last_err = e
            primary_err = e
            _reap_new_children(before_pids, "thumbnail", filename)
            break
        except Exception as e:
            last_err = e
            primary_err = remember_primary_error(primary_err, e)
            _reap_new_children(before_pids, "thumbnail", filename)
            continue

    public_err = primary_err or last_err
    error_msg = str(public_err) if public_err else "Thumbnail could not be retrieved"
    logger.error(f"[THUMB ERR] {error_msg[:150]}")
    if isinstance(last_err, TimeoutError):
        return jsonify({"error": "Thumbnail request timed out. Please try again.", "error_code": "request_timeout"}), 504
    return jsonify(public_error_payload(error_msg, url)), 400

# ── /convert ───────────────────────────────────────────
ALLOWED_CONVERT_FORMATS = {
    "mp3", "flac", "wav", "ogg", "opus", "m4a",
    "mp4", "webm", "mkv", "avi", "mov",
}

ALLOWED_INPUT_EXTS = {
    ".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac",
    ".mp4", ".webm", ".mkv", ".avi", ".mov", ".m4v", ".flv", ".wmv", ".3gp",
}
ALLOWED_CONVERT_MODES = {"auto", "remux", "transcode"}


def safe_input_suffix(original_filename):
    ext = os.path.splitext(original_filename or "")[1].lower()
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
    if not conversion_rate_limiter.add(ip):
        response = jsonify({
            "error": "Conversion quota exceeded. Please try again later."
        })
        response.status_code = 429
        response.headers["Retry-After"] = str(CONVERSION_RATE_LIMIT_WINDOW)
        return response
    # Slot, request.files multipart gövdesini parse edip diske almadan önce
    # ayrılır; dolu sunucu maksimum boyuta kadar gereksiz upload kabul etmez.
    if not conversion_slots.acquire(blocking=False):
        return service_busy("Server is busy with another conversion. Please try again shortly.", retry_after=10)
    spool_reservation = {"id": None}
    try:
        spool_reservation["id"] = reserve_spool(
            CONVERT_SPOOL_RESERVATION_BYTES,
            "conversion",
        )
        if not spool_reservation["id"]:
            return service_busy(
                "Temporary file capacity is full. Please try again after active transfers finish.",
                retry_after=10,
            )
        return convert_file_with_slot(ip, spool_reservation)
    finally:
        if spool_reservation["id"]:
            release_spool(spool_reservation["id"])
        conversion_slots.release()


def convert_file_with_slot(ip, spool_reservation):
    if 'file' not in request.files:
        return jsonify({"error": "File required"}), 400
    file = request.files['file']
    target_format = request.form.get('target_format', 'mp3').lower()
    conversion_mode = request.form.get('mode', 'auto').lower()
    requested_download_name = request.form.get('download_name')
    if not file or file.filename == '':
        return jsonify({"error": "Invalid file"}), 400
    if target_format not in ALLOWED_CONVERT_FORMATS:
        return jsonify({"error": "Unsupported target format"}), 400
    if conversion_mode not in ALLOWED_CONVERT_MODES:
        return jsonify({"error": "Unsupported conversion mode"}), 400
    if not FFMPEG_DIR:
        return jsonify({"error": "FFmpeg required"}), 400

    input_path = None
    output_path = None
    try:
        suffix = safe_input_suffix(file.filename)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=DOWNLOAD_DIR) as input_temp:
            input_path = input_temp.name
            file.save(input_path)
            _register_cleanup(input_path)

        try:
            input_size = os.path.getsize(input_path)
        except OSError:
            input_size = 0
        if input_size <= 0:
            _force_cleanup(input_path)
            return jsonify({
                "error": "The uploaded file is empty or could not be read.",
                "error_code": "invalid_file",
            }), 400

        base_no_ext = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(
            os.path.dirname(input_path),
            base_no_ext + '.output.' + target_format,
        )
        _register_cleanup(output_path)

        ffmpeg_cmd = FFMPEG_PATH or os.path.join(FFMPEG_DIR, "ffmpeg")
        base_cmd = [
            ffmpeg_cmd,
            '-hide_banner', '-loglevel', 'fatal', '-nostdin',
            '-protocol_whitelist', FFMPEG_LOCAL_PROTOCOLS,
            '-probesize', '10M', '-analyzeduration', '10M',
            '-i', input_path, '-y', '-threads', '2',
        ]

        audio_formats = {'mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a'}
        limit_args = [
            '-t', str(MAX_VIDEO_DURATION_SECONDS),
            '-fs', str(MAX_CONVERT_OUTPUT_SIZE_BYTES),
        ]
        copy_args = (
            ['-map', '0:a:0', '-vn', '-c:a', 'copy']
            if target_format in audio_formats
            else ['-map', '0', '-map_metadata', '0', '-c', 'copy']
        )

        completed_mode = None
        result = None
        if conversion_mode in {'auto', 'remux'}:
            copy_cmd = base_cmd + copy_args + limit_args + [output_path]
            result = subprocess.run(
                copy_cmd,
                capture_output=True,
                text=True,
                timeout=FFMPEG_TIMEOUT,
            )
            if result.returncode == 0 and os.path.isfile(output_path):
                completed_mode = 'remux'
            elif conversion_mode == 'remux':
                logger.info(f"[REMUX INCOMPATIBLE] {result.stderr[:300]}")
                _force_cleanup(output_path)
                return jsonify({
                    "error": "The streams are not compatible with this container.",
                    "error_code": "remux_incompatible",
                }), 400
            else:
                logger.info(f"[CONV] stream copy incompatible; transcoding: {result.stderr[:200]}")
                _force_cleanup(output_path)
                _register_cleanup(output_path)

        if completed_mode is None:
            transcode_args = []
            if target_format in audio_formats:
                transcode_args.extend(['-vn'])

            if target_format == 'mp3':
                transcode_args.extend(['-codec:a', 'libmp3lame', '-q:a', '2'])
            elif target_format == 'flac':
                transcode_args.extend(['-codec:a', 'flac'])
            elif target_format == 'wav':
                transcode_args.extend(['-codec:a', 'pcm_s16le'])
            elif target_format == 'ogg':
                transcode_args.extend(['-codec:a', 'libvorbis', '-q:a', '5'])
            elif target_format == 'opus':
                transcode_args.extend(['-codec:a', 'libopus', '-b:a', '128k'])
            elif target_format == 'm4a':
                transcode_args.extend(['-codec:a', 'aac', '-b:a', '192k'])
            elif target_format == 'mp4':
                transcode_args.extend(['-c:v', 'libx264', '-c:a', 'aac'])
            elif target_format == 'webm':
                transcode_args.extend(['-c:v', 'libvpx-vp9', '-c:a', 'libopus'])
            elif target_format == 'mkv':
                transcode_args.extend(['-c:v', 'libx264', '-c:a', 'aac'])
            elif target_format == 'avi':
                transcode_args.extend(['-c:v', 'libx264', '-c:a', 'mp3'])
            elif target_format == 'mov':
                transcode_args.extend(['-c:v', 'libx264', '-c:a', 'aac'])

            # -fs is an early-stop guard; the exact output size is checked below.
            transcode_cmd = base_cmd + transcode_args + limit_args + [output_path]
            result = subprocess.run(
                transcode_cmd,
                capture_output=True,
                text=True,
                timeout=FFMPEG_TIMEOUT,
            )
            if result.returncode != 0:
                logger.error(f"[CONV FFMPEG ERR] {result.stderr[:300]}")
                _force_cleanup(output_path)
                return jsonify({
                    "error": "Conversion failed. Please check the file format.",
                    "error_code": "conversion_failed",
                }), 400
            completed_mode = 'transcode'

        try:
            output_size = os.path.getsize(output_path)
        except OSError:
            output_size = 0
        if output_size <= 0:
            _force_cleanup(output_path)
            return jsonify({
                "error": "Conversion did not produce a valid output file.",
                "error_code": "conversion_failed",
            }), 400
        if output_size >= MAX_CONVERT_OUTPUT_SIZE_BYTES:
            _force_cleanup(output_path)
            max_mb = MAX_CONVERT_OUTPUT_SIZE_BYTES // (1024 * 1024)
            return jsonify({
                "error": f"Converted file exceeds the {max_mb} MB limit.",
                "error_code": "file_too_large",
            }), 413

        try:
            if input_path and os.path.exists(input_path):
                os.unlink(input_path)
                _unregister_cleanup(input_path)
        except Exception:
            pass

        download_name = safe_download_name(requested_download_name, "converted", target_format)
        token = prepare_native_download(
            output_path,
            download_name,
            ip,
            spool_reservation["id"],
        )
        spool_reservation["id"] = None
        return jsonify({
            "ok": True,
            "download_url": f"/files/{token}",
            "filename": download_name,
            "size": output_size,
            "expires_in": PREPARED_FILE_TTL,
            "processing_mode": completed_mode,
        }), 200

    except SpoolBudgetExceeded:
        logger.warning("[CONV] prepared-file spool budget exceeded")
        if output_path:
            _force_cleanup(output_path)
        return service_busy(
            "Temporary file capacity is full. Please try again after active transfers finish.",
            retry_after=10,
        )
    except subprocess.TimeoutExpired:
        logger.error("[CONV ERR] ffmpeg timeout")
        try:
            if output_path and os.path.exists(output_path):
                os.unlink(output_path)
                _unregister_cleanup(output_path)
        except Exception:
            pass
        return jsonify({
            "error": "Conversion timed out.",
            "error_code": "request_timeout",
        }), 504
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[CONV ERR] {error_msg[:200]}")
        try:
            if output_path and os.path.exists(output_path):
                os.unlink(output_path)
                _unregister_cleanup(output_path)
        except Exception:
            pass
        return jsonify({
            "error": "An error occurred during conversion.",
            "error_code": "conversion_failed",
        }), 400
    finally:
        try:
            if input_path and os.path.exists(input_path):
                os.unlink(input_path)
                _unregister_cleanup(input_path)
        except Exception:
            pass

# ── Socket.IO Events ──────────────────────────────────
@socketio.on('connect')
def on_connect():
    with connected_sids_lock:
        connected_sids[request.sid] = time.time()
    logger.info(f"+ {request.sid}")


@socketio.on('disconnect')
def on_disconnect():
    with connected_sids_lock:
        connected_sids.pop(request.sid, None)
    logger.info(f"- {request.sid}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", debug=False, port=port)
