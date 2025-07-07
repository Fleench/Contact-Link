import os
import re
from pathlib import Path
from urllib.parse import urljoin

from flask import Flask, request, Response, send_file, abort
from dotenv import load_dotenv
import requests

load_dotenv()

CARDDAV_URL = os.getenv("CARDDAV_URL")
USERNAME = os.getenv("USERNAME")
PASSWORD = os.getenv("PASSWORD")
CACHE_DIR = Path(os.getenv("CACHE_DIR", "cache"))
PORT = int(os.getenv("PORT", "8000"))

app = Flask(__name__)

session = requests.Session()
if USERNAME and PASSWORD:
    session.auth = (USERNAME, PASSWORD)

CACHE_DIR.mkdir(exist_ok=True)


def sync_remote():
    """Fetch all contacts from the remote CardDAV server."""
    if not CARDDAV_URL:
        return
    xml = '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><href/></prop></propfind>'
    headers = {"Depth": "1"}
    try:
        res = session.request("PROPFIND", CARDDAV_URL, headers=headers, data=xml)
        if res.status_code < 200 or res.status_code >= 300:
            return
        hrefs = re.findall(r"<href>([^<]+\.vcf)</href>", res.text)
        for href in hrefs:
            url = urljoin(CARDDAV_URL, href)
            r = session.get(url)
            if r.status_code == 200:
                (CACHE_DIR / Path(href).name).write_text(r.text)
    except Exception:
        pass


def build_listing() -> str:
    body = ["<?xml version=\"1.0\"?><multistatus xmlns=\"DAV:\">"]
    for file in CACHE_DIR.glob("*.vcf"):
        body.append(f"<response><href>/{file.name}</href></response>")
    body.append("</multistatus>")
    return "\n".join(body)


@app.route("/", methods=["OPTIONS"])
def options_root():
    resp = Response()
    resp.headers["Allow"] = "OPTIONS,PROPFIND,GET,PUT"
    return resp


@app.route("/", methods=["PROPFIND"])
def propfind_root():
    xml = build_listing()
    return Response(xml, status=207, mimetype="application/xml")


@app.route("/<uid>.vcf", methods=["GET"])
def get_contact(uid: str):
    file = CACHE_DIR / f"{uid}.vcf"
    if not file.exists():
        abort(404)
    return send_file(file, mimetype="text/vcard")


@app.route("/<uid>.vcf", methods=["PUT"])
def put_contact(uid: str):
    file = CACHE_DIR / f"{uid}.vcf"
    data = request.get_data(as_text=True)
    file.write_text(data)
    if CARDDAV_URL:
        url = urljoin(CARDDAV_URL.rstrip("/") + "/", f"{uid}.vcf")
        session.put(url, data=data, headers={"Content-Type": "text/vcard"})
    return "", 204


if __name__ == "__main__":
    sync_remote()
    app.run(port=PORT)
