"""
RunPod Cloud GPU Integration
Manages on-demand GPU instances for training experiments
"""

import os
import json
import asyncio
import aiohttp
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from datetime import datetime


RUNPOD_API_BASE = "https://api.runpod.io/v2"
RUNPOD_GRAPHQL_URL = "https://api.runpod.io/graphql"


@dataclass
class RunPodGPUConfig:
    """Configuration for RunPod GPU instance"""
    gpu_type: str = "RTX 4090"  # RTX 4090, A100, H100, etc.
    gpu_count: int = 1
    image_name: str = "runpod/pytorch:2.2.0-py3.10-cuda12.1-devel-ubuntu22.04"
    container_disk_in_gb: int = 50
    volume_in_gb: int = 100
    cloud_type: str = "COMMUNITY"  # COMMUNITY or SECURE
    min_vcpu_count: int = 4
    min_memory_in_gb: int = 16
    docker_args: str = ""
    ports: str = "8888/http,22/tcp"
    volume_mount_path: str = "/workspace"
    env_vars: Optional[Dict[str, str]] = None


class RunPodClient:
    """Client for RunPod API interactions"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("RUNPOD_API_KEY")
        if not self.api_key:
            raise ValueError("RunPod API key not provided")
    
    async def _graphql_query(self, query: str, variables: Dict = None) -> Dict:
        """Execute GraphQL query against RunPod API"""
        headers = {
            "Content-Type": "application/json",
        }
        
        # RunPod uses API key as query parameter
        url = f"{RUNPOD_GRAPHQL_URL}?api_key={self.api_key}"
        
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"RunPod API error: {resp.status} - {text}")
                return await resp.json()
    
    async def get_available_gpus(self) -> List[Dict[str, Any]]:
        """Get list of available GPU types and pricing"""
        query = """
        query GpuTypes {
            gpuTypes {
                id
                displayName
                memoryInGb
                secureCloud
                communityCloud
                securePrice
                communityPrice
            }
        }
        """
        
        result = await self._graphql_query(query)
        return result.get("data", {}).get("gpuTypes", [])
    
    async def create_pod(
        self, 
        name: str, 
        config: Optional[RunPodGPUConfig] = None
    ) -> Dict[str, Any]:
        """Create a new GPU pod (instance)"""
        config = config or RunPodGPUConfig()
        
        query = """
        mutation PodFindAndDeployOnDemand($input: PodFindAndDeployOnDemandInput!) {
            podFindAndDeployOnDemand(input: $input) {
                id
                imageName
                env
                machineId
                machine {
                    podHostId
                }
            }
        }
        """
        
        env_str = json.dumps(config.env_vars or {})
        
        variables = {
            "input": {
                "cloudType": config.cloud_type,
                "gpuCount": config.gpu_count,
                "volumeInGb": config.volume_in_gb,
                "containerDiskInGb": config.container_disk_in_gb,
                "minVcpuCount": config.min_vcpu_count,
                "minMemoryInGb": config.min_memory_in_gb,
                "gpuTypeId": config.gpu_type,
                "name": name,
                "imageName": config.image_name,
                "dockerArgs": config.docker_args,
                "ports": config.ports,
                "volumeMountPath": config.volume_mount_path,
                "env": env_str,
            }
        }
        
        result = await self._graphql_query(query, variables)
        return result.get("data", {}).get("podFindAndDeployOnDemand", {})
    
    async def terminate_pod(self, pod_id: str) -> bool:
        """Terminate a running pod"""
        query = """
        mutation PodTerminate($input: PodTerminateInput!) {
            podTerminate(input: $input)
        }
        """
        
        variables = {
            "input": {
                "podId": pod_id
            }
        }
        
        try:
            await self._graphql_query(query, variables)
            return True
        except Exception as e:
            print(f"Error terminating pod {pod_id}: {e}")
            return False
    
    async def get_pod_status(self, pod_id: str) -> Dict[str, Any]:
        """Get status of a pod"""
        query = """
        query Pod($id: String!) {
            pod(id: $id) {
                id
                name
                runtime {
                    uptimeInSeconds
                    gpus {
                        id
                        gpuUtilPercent
                        memoryUtilPercent
                    }
                }
                desiredStatus
                imageName
                env
                machineId
                machine {
                    podHostId
                }
            }
        }
        """
        
        variables = {"id": pod_id}
        result = await self._graphql_query(query, variables)
        return result.get("data", {}).get("pod", {})
    
    async def get_pods(self) -> List[Dict[str, Any]]:
        """Get all pods"""
        query = """
        query Pods {
            myself {
                pods {
                    id
                    name
                    desiredStatus
                    runtime {
                        uptimeInSeconds
                    }
                }
            }
        }
        """
        
        result = await self._graphql_query(query)
        myself = result.get("data", {}).get("myself", {})
        return myself.get("pods", [])
    
    async def run_training_job(
        self,
        experiment_id: str,
        train_script: str,
        webhook_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a pod and start a training job"""
        
        # Prepare environment variables
        env_vars = {
            "EXPERIMENT_ID": experiment_id,
            "AUTORESEARCH_DISABLE_AUTOTUNE": "0",
        }
        
        if webhook_url:
            env_vars["WEBHOOK_URL"] = webhook_url
        
        # Create custom config
        config = RunPodGPUConfig(
            gpu_type=os.getenv("RUNPOD_GPU_TYPE", "RTX 4090"),
            gpu_count=int(os.getenv("RUNPOD_GPU_COUNT", "1")),
            cloud_type=os.getenv("RUNPOD_CLOUD_TYPE", "COMMUNITY"),
            image_name="runpod/pytorch:2.2.0-py3.10-cuda12.1-devel-ubuntu22.04",
            volume_in_gb=100,
            container_disk_in_gb=50,
            env_vars=env_vars,
            docker_args=f"bash -c 'git clone https://github.com/jsegov/autoresearch-win-rtx.git /workspace/autoresearch && cd /workspace/autoresearch && {train_script}'"
        )
        
        # Create the pod
        pod = await self.create_pod(f"autoresearch-{experiment_id}", config)
        
        return {
            "pod_id": pod.get("id"),
            "machine_id": pod.get("machineId"),
            "host_id": pod.get("machine", {}).get("podHostId"),
            "status": "starting",
            "experiment_id": experiment_id,
        }


# Singleton instance
_runpod_client: Optional[RunPodClient] = None


def get_runpod_client() -> Optional[RunPodClient]:
    """Get or create RunPod client singleton"""
    global _runpod_client
    
    if _runpod_client is None:
        api_key = os.getenv("RUNPOD_API_KEY")
        if api_key:
            _runpod_client = RunPodClient(api_key)
    
    return _runpod_client
