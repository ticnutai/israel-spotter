"""
start_app.py – Unified launcher for Kfar Chabad GIS system
============================================================

Launches both:
  • Python FastAPI backend  (port 3001)
  • React/Vite frontend     (port 3002)

Usage:
  python start_app.py              # start both
  python start_app.py --backend    # backend only
  python start_app.py --frontend   # frontend only
"""

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR  # Frontend (vite/src) is at project root
VENV_PYTHON = BASE_DIR / ".venv" / "Scripts" / "python.exe"
VENV_UVICORN = BASE_DIR / ".venv" / "Scripts" / "uvicorn.exe"


def find_python():
    if VENV_PYTHON.exists():
        return str(VENV_PYTHON)
    return sys.executable


def find_uvicorn():
    if VENV_UVICORN.exists():
        return str(VENV_UVICORN)
    return "uvicorn"


def start_backend():
    print("[*] Starting FastAPI backend on http://127.0.0.1:3001 ...")
    env = os.environ.copy()
    return subprocess.Popen(
        [find_uvicorn(), "api:app", "--host", "127.0.0.1", "--port", "3001", "--reload"],
        cwd=str(BACKEND_DIR),
        env=env,
    )


def start_frontend():
    print("[*] Starting Vite frontend on http://localhost:3002 ...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    return subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
    )


def main():
    parser = argparse.ArgumentParser(description="Kfar Chabad GIS System Launcher")
    parser.add_argument("--backend", action="store_true", help="Start backend only")
    parser.add_argument("--frontend", action="store_true", help="Start frontend only")
    args = parser.parse_args()

    both = not args.backend and not args.frontend
    procs = []

    try:
        if args.backend or both:
            procs.append(("backend", start_backend()))
        if args.frontend or both:
            procs.append(("frontend", start_frontend()))

        if both:
            time.sleep(2)
            print()
            print("=" * 50)
            print("  Kfar Chabad GIS System Running")
            print("  Frontend:  http://localhost:3002")
            print("  Backend:   http://127.0.0.1:3001")
            print("  API docs:  http://127.0.0.1:3001/docs")
            print("=" * 50)
            print("  Press Ctrl+C to stop")
            print()

        # Wait for processes
        for name, proc in procs:
            proc.wait()

    except KeyboardInterrupt:
        print("\n[*] Shutting down...")
        for name, proc in procs:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        print("[*] Done.")


if __name__ == "__main__":
    main()
