# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CTFd Challenge Map Visualization Tool - an interactive web application that visualizes Capture The Flag (CTF) competition progress by connecting to CTFd instances and displaying challenge dependencies, team progress, and statistics.

## Key Commands

### Development
```bash
# Install dependencies
npm install

# Run development server with auto-reload
npm run dev

# Run production server
npm start

# Run with specific CTFd instance
CTFD_URL=https://your-ctfd.com npm start
```

### Running the Application
1. **With Node.js proxy (recommended)**: Start server with `npm start`, then access http://localhost:3000
2. **Direct browser**: Open index.html with a CORS extension enabled
3. **Python server**: Run `python -m http.server 8000` with CORS extension

## Architecture

### Frontend (index.html + app.js)
- index.html: HTML structure and styling
- app.js: All JavaScript logic and visualization code
- Vanilla JavaScript with no build process or framework dependencies
- Features:
  - Login modal for CTFd API authentication
  - Interactive challenge dependency map visualization
  - Real-time data fetching and updates
  - Multi-team view support for admins

### Backend (proxy-server.js)
- Express server that proxies API requests to avoid CORS issues
- Routes:
  - `/` - Serves static files (HTML, CSS, JS)
  - `/api/*` - Proxies to CTFd instance
- Handles authentication headers passthrough
- Default target: https://demo.ctfd.io (configurable via CTFD_URL env var)

### API Integration
- Connects to CTFd's REST API v1
- Authentication via Bearer tokens (format: `ctf_xxxxxxxxxxxx`)
- Two token types:
  - User tokens: Limited view for single team
  - Admin tokens: Full view of all teams

## Development Notes

- No build process required - modify HTML and JS files directly
- No test suite or linting configured
- French documentation in README.md
- Demo modes available for testing without CTFd instance