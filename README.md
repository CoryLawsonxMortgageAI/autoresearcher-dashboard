# AutoResearcher Dashboard

A modern, Palantir-inspired web UI for monitoring and controlling autonomous AI research agents on Windows.

![Dashboard Preview](https://img.shields.io/badge/Status-Active-success)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![GPU](https://img.shields.io/badge/GPU-NVIDIA-green)

## Features

- **Real-time GPU Monitoring**: Track utilization, memory usage, temperature, and power consumption
- **Experiment Control**: Start, stop, and monitor training experiments
- **Live Metrics**: WebSocket-based real-time updates
- **Results Visualization**: Interactive charts showing training progress
- **Agent Status**: Monitor autonomous research agents
- **Log Streaming**: Real-time training logs with filtering
- **Palantir-inspired UI**: Dark theme with cyan accents, data-dense layouts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoResearcher Dashboard                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript + Tailwind)                   │
│  ├── Real-time WebSocket updates                            │
│  ├── Interactive charts (Recharts)                          │
│  ├── Palantir-style dark theme                              │
│  └── Responsive layout                                      │
├─────────────────────────────────────────────────────────────┤
│  Backend (FastAPI + Python)                                 │
│  ├── GPU monitoring (NVML)                                  │
│  ├── Experiment management                                  │
│  ├── WebSocket broadcasting                                 │
│  └── Results tracking                                       │
├─────────────────────────────────────────────────────────────┤
│  Core Training (autoresearch-win-rtx)                       │
│  ├── GPT model training                                     │
│  ├── Muon optimizer                                         │
│  └── Autonomous experimentation                             │
└─────────────────────────────────────────────────────────────┘
```

## Requirements

- Windows 10/11
- NVIDIA GPU (RTX 2060+ with 8GB+ VRAM)
- Python 3.10+
- Node.js 18+
- Git

## Quick Start

### 1. Setup Backend

```powershell
# Navigate to backend directory
cd autoresearcher-dashboard\backend

# Create virtual environment (optional but recommended)
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Setup Frontend

```powershell
# Navigate to frontend directory
cd autoresearcher-dashboard\frontend

# Install dependencies (requires Node.js 18+)
npm install

# Build for production
npm run build
```

### 3. Launch

```powershell
# Run the launch script
.\launch.ps1
```

Or manually:

```powershell
# Terminal 1: Start backend
cd autoresearcher-dashboard\backend
python main.py

# Terminal 2: Start frontend (development)
cd autoresearcher-dashboard\frontend
npm run dev

# Or serve the built frontend (production)
# Backend automatically serves frontend from ../backend/app/frontend_dist
```

## Usage

1. Open your browser to `http://localhost:5173` (dev) or `http://localhost:8000` (prod)
2. The dashboard will automatically connect via WebSocket
3. Monitor GPU metrics in real-time
4. Start experiments from the dashboard
5. View results and training progress

## Configuration

### Backend Environment Variables

```bash
# Optional: Override autoresearch project path
AUTORESEARCH_PATH=C:\path\to\autoresearch-win-rtx

# Optional: API port (default: 8000)
PORT=8000
```

### Frontend Configuration

The frontend connects to the backend automatically. To change the API URL:

```typescript
// src/hooks/useAPI.ts
const API_BASE = 'http://your-backend:8000/api';

// src/hooks/useWebSocket.ts  
const WS_URL = 'ws://your-backend:8000/ws';
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/gpu/metrics` | Current GPU metrics |
| GET | `/api/system/metrics` | System metrics |
| GET | `/api/experiments` | List all experiments |
| GET | `/api/experiments/current` | Current experiment |
| POST | `/api/experiments/start` | Start new experiment |
| POST | `/api/experiments/stop` | Stop current experiment |
| GET | `/api/results` | Get results from TSV |
| GET | `/api/agents` | Get agent status |
| GET | `/api/logs` | Get recent logs |
| WS | `/ws` | WebSocket for real-time updates |

## Project Structure

```
autoresearcher-dashboard/
├── backend/
│   ├── app/
│   │   └── frontend_dist/     # Built frontend files
│   ├── main.py                # FastAPI application
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/            # Custom hooks
│   │   ├── store/            # Zustand store
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # Utilities
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
└── launch.ps1                 # Launch script
```

## Development

### Frontend Development

```powershell
cd frontend
npm run dev
```

Hot reload is enabled. Changes will be reflected immediately.

### Backend Development

```powershell
cd backend
python main.py
```

With auto-reload:

```powershell
uvicorn main:app --reload --port 8000
```

## Troubleshooting

### GPU Not Detected

- Ensure NVIDIA drivers are installed: `nvidia-smi`
- Install pynvml: `pip install pynvml`
- Run as administrator if needed

### WebSocket Connection Failed

- Check if backend is running on port 8000
- Verify firewall settings allow the connection
- Check browser console for errors

### Frontend Build Errors

- Ensure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

## License

MIT License - See autoresearch-win-rtx for original project license.

## Credits

- Original autoresearch by @karpathy
- Windows fork by @jsegov
- Dashboard UI inspired by Palantir
