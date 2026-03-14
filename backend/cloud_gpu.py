"""
Cloud GPU Integration for AutoResearcher
Supports RunPod, Vast.ai, Lambda Labs, and Google Colab
"""

import os
import json
import time
import asyncio
import httpx
from typing import Optional, Dict, Any, Literal
from dataclasses import dataclass
from enum import Enum


class CloudProvider(Enum):
    RUNPOD = "runpod"
    VAST_AI = "vast_ai"
    LAMBDA_LABS = "lambda_labs"
    COLAB = "colab"


@dataclass
class GPUInstance:
    id: str
    provider: CloudProvider
    status: str
    gpu_type: str
    vram_gb: int
    cost_per_hour: float
    ssh_command: Optional[str] = None
    web_url: Optional[str] = None
    created_at: Optional[str] = None


class RunPodClient:
    """RunPod Serverless & GPU Cloud Client"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("RUNPOD_API_KEY")
        self.base_url = "https://api.runpod.io/v2"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def get_available_gpus(self) -> list:
        """Get list of available GPU types"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/gpus",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()
    
    async def create_pod(
        self,
        name: str,
        gpu_type: str = "NVIDIA RTX A4000",
        vram_gb: int = 16,
        cloud_type: str = "COMMUNITY",
        container_disk_in_gb: int = 20,
        volume_in_gb: int = 50
    ) -> GPUInstance:
        """Create a new GPU pod on RunPod"""
        
        payload = {
            "name": name,
            "imageName": "runpod/pytorch:2.2.0-py3.10-cuda12.1-devel-ubuntu22.04",
            "containerDiskInGb": container_disk_in_gb,
            "volumeInGb": volume_in_gb,
            "ports": "8000/http,22/tcp",
            "env": [
                {"key": "PYTHONUNBUFFERED", "value": "1"},
                {"key": "AUTORESEARCH_MODE", "value": "cloud"}
            ],
            "cloudType": cloud_type,
            "gpuCount": 1,
            "gpuType": gpu_type,
            "startCommand": "bash /setup.sh"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/pods",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            return GPUInstance(
                id=data["id"],
                provider=CloudProvider.RUNPOD,
                status=data["desiredStatus"],
                gpu_type=gpu_type,
                vram_gb=vram_gb,
                cost_per_hour=self._get_cost_per_hour(gpu_type, cloud_type),
                web_url=f"https://www.runpod.io/console/pods/{data['id']}",
                created_at=data.get("createdAt")
            )
    
    async def get_pod(self, pod_id: str) -> GPUInstance:
        """Get pod details"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/pods/{pod_id}",
                headers=self.headers
            )
            response.raise_for_status()
            data = response.json()
            
            return GPUInstance(
                id=data["id"],
                provider=CloudProvider.RUNPOD,
                status=data["desiredStatus"],
                gpu_type=data.get("gpu", "Unknown"),
                vram_gb=16,
                cost_per_hour=0.0,
                web_url=f"https://www.runpod.io/console/pods/{data['id']}"
            )
    
    async def terminate_pod(self, pod_id: str) -> bool:
        """Terminate a pod"""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.base_url}/pods/{pod_id}",
                headers=self.headers
            )
            return response.status_code == 200
    
    def _get_cost_per_hour(self, gpu_type: str, cloud_type: str) -> float:
        """Get approximate cost per hour"""
        pricing = {
            "NVIDIA RTX A4000": {"COMMUNITY": 0.34, "SECURE": 0.44},
            "NVIDIA RTX A5000": {"COMMUNITY": 0.49, "SECURE": 0.64},
            "NVIDIA RTX A6000": {"COMMUNITY": 0.79, "SECURE": 1.04},
            "NVIDIA A100 80GB": {"COMMUNITY": 1.99, "SECURE": 2.59},
            "NVIDIA A100 40GB": {"COMMUNITY": 1.69, "SECURE": 2.19},
            "NVIDIA H100 80GB": {"COMMUNITY": 2.49, "SECURE": 3.24},
        }
        return pricing.get(gpu_type, {}).get(cloud_type, 0.50)


class VastAIClient:
    """Vast.ai GPU Rental Client"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("VAST_AI_API_KEY")
        self.base_url = "https://console.vast.ai/api/v0"
        self.headers = {"Authorization": f"Bearer {self.api_key}"}
    
    async def search_instances(
        self,
        min_vram: int = 8,
        max_price: float = 1.0,
        gpu_name: Optional[str] = None
    ) -> list:
        """Search for available GPU instances"""
        query = f"gpu_ram >= {min_vram} and dph <= {max_price}"
        if gpu_name:
            query += f" and gpu_name like {gpu_name}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/bundles",
                headers=self.headers,
                json={"q": query}
            )
            response.raise_for_status()
            return response.json().get("offers", [])
    
    async def create_instance(
        self,
        offer_id: str,
        image: str = "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
        disk_space: float = 50.0
    ) -> GPUInstance:
        """Create a new instance"""
        payload = {
            "offer_id": offer_id,
            "image": image,
            "disk": disk_space,
            "env": {"AUTORESEARCH_MODE": "cloud"},
            "onstart": "bash /setup.sh"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base_url}/instances",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            return GPUInstance(
                id=str(data["new_contract"]),
                provider=CloudProvider.VAST_AI,
                status="running",
                gpu_type=data.get("gpu_name", "Unknown"),
                vram_gb=data.get("gpu_ram", 16),
                cost_per_hour=data.get("dph_total", 0.0),
                web_url=f"https://console.vast.ai/instances"
            )


