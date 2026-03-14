"""
AutoResearcher Dashboard - Main FastAPI Application
Palantir-style autonomous AI research monitoring and control
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import psutil
import pynvml
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Global state for the application
app_state = {
    "experiments": [],
    "current_experiment": None,
    "gpu_metrics": {},
    "system_metrics": {},
    "agents": [],
    "results_tsv": [],
    "logs": [],
    "running": False,
    "websocket_clients": set(),
}


# ============== Pydantic Models ==============

class ExperimentConfig(BaseModel):
    name: str
    description: str = ""
    depth: int = 8
    device_batch_size: int = 16
    embedding_lr: float = 0.6
    matrix_lr: float = 0.04
    scalar_lr: float = 0.5
    weight_decay: float = 0.2
    auto_run: bool = False


class ExperimentStatus(BaseModel):
    id: str
    name: str
    status: str  # pending, running, completed, failed
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    progress: float = 0.0
    current_step: int = 0
    total_steps: int = 0
    val_bpb: Optional[float] = None
    peak_vram_gb: Optional[float] = None
    mfu_percent: Optional[float] = None
    logs: List[str] = []


class GPUMetrics(BaseModel):
    index: int
    name: str
    utilization_percent: float
    memory_used_gb: float
    memory_total_gb: float
    memory_percent: float
    temperature_c: Optional[float] = None
    power_draw_w: Optional[float] = None
    clock_mhz: Optional[int] = None


class SystemMetrics(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    disk_percent: float
    timestamp: datetime


class AgentStatus(BaseModel):
    id: str
    name: str
    status: str  # idle, researching, analyzing, error
    current_experiment: Optional[str] = None
    experiments_completed: int = 0
    best_val_bpb: Optional[float] = None
    last_activity: Optional[datetime] = None


class ResultEntry(BaseModel):
    commit: str
    val_bpb: float
    memory_gb: float
    status: str
    description: str
    timestamp: datetime


# ============== GPU Monitoring ==============

class GPUMonitor:
    def __init__(self):
        self.initialized = False
        try:
            pynvml.nvmlInit()
            self.initialized = True
            self.device_count = pynvml.nvmlDeviceGetCount()
        except Exception as e:
            print(f"NVML initialization failed: {e}")
            self.device_count = 0

    def get_metrics(self) -> List[GPUMetrics]:
        if not self.initialized:
            return []
        
        metrics = []
        for i in range(self.device_count):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                name = pynvml.nvmlDeviceGetName(handle)
                
                # Memory info
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                mem_used_gb = mem_info.used / (1024 ** 3)
                mem_total_gb = mem_info.total / (1024 ** 3)
                
                # Utilization
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                
                # Temperature
                try:
                    temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                except:
                    temp = None
                
                # Power
                try:
                    power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0
                except:
                    power = None
                
                # Clock
                try:
                    clock = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_SM)
                except:
                    clock = None
                
                metrics.append(GPUMetrics(
                    index=i,
                    name=name,
                    utilization_percent=util.gpu,
                    memory_used_gb=mem_used_gb,
                    memory_total_gb=mem_total_gb,
                    memory_percent=(mem_info.used / mem_info.total) * 100,
                    temperature_c=temp,
                    power_draw_w=power,
                    clock_mhz=clock
                ))
            except Exception as e:
                print(f"Error reading GPU {i}: {e}")
        
        return metrics

    def shutdown(self):
        if self.initialized:
            try:
                pynvml.nvmlShutdown()
            except:
                pass


gpu_monitor = GPUMonitor()


# ============== System Monitoring ==============

def get_system_metrics() -> SystemMetrics:
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    return SystemMetrics(
        cpu_percent=cpu_percent,
        memory_percent=memory.percent,
        memory_used_gb=memory.used / (1024 ** 3),
        memory_total_gb=memory.total / (1024 ** 3),
        disk_percent=disk.percent,
        timestamp=datetime.now()
    )


# ============== Experiment Manager ==============

class ExperimentManager:
    def __init__(self):
        self.current_process = None
        self.log_buffer = []
        self.experiments_dir = Path.home() / ".autoresearcher" / "experiments"
        self.experiments_dir.mkdir(parents=True, exist_ok=True)
    
    def get_results_tsv(self, project_path: str = None) -> List[ResultEntry]:
        """Read results from results.tsv if it exists"""
        if project_path is None:
            project_path = Path.home() / "autoresearcher-ui"
        
        results_file = Path(project_path) / "results.tsv"
        entries = []
        
        if results_file.exists():
            try:
                with open(results_file, 'r') as f:
                    lines = f.readlines()
                    if len(lines) > 1:  # Skip header
                        for line in lines[1:]:
                            parts = line.strip().split('\t')
                            if len(parts) >= 5:
                                entries.append(ResultEntry(
                                    commit=parts[0],
                                    val_bpb=float(parts[1]) if parts[1] != '0.000000' else 0.0,
                                    memory_gb=float(parts[2]),
                                    status=parts[3],
                                    description=parts[4],
                                    timestamp=datetime.now()
                                ))
            except Exception as e:
                print(f"Error reading results.tsv: {e}")
        
        return entries
    
    async def start_experiment(self, config: ExperimentConfig) -> ExperimentStatus:
        """Start a new training experiment"""
        exp_id = f"exp_{int(time.time())}"
        
        status = ExperimentStatus(
            id=exp_id,
            name=config.name,
            status="running",
            start_time=datetime.now(),
            progress=0.0
        )
        
        app_state["current_experiment"] = status
        app_state["experiments"].append(status)
        
        # Start training process asynchronously
        asyncio.create_task(self._run_training(exp_id, config))
        
        return status
    
    async def _run_training(self, exp_id: str, config: ExperimentConfig):
        """Run the training process and monitor output"""
        try:
            # Build command
            cmd = [
                sys.executable, "-m", "train",
                "--smoke-test" if config.auto_run else ""
            ]
            cmd = [c for c in cmd if c]  # Remove empty strings
            
            project_path = Path.home() / "autoresearcher-ui"
            
            self.current_process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(project_path)
            )
            
            # Read output line by line
            while True:
                line = await self.current_process.stdout.readline()
                if not line:
                    break
                
                line_str = line.decode('utf-8').strip()
                self.log_buffer.append(line_str)
                
                # Parse metrics from output
                if "val_bpb:" in line_str:
                    try:
                        val_bpb = float(line_str.split(":")[1].strip())
                        if app_state["current_experiment"]:
                            app_state["current_experiment"].val_bpb = val_bpb
                    except:
                        pass
                
                if "peak_vram_mb:" in line_str:
                    try:
                        vram_mb = float(line_str.split(":")[1].strip())
                        if app_state["current_experiment"]:
                            app_state["current_experiment"].peak_vram_gb = vram_mb / 1024
                    except:
                        pass
                
                # Broadcast to all connected clients
                await broadcast_message({
                    "type": "log",
                    "experiment_id": exp_id,
                    "message": line_str
                })
            
            # Wait for process to complete
            await self.current_process.wait()
            
            if app_state["current_experiment"]:
                app_state["current_experiment"].status = "completed"
                app_state["current_experiment"].end_time = datetime.now()
                app_state["current_experiment"].progress = 100.0
            
            await broadcast_message({
                "type": "experiment_complete",
                "experiment_id": exp_id,
                "status": "completed"
            })
            
        except Exception as e:
            if app_state["current_experiment"]:
                app_state["current_experiment"].status = "failed"
                app_state["current_experiment"].end_time = datetime.now()
            
            await broadcast_message({
                "type": "experiment_error",
                "experiment_id": exp_id,
                "error": str(e)
            })
    
    def stop_experiment(self) -> bool:
        """Stop the current experiment"""
        if self.current_process and self.current_process.returncode is None:
            self.current_process.terminate()
            return True
        return False


experiment_manager = ExperimentManager()


# ============== WebSocket Management ==============

async def broadcast_message(message: dict):
    """Broadcast a message to all connected WebSocket clients"""
    disconnected = set()
    for websocket in app_state["websocket_clients"]:
        try:
            await websocket.send_json(message)
        except:
            disconnected.add(websocket)
    
    # Clean up disconnected clients
    app_state["websocket_clients"].difference_update(disconnected)


async def metrics_broadcast_loop():
    """Continuously broadcast metrics to all clients"""
    while True:
        try:
            # Get GPU metrics
            gpu_metrics = gpu_monitor.get_metrics()
            
            # Get system metrics
            system_metrics = get_system_metrics()
            
            # Update state
            app_state["gpu_metrics"] = [m.model_dump() for m in gpu_metrics]
            app_state["system_metrics"] = system_metrics.model_dump()
            
            # Get results from TSV
            results = experiment_manager.get_results_tsv()
            app_state["results_tsv"] = [r.model_dump() for r in results]
            
            # Broadcast to all clients
            await broadcast_message({
                "type": "metrics_update",
                "gpu": [m.model_dump() for m in gpu_metrics],
                "system": system_metrics.model_dump(),
                "results": [r.model_dump() for r in results]
            })
            
            await asyncio.sleep(2)  # Update every 2 seconds
        except Exception as e:
            print(f"Error in metrics broadcast: {e}")
            await asyncio.sleep(5)


# ============== FastAPI Application ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("Starting AutoResearcher Dashboard...")
    
    # Start metrics broadcast loop
    metrics_task = asyncio.create_task(metrics_broadcast_loop())
    
    yield
    
    # Shutdown
    print("Shutting down AutoResearcher Dashboard...")
    metrics_task.cancel()
    gpu_monitor.shutdown()


app = FastAPI(
    title="AutoResearcher Dashboard",
    description="Palantir-style UI for Autonomous AI Research",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== API Routes ==============

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}


@app.get("/api/gpu/metrics")
async def get_gpu_metrics():
    """Get current GPU metrics"""
    metrics = gpu_monitor.get_metrics()
    return {"gpus": [m.model_dump() for m in metrics]}


@app.get("/api/system/metrics")
async def get_system_metrics_api():
    """Get current system metrics"""
    metrics = get_system_metrics()
    return metrics.model_dump()


@app.get("/api/experiments")
async def get_experiments():
    """Get all experiments"""
    return {"experiments": app_state["experiments"]}


@app.get("/api/experiments/current")
async def get_current_experiment():
    """Get the currently running experiment"""
    return {"experiment": app_state["current_experiment"]}


@app.post("/api/experiments/start")
async def start_experiment(config: ExperimentConfig):
    """Start a new experiment"""
    if app_state["current_experiment"] and app_state["current_experiment"].status == "running":
        raise HTTPException(status_code=400, detail="Experiment already running")
    
    status = await experiment_manager.start_experiment(config)
    return {"status": "started", "experiment": status}


@app.post("/api/experiments/stop")
async def stop_experiment():
    """Stop the current experiment"""
    success = experiment_manager.stop_experiment()
    return {"success": success}


@app.get("/api/results")
async def get_results():
    """Get all results from results.tsv"""
    results = experiment_manager.get_results_tsv()
    return {"results": [r.model_dump() for r in results]}


@app.get("/api/agents")
async def get_agents():
    """Get agent status"""
    # For now, return a single agent representing the system
    agents = [
        AgentStatus(
            id="agent_1",
            name="AutoResearch Agent",
            status="researching" if app_state["current_experiment"] and app_state["current_experiment"].status == "running" else "idle",
            current_experiment=app_state["current_experiment"].name if app_state["current_experiment"] else None,
            experiments_completed=len(app_state["experiments"]),
            best_val_bpb=min([r.val_bpb for r in experiment_manager.get_results_tsv() if r.val_bpb > 0], default=None),
            last_activity=datetime.now()
        )
    ]
    return {"agents": [a.model_dump() for a in agents]}


@app.get("/api/logs")
async def get_logs(lines: int = 100):
    """Get recent log lines"""
    return {"logs": experiment_manager.log_buffer[-lines:]}


# ============== WebSocket Routes ==============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    app_state["websocket_clients"].add(websocket)
    
    try:
        # Send initial state
        await websocket.send_json({
            "type": "connection",
            "message": "Connected to AutoResearcher Dashboard"
        })
        
        # Keep connection alive and handle client messages
        while True:
            try:
                data = await websocket.receive_json()
                
                # Handle client commands
                if data.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})
                
            except asyncio.TimeoutError:
                continue
            
    except WebSocketDisconnect:
        app_state["websocket_clients"].discard(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        app_state["websocket_clients"].discard(websocket)


# ============== Static Files ==============

# Serve static files from the built frontend
frontend_build_dir = Path(__file__).parent / "app" / "frontend_dist"

# Mount static assets directory
if (frontend_build_dir / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_build_dir / "assets")), name="assets")

@app.get("/", include_in_schema=False)
async def serve_index():
    """Serve the main index.html for the root path"""
    index_file = frontend_build_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    raise HTTPException(status_code=404, detail="Frontend not built")

@app.get("/{path:path}", include_in_schema=False)
async def serve_spa(path: str):
    """Serve index.html for all non-API routes (SPA support)"""
    # Skip API routes
    if path.startswith("api/") or path.startswith("ws"):
        raise HTTPException(status_code=404, detail="Not found")
    
    index_file = frontend_build_dir / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    raise HTTPException(status_code=404, detail="Frontend not built")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
