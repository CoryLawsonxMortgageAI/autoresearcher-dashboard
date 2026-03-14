"""
RunPod Cloud GPU Integration Service
Deploy and manage GPU instances for training on demand
"""

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
import httpx
from datetime import datetime, timedelta

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_API_URL = "https://api.runpod.io/graphql"


@dataclass
class PodConfig:
    """Configuration for a RunPod GPU pod"""
    name: str = "autoresearcher-gpu"
    gpu_type: str = "NVIDIA RTX A4000"  # Cheapest option with good performance
    gpu_count: int = 1
    image_name: str = "runpod/pytorch:2.2.0-py3.10-cuda12.1-devel-ubuntu22.04"
    container_disk_size_gb: int = 20
    volume_mount_path: str = "/workspace"
    cloud_type: str = "COMMUNITY"  # COMMUNITY or SECURE (SECURE is more expensive)
    ports: str = "8000/http,22/tcp"
    
    # Cost-optimized settings
    min_memory_gb: int = 16
    min_vcpu_count: int = 4


class RunPodService:
    """Service for managing RunPod GPU instances"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or RUNPOD_API_KEY
        self.headers = {
            "Content-Type": "application/json",
        }
    
    async def _query(self, query: str, variables: dict = None) -> dict:
        """Execute a GraphQL query against RunPod API"""
        url = f"{RUNPOD_API_KEY}?api_key={self.api_key}"
        
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self.headers,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
    
    async def list_gpu_types(self) -> List[Dict[str, Any]]:
        """List available GPU types and their pricing"""
        query = """
        query GpuTypes {
            gpuTypes {
                id
                displayName
                memoryInGb
                securePrice
                communityPrice
                secureSpotPrice
                communitySpotPrice
            }
        }
        """
        result = await self._query(query)
        return result.get("data", {}).get("gpuTypes", [])
    
    async def list_pods(self) -> List[Dict[str, Any]]:
        """List all pods"""
        query = """
        query Pods {
            myself {
                pods {
                    id
                    name
                    imageName
                    env
                    gpuCount
                    uptimeInSeconds
                    cloudType
                    costPerHr
                    podType
                    machineId
                    machine {
                        podHostId
                    }
                }
            }
        }
        """
        result = await self._query(query)
        return result.get("data", {}).get("myself", {}).get("pods", [])
    
    async def create_pod(self, config: PodConfig) -> Dict[str, Any]:
        """Create a new GPU pod for training"""
        query = """
        mutation PodFindAndDeployOnDemand($input: PodFindAndDeployOnDemandInput!) {
            podFindAndDeployOnDemand(input: $input) {
                id
                name
                imageName
                env
                machineId
                machine {
                    podHostId
                }
            }
        }
        """
        
        variables = {
            "input": {
                "cloudType": config.cloud_type,
                "gpuCount": config.gpu_count,
                "volumeInGb": config.container_disk_size_gb,
                "containerDiskInGb": config.container_disk_size_gb,
                "minVcpuCount": config.min_vcpu_count,
                "minMemoryInGb": config.min_memory_gb,
                "gpuTypeId": config.gpu_type,
                "name": config.name,
                "imageName": config.image_name,
                "dockerArgs": "",
                "ports": config.ports,
                "volumeMountPath": config.volume_mount_path,
                "env": [
                    {"key": "PYTHONUNBUFFERED", "value": "1"},
                    {"key": "AUTORESEARCH_MODE", "value": "cloud"},
                ],
                "startScript": self._get_start_script(),
            }
        }
        
        result = await self._query(query, variables)
        return result.get("data", {}).get("podFindAndDeployOnDemand", {})
    
    def _get_start_script(self) -> str:
        """Generate the startup script for the pod"""
        return """#!/bin/bash
set -e

echo "=== AutoResearcher GPU Worker Starting ==="

# Install dependencies
pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -q transformers datasets accelerate wandb tiktoken rustbpe pyarrow