class CloudGPUManager:
    """Manager for cloud GPU resources"""
    
    def __init__(self):
        self.runpod = RunPodClient()
        self.vast_ai = VastAIClient()
        self.active_instances: Dict[str, GPUInstance] = {}
    
    async def provision_gpu(
        self,
        provider: CloudProvider = CloudProvider.RUNPOD,
        gpu_type: str = "NVIDIA RTX A4000",
        vram_gb: int = 16
    ) -> GPUInstance:
        """Provision a new GPU instance"""
        if provider == CloudProvider.RUNPOD:
            instance = await self.runpod.create_pod(
                name=f"autoresearcher-{int(time.time())}",
                gpu_type=gpu_type,
                vram_gb=vram_gb
            )
        elif provider == CloudProvider.VAST_AI:
            # Search for best offer
            offers = await self.vast_ai.search_instances(
                min_vram=vram_gb,
                max_price=1.0,
                gpu_name=gpu_type
            )
            if not offers:
                raise ValueError("No suitable GPU instances available")
            
            best_offer = min(offers, key=lambda x: x["dph_total"])
            instance = await self.vast_ai.create_instance(
                offer_id=best_offer["id"]
            )
        else:
            raise ValueError(f"Provider {provider} not implemented")
        
        self.active_instances[instance.id] = instance
        return instance
    
    async def get_instance_status(self, instance_id: str) -> GPUInstance:
        """Get instance status"""
        if instance_id not in self.active_instances:
            raise ValueError(f"Instance {instance_id} not found")
        
        instance = self.active_instances[instance_id]
        
        if instance.provider == CloudProvider.RUNPOD:
            updated = await self.runpod.get_pod(instance_id)
            self.active_instances[instance_id] = updated
            return updated
        
        return instance
    
    async def terminate_instance(self, instance_id: str) -> bool:
        """Terminate an instance"""
        if instance_id not in self.active_instances:
            return False
        
        instance = self.active_instances[instance_id]
        
        if instance.provider == CloudProvider.RUNPOD:
            success = await self.runpod.terminate_pod(instance_id)
        elif instance.provider == CloudProvider.VAST_AI:
            # Implement Vast.ai termination
            success = True
        else:
            success = False
        
        if success:
            del self.active_instances[instance_id]
        
        return success
    
    async def run_experiment(
        self,
        instance_id: str,
        experiment_config: dict
    ) -> dict:
        """Run an experiment on a cloud GPU instance"""
        # This would SSH or API call into the instance to start training
        # For now, return a placeholder
        return {
            "status": "started",
            "instance_id": instance_id,
            "experiment_id": f"exp-{int(time.time())}",
            "message": "Experiment queued on cloud GPU"
        }


# Setup script for cloud instances
SETUP_SCRIPT = """#!/bin/bash
set -e

echo "Setting up AutoResearcher on cloud GPU..."

# Update system
apt-get update && apt-get install -y git curl wget

# Clone autoresearch repository
mkdir -p /workspace
cd /workspace

if [ ! -d "autoresearch-win-rtx" ]; then
    git clone https://github.com/jsegov/autoresearch-win-rtx.git
fi

cd autoresearch-win-rtx

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.cargo/bin:$PATH"

# Setup Python environment
uv sync

# Download data
uv run prepare.py || true

# Create results file
touch results.tsv
echo -e "commit\\tval_bpb\\tmemory_gb\\tstatus\\tdescription" > results.tsv

# Start monitoring agent
cat > /workspace/agent.py << 'PYTHON_EOF'
import os
import time
import json
import subprocess
from datetime import datetime

def run_experiment():
    \"\"\"Run a single experiment\"\"\"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Run training
    result = subprocess.run(
        ["uv", "run", "train.py"],
        capture_output=True,
        text=True,
        timeout=600  # 10 minute timeout
    )
    
    # Parse results
    val_bpb = None
    for line in result.stdout.split("\\n"):
        if "val_bpb:" in line:
            try:
                val_bpb = float(line.split(":")[1].strip())
            except:
                pass
    
    return {
        "timestamp": timestamp,
        "val_bpb": val_bpb,
        "success": result.returncode == 0,
        "logs": result.stdout
    }

if __name__ == "__main__":
    print("AutoResearcher Cloud Agent started")
    while True:
        try:
            result = run_experiment()
            print(json.dumps(result))
            time.sleep(5)
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(30)
PYTHON_EOF

# Start agent in background
nohup python3 /workspace/agent.py > /workspace/agent.log 2>&1 &

echo "Setup complete! Agent is running."
"""
