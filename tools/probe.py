"""Dry-run the real builder on a runner and print what the new blocks contain."""
import subprocess, sys, json, pathlib, os
r = subprocess.run([sys.executable, "-u", "update.py", "--dry-run"],
                   capture_output=True, text=True, env={**os.environ})
print(r.stdout[-4000:])
if r.returncode:
    print("STDERR:\n", r.stderr[-3000:]); sys.exit(r.returncode)
print("STDERR (warnings):\n", r.stderr[-2000:])