# Clone autoresearch repo
if [ ! -d "/workspace/autoresearch-win-rtx" ]; then
    cd /workspace
    git clone https://github.com/jsegov/autoresearch-win-rtx.git
fi

cd /workspace/autoresearch-win-rtx

# Setup
pip install -q uv
uv sync || pip install -r requirements.txt

# Download data
python prepare.py &

# Start API server for remote control
pip install -q fastapi uvicorn websockets

# Create simple training API
cat > /workspace/server.py << 'EOF'
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import os
import json
from datetime import datetime

app = FastAPI()

training_process = None

class TrainConfig(BaseModel):
    depth: int = 8
    device_batch_size: int = 16
    embedding_lr: float = 0.6
    matrix_lr: float = 0.04
    scalar_lr: float = 0.5
    weight_decay: float = 0.2

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now()}

@app.post("/train/start")
def start_training(config: TrainConfig):
    global training_process
    if training_process and training_process.poll() is None:
        raise HTTPException(status_code=400, detail="Training already running")
    
    # Modify train.py with config
    training_process = subprocess.Popen(
        ["python", "train.py"],
        stdout=open("/workspace/training.log", "w"),
        stderr=subprocess.STDOUT,
        cwd="/workspace/autoresearch-win-rtx"
    )
    return {"status": "started", "pid": training_process.pid}

@app.post("/train/stop")
def stop_training():
    global training_process
    if training_process:
        training_process.terminate()
        return {"status": "stopped"}
    return {"status": "not_running"}

@app.get("/train/status")
def training_status():
    global training_process
    is_running = training_process and training_process.poll() is None
    
    # Parse latest results
    results = {}
    if os.path.exists("/workspace/autoresearch-win-rtx/results.tsv"):
        with open("/workspace/autoresearch-win-rtx/results.tsv", "r") as f:
            lines = f.readlines()
            if len(lines) > 1:
                last = lines[-1].strip().split("\\t")
                results = {
                    "commit": last[0],
                    "val_bpb": float(last[1]) if last[1] != "0.000000" else None,
                    "memory_gb": float(last[2]),
                    "status": last[3],
                    "description": last[4] if len(last) > 4 else ""
                }
    
    logs = ""
    if os.path.exists("/workspace/training.log"):
        with open("/workspace/training.log", "r") as f:
            logs = f.read()[-5000:]  # Last 5KB
    
    return {
        "running": is_running,
        "results": results,
        "logs": logs
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

python /workspace/server.py &

echo "=== Ready for training ==="
wait
"""
    
    async def stop_pod(self, pod_id: str) -> bool:
        """Stop a running pod"""
        query = """
        mutation PodStop($id: String!) {
            podStop(id: $id) {
                id
                desiredStatus
            }
        }
        """
        variables = {"id": pod_id}
        result = await self._query(query, variables)
        return "errors" not in result
    
    async def resume_pod(self, pod_id: str) -> bool:
        """Resume a stopped pod"""
        query = """
        mutation PodResume($id: String!) {
            podResume(id: $id) {
                id
                desiredStatus
            }
        }
        """
        variables = {"id": pod_id}
        result = await self._query(query, variables)
        return "errors" not in result
    
    async def terminate_pod(self, pod_id: str) -> bool:
        """Permanently delete a pod"""
        query = """
        mutation PodTerminate($id: String!) {
            podTerminate(id: $id)
        }
        """
        variables = {"id": pod_id}
        result = await self._query(query, variables)
        return result.get("data", {}).get("podTerminate", False)
    
    async def get_pod_status(self, pod_id: str) -> Dict[str, Any]:
        """Get detailed status of a pod"""
        query = """
        query Pod($id: String!) {
            pod(id: $id) {
                id
                name
                desiredStatus
                runtime {
                    uptimeInSeconds
                    ports {
                        ip
                        isIpPublic
                        privatePort
                        publicPort
                        type
                    }
                }
                costPerHr
            }
        }
        """
        variables = {"id": pod_id}
        result = await self._query(query, variables)
        return result.get("data", {}).get("pod", {})


# Singleton instance
runpod_service = RunPodService()
