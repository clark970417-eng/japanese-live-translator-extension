"""Register the companion for one explicitly supplied unpacked extension ID."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--extension-id", required=True)
parser.add_argument("--app", help="Path to the full desktop application's executable")
args = parser.parse_args()
if not re.fullmatch("[a-p]{32}", args.extension_id):
    parser.error("Expected a Chromium extension ID")
root = Path(__file__).resolve().parent.parent
support = Path.home() / "Library/Application Support/JapaneseLiveCaption"
support.mkdir(parents=True, exist_ok=True)
launcher = support / "launch"
for name in ["host.py", "relay.py", "translation_support.py", "LIVE_TRANSLATE_LICENSE"]:
    shutil.copy2(root / "desktop" / name, support / name)
# sys.executable preserves the virtual environment interpreter path.
if args.app:
    executable = Path(args.app).resolve(strict=True)
    (support / 'app.json').write_text(json.dumps({'executable': str(executable)}))
launcher.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable) + " "
                    + shlex.quote(str(support / ("relay.py" if args.app else "host.py"))) + "\n")
launcher.chmod(0o700)
manifest = {"name": "org.jtl.companion", "description": "Local MLX caption inference",
            "path": str(launcher), "type": "stdio",
            "allowed_origins": [f"chrome-extension://{args.extension_id}/"]}
for browser in ["Google/Chrome", "com.operasoftware.OperaGX"]:
    folder = Path.home() / "Library/Application Support" / browser / "NativeMessagingHosts"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "org.jtl.companion.json"
    # Chrome and Opera assign different IDs to the same unpacked extension.
    # Preserve valid origins registered by the other browser instead of making
    # the latest installation silently revoke an already working browser.
    try:
        previous = json.loads(target.read_text())
        origins = previous.get("allowed_origins", [])
        if isinstance(origins, list):
            manifest["allowed_origins"] = sorted(set(
                manifest["allowed_origins"] + [origin for origin in origins
                                               if isinstance(origin, str)
                                               and re.fullmatch(r"chrome-extension://[a-p]{32}/", origin)]
            ))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    target.write_text(json.dumps(manifest, indent=2) + "\n")
    os.chmod(target, 0o600)
    print(target)
