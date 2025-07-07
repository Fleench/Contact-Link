import os
import re
import logging
from pathlib import Path
from urllib.parse import urljoin

from flask import Flask, request, Response, send_file, abort
from functools import wraps
from dotenv import load_dotenv
import requests

load_dotenv()

# Configure logging to both console and a file.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("server.log"),
    ],
)
logger = logging.getLogger(__name__)

CARDDAV_URL = os.getenv("CARDDAV_URL")
USERNAME = os.getenv("USERNAME")
PASSWORD = os.getenv("PASSWORD")
LOCAL_USERNAME = os.getenv("LOCAL_USERNAME")
LOCAL_PASSWORD = os.getenv("LOCAL_PASSWORD")
CACHE_DIR = Path(os.getenv("CACHE_DIR", "cache"))
PORT = int(os.getenv("PORT", "8000"))

app = Flask(__name__)


def check_auth(username: str, password: str) -> bool:
    """Validate provided credentials."""
    if not LOCAL_USERNAME and not LOCAL_PASSWORD:
        return True
    return username == LOCAL_USERNAME and password == LOCAL_PASSWORD


def authenticate() -> Response:
    """Sends a 401 response that enables basic auth"""
    resp = Response("Authentication required", 401)
    resp.headers["WWW-Authenticate"] = 'Basic realm="Login Required"'
    return resp


def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not LOCAL_USERNAME and not LOCAL_PASSWORD:
            return f(*args, **kwargs)
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        return f(*args, **kwargs)

    return decorated

session = requests.Session()
if USERNAME and PASSWORD:
    session.auth = (USERNAME, PASSWORD)

CACHE_DIR.mkdir(exist_ok=True)


def sync_remote():
    """Fetch all contacts from the remote CardDAV server."""
    if not CARDDAV_URL:
        logger.info("CARDDAV_URL not configured; skipping remote sync")
        return

    xml = '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><href/></prop></propfind>'
    headers = {"Depth": "1"}
    try:
        logger.info("Syncing contacts from %s", CARDDAV_URL)
        res = session.request("PROPFIND", CARDDAV_URL, headers=headers, data=xml)
        if res.status_code < 200 or res.status_code >= 300:
            logger.warning("PROPFIND failed with status %s", res.status_code)
            return

        hrefs = re.findall(r"<(?:\w+:)?href>([^<]+\.vcf)</(?:\w+:)?href>", res.text)
        count = 0
        for href in hrefs:
            url = urljoin(CARDDAV_URL, href)
            r = session.get(url)
            if r.status_code == 200:
                (CACHE_DIR / Path(href).name).write_text(r.text)
                logger.debug("Fetched %s", href)
                count += 1
        logger.info("Sync complete: %d contacts fetched", count)
    except Exception as e:
        logger.exception("Error during sync: %s", e)


def build_listing() -> str:
    body = ["<?xml version=\"1.0\"?><multistatus xmlns=\"DAV:\">"]
    for file in CACHE_DIR.glob("*.vcf"):
        body.append(f"<response><href>/{file.name}</href></response>")
    body.append("</multistatus>")
    return "\n".join(body)


@app.route("/", methods=["OPTIONS"])
@requires_auth
def options_root():
    resp = Response()
    resp.headers["Allow"] = "OPTIONS,PROPFIND,GET,PUT"
    return resp


@app.route("/", methods=["PROPFIND"])
@requires_auth
def propfind_root():
    xml = build_listing()
    return Response(xml, status=207, mimetype="application/xml")


@app.route("/<uid>.vcf", methods=["GET"])
@requires_auth
def get_contact(uid: str):
    file = CACHE_DIR / f"{uid}.vcf"
    if not file.exists():
        abort(404)
    return send_file(file, mimetype="text/vcard")


@app.route("/<uid>.vcf", methods=["PUT"])
@requires_auth
def put_contact(uid: str):
    file = CACHE_DIR / f"{uid}.vcf"
    data = request.get_data(as_text=True)
    file.write_text(data)
    logger.info("Received update for %s", file.name)
    if CARDDAV_URL:
        url = urljoin(CARDDAV_URL.rstrip("/") + "/", f"{uid}.vcf")
        session.put(url, data=data, headers={"Content-Type": "text/vcard"})
    return "", 204


if __name__ == "__main__":
    sync_remote()
    logger.info("Starting local CardDAV server on port %s", PORT)
    app.run(port=PORT)
