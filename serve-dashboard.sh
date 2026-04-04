#!/usr/bin/env bash
# serve-dashboard.sh — Detect an available HTTP server and serve the dashboard.
#
# Usage:
#   ./serve-dashboard.sh [port] [directory]
#
# Defaults: port=8000, directory=current directory
#
# The dashboard (tasks-dashboard.html) must be served over HTTP because it
# fetches tasks.json via XHR. Opening it as a file:// URL will not work.

set -euo pipefail

PORT="${1:-8000}"
DIR="${2:-.}"

cd "$DIR" || { echo "ERROR: Cannot cd to $DIR"; exit 1; }

if [ ! -f "tasks.json" ]; then
  echo "WARNING: No tasks.json found in $DIR"
  echo "The dashboard will show an error until tasks.json is created."
  echo "Run /atm:create-tasks in Claude Code to generate it."
  echo ""
fi

if [ ! -f "tasks-dashboard.html" ]; then
  echo "WARNING: No tasks-dashboard.html found in $DIR"
  echo "Copy it from the plugin's templates/ directory."
  echo ""
fi

echo "=== Agentic Task Manager Dashboard ==="
echo ""

if command -v python3 &> /dev/null; then
  echo "Server:    Python 3 http.server"
  echo "Port:      $PORT"
  echo "Dashboard: http://localhost:$PORT/tasks-dashboard.html"
  echo ""
  python3 -m http.server "$PORT"
elif command -v python &> /dev/null; then
  echo "Server:    Python 2 SimpleHTTPServer"
  echo "Port:      $PORT"
  echo "Dashboard: http://localhost:$PORT/tasks-dashboard.html"
  echo ""
  python -m SimpleHTTPServer "$PORT"
elif command -v npx &> /dev/null; then
  echo "Server:    npx serve"
  echo "Port:      $PORT"
  echo "Dashboard: http://localhost:$PORT/tasks-dashboard.html"
  echo ""
  npx serve -l "$PORT" .
elif command -v php &> /dev/null; then
  echo "Server:    PHP built-in server"
  echo "Port:      $PORT"
  echo "Dashboard: http://localhost:$PORT/tasks-dashboard.html"
  echo ""
  php -S "localhost:$PORT"
elif command -v ruby &> /dev/null; then
  echo "Server:    Ruby WEBrick"
  echo "Port:      $PORT"
  echo "Dashboard: http://localhost:$PORT/tasks-dashboard.html"
  echo ""
  ruby -run -e httpd . -p "$PORT"
else
  echo "ERROR: No HTTP server found."
  echo ""
  echo "Install one of these:"
  echo "  - python3  (recommended, usually pre-installed)"
  echo "  - node/npx (npm install -g serve)"
  echo "  - php"
  echo "  - ruby"
  exit 1
fi
