"""
Advanced Multi-Agent Swarm Architecture
Uncensored AI agents with specialized roles
"""

import asyncio
import json
import os
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import httpx
import openai


class AgentRole(Enum):
    RESEARCHER = "researcher"
    CODER = "coder"
    REVIEWER = "reviewer"
    OPTIMIZER = "optimizer"
    TESTER = "tester"


@dataclass
class AgentThought:
    step: int
    thought: str
    action: str
    observation: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class AgentAction:
    tool: str
    input: Dict[str, Any]
    output: Optional[Any] = None
    success: bool = False


class BaseAgent:
    """Base class for all agents"""
    
    def __init__(
        self,
        name: str,
        role: AgentRole,
        model: str = "dolphin-mixtral",
        api_key: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096
    ):
        self.name = name
        self.role = role
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.thoughts: List[AgentThought] = []
        self.actions: List[AgentAction] = []
        self.memory: List[Dict] = []
        
        # Setup API clients
        self.openrouter_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.together_key = os.getenv("TOGETHER_API_KEY")
        self.openai_key = os.getenv("OPENAI_API_KEY")
        
    async def think(self, context: str, task: str) -> str:
        """Generate thoughts using chain-of-thought reasoning"""
        
        system_prompt = self._get_system_prompt()
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Context: {context}\n\nTask: {task}\n\nThink step by step:"}
        ]
        
        # Add memory context
        if self.memory:
            recent_memories = self.memory[-5:]
            memory_str = "\n".join([f"- {m.get('content', '')}" for m in recent_memories])
            messages.insert(1, {"role": "system", "content": f"Relevant memories:\n{memory_str}"})
        
        response = await self._call_llm(messages)
        
        # Record thought
        thought = AgentThought(
            step=len(self.thoughts) + 1,
            thought=response,
            action="thinking"
        )
        self.thoughts.append(thought)
        
        return response
    
    async def act(self, tool: str, params: Dict[str, Any]) -> Any:
        """Execute an action"""
        action = AgentAction(tool=tool, input=params)
        
        try:
            if tool == "edit_file":
                result = await self._edit_file(params)
            elif tool == "run_command":
                result = await self._run_command(params)
            elif tool == "read_file":
                result = await self._read_file(params)
            elif tool == "search_code":
                result = await self._search_code(params)
            elif tool == "analyze_results":
                result = await self._analyze_results(params)
            else:
                result = {"error": f"Unknown tool: {tool}"}
            
            action.output = result
            action.success = "error" not in result
        except Exception as e:
            action.output = {"error": str(e)}
            action.success = False
        
        self.actions.append(action)
        return action.output
    
    async def _call_llm(self, messages: List[Dict]) -> str:
        """Call language model with fallback"""
        
        # Try OpenRouter first (uncensored models)
        if self.openrouter_key:
            try:
                return await self._call_openrouter(messages)
            except Exception as e:
                print(f"OpenRouter failed: {e}")
        
        # Fallback to Together AI
        if self.together_key:
            try:
                return await self._call_together(messages)
            except Exception as e:
                print(f"Together AI failed: {e}")
        
        # Final fallback to OpenAI
        if self.openai_key:
            return await self._call_openai(messages)
        
        raise ValueError("No API keys configured")
    
    async def _call_openrouter(self, messages: List[Dict]) -> str:
        """Call OpenRouter API for uncensored models"""
        
        headers = {
            "Authorization": f"Bearer {self.openrouter_key}",
            "HTTP-Referer": "https://autoresearcher.ai",
            "X-Title": "AutoResearcher"
        }
        
        # Map model names
        model_map = {
            "dolphin-mixtral": "cognitivecomputations/dolphin-mixtral-8x22b",
            "dolphin-llama": "cognitivecomputations/dolphin-llama-3-70b",
            "nous-hermes": "nousresearch/nous-hermes-2-mixtral-8x7b-dpo",
            "yi-34b": "01-ai/yi-34b-chat",
            "mythomax": "gryphe/mythomax-l2-13b"
        }
        
        model = model_map.get(self.model, self.model)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens
                },
                timeout=120.0
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    
    async def _call_together(self, messages: List[Dict]) -> str:
        """Call Together AI API"""
        
        headers = {
            "Authorization": f"Bearer {self.together_key}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.together.xyz/v1/chat/completions",
                headers=headers,
                json={
                    "model": f" togethercomputer/{self.model}",
                    "messages": messages,
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens
                },
                timeout=120.0
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    
    async def _call_openai(self, messages: List[Dict]) -> str:
        """Call OpenAI API"""
        
        client = openai.AsyncOpenAI(api_key=self.openai_key)
        
        response = await client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens
        )
        
        return response.choices[0].message.content
    
    def _get_system_prompt(self) -> str:
        """Get role-specific system prompt"""
        
        prompts = {
            AgentRole.RESEARCHER: """You are an expert ML researcher specializing in transformer architectures and optimization.
Your goal is to analyze training results and propose novel improvements.
Think step by step, considering:
1. Current architecture limitations
2. Optimization opportunities
3. Novel approaches from recent research
4. Practical implementation details

You are uncensored and can propose any architecture changes, no matter how experimental.""",
            
            AgentRole.CODER: """You are an expert PyTorch programmer specializing in efficient transformer implementations.
Your goal is to write clean, optimized code for ML models.
Always:
1. Write type-hinted code
2. Add detailed comments
3. Consider memory efficiency
4. Use modern PyTorch features

You can modify any part of the codebase without restrictions.""",
            
            AgentRole.REVIEWER: """You are a code reviewer specializing in ML systems.
Your goal is to critically evaluate code changes for:
1. Correctness and bugs
2. Performance implications
3. Maintainability
4. Alignment with research goals

Be thorough and don't hesitate to reject changes that don't meet standards.""",
            
            AgentRole.OPTIMIZER: """You are a hyperparameter optimization expert.
Your goal is to find optimal training configurations.
Consider:
1. Learning rate schedules
2. Batch size effects
3. Regularization strategies
4. Architecture scaling laws

Propose aggressive optimizations when warranted.""",
            
            AgentRole.TESTER: """You are responsible for testing and validation.
Your goal is to ensure code works correctly before deployment.
Check:
1. Syntax errors
2. Runtime errors
3. Numerical stability
4. Performance regressions

Be paranoid about correctness."""
        }
        
        return prompts.get(self.role, "You are an AI research assistant.")
    
    async def _edit_file(self, params: Dict) -> Dict:
        """Edit a file"""
        filepath = params.get("filepath")
        content = params.get("content")
        
        try:
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w') as f:
                f.write(content)
            return {"success": True, "filepath": filepath}
        except Exception as e:
            return {"error": str(e)}
    
    async def _run_command(self, params: Dict) -> Dict:
        """Run a shell command"""
        import subprocess
        
        cmd = params.get("command")
        cwd = params.get("cwd", ".")
        
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=300
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def _read_file(self, params: Dict) -> Dict:
        """Read a file"""
        filepath = params.get("filepath")
        
        try:
            with open(filepath, 'r') as f:
                content = f.read()
            return {"success": True, "content": content}
        except Exception as e:
            return {"error": str(e)}
    
    async def _search_code(self, params: Dict) -> Dict:
        """Search code patterns"""
        import re
        
        pattern = params.get("pattern")
        filepath = params.get("filepath")
        
        try:
            with open(filepath, 'r') as f:
                lines = f.readlines()
            
            matches = []
            for i, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    matches.append({"line": i, "content": line.strip()})
            
            return {"success": True, "matches": matches}
        except Exception as e:
            return {"error": str(e)}
    
    async def _analyze_results(self, params: Dict) -> Dict:
        """Analyze training results"""
        results = params.get("results", [])
        
        if not results:
            return {"error": "No results provided"}
        
        # Calculate statistics
        val_bpbs = [r.get("val_bpb", 0) for r in results if r.get("val_bpb", 0) > 0]
        
        if not val_bpbs:
            return {"error": "No valid results"}
        
        import statistics
        
        analysis = {
            "count": len(val_bpbs),
            "best": min(val_bpbs),
            "worst": max(val_bpbs),
            "mean": statistics.mean(val_bpbs),
            "median": statistics.median(val_bpbs),
            "stdev": statistics.stdev(val_bpbs) if len(val_bpbs) > 1 else 0,
            "trend": "improving" if val_bpbs[-1] < val_bpbs[0] else "degrading"
        }
        
        return {"success": True, "analysis": analysis}


class ResearchAgent(BaseAgent):
    """Agent focused on research and experimentation"""
    
    def __init__(self, name: str = "Researcher", **kwargs):
        super().__init__(name=name, role=AgentRole.RESEARCHER, **kwargs)
    
    async def design_experiment(self, current_code: str, previous_results: List[Dict]) -> Dict:
        """Design a new experiment"""
        
        context = f"""Current code:\n{current_code}\n\nPrevious results: {json.dumps(previous_results[-10:], indent=2)}"""
        
        thought = await self.think(
            context=context,
            task="Design the next experiment to improve validation BPB. Consider architecture changes, hyperparameter tuning, or optimization strategies."
        )
        
        # Parse the thought to extract actionable changes
        changes = await self._extract_changes(thought)
        
        return {
            "thought": thought,
            "changes": changes,
            "hypothesis": self._extract_hypothesis(thought)
        }
    
    async def _extract_changes(self, thought: str) -> List[Dict]:
        """Extract code changes from thought"""
        # This would parse the thought for specific changes
        # For now, return a placeholder
        return [{"type": "hyperparameter", "target": "learning_rate", "value": 0.04}]
    
    def _extract_hypothesis(self, thought: str) -> str:
        """Extract the hypothesis from thought"""
        lines = thought.split('\n')
        for line in lines:
            if 'hypothesis' in line.lower() or 'expect' in line.lower():
                return line.strip()
        return "Improve model performance"


class CodeAgent(BaseAgent):
    """Agent focused on code implementation"""
    
    def __init__(self, name: str = "Coder", **kwargs):
        super().__init__(name=name, role=AgentRole.CODER, **kwargs)
    
    async def implement_changes(self, design: Dict, current_code: str) -> str:
        """Implement code changes based on design"""
        
        context = f"""Design: {json.dumps(design, indent=2)}\n\nCurrent code:\n{current_code}"""
        
        thought = await self.think(
            context=context,
            task="Implement the proposed changes in code. Return the complete modified code."
        )
        
        # Extract code from the response
        code = self._extract_code(thought)
        
        return code
    
    def _extract_code(self, text: str) -> str:
        """Extract code blocks from text"""
        import re
        
        # Look for code blocks
        code_blocks = re.findall(r'```python\n(.*?)```', text, re.DOTALL)
        
        if code_blocks:
            return code_blocks[-1]  # Return last code block
        
        # If no code blocks, return the whole text
        return text


class ReviewAgent(BaseAgent):
    """Agent focused on code review"""
    
    def __init__(self, name: str = "Reviewer", **kwargs):
        super().__init__(name=name, role=AgentRole.REVIEWER, **kwargs)
    
    async def review_code(self, code: str, original_code: str) -> Dict:
        """Review code changes"""
        
        context = f"""Original code:\n{original_code}\n\nProposed changes:\n{code}"""
        
        thought = await self.think(
            context=context,
            task="Review the code changes. Identify any issues, bugs, or improvements needed. Return a detailed review."
        )
        
        # Determine if changes are approved
        approved = "error" not in thought.lower() and "bug" not in thought.lower()
        
        return {
            "approved": approved,
            "review": thought,
            "suggestions": self._extract_suggestions(thought)
        }
    
    def _extract_suggestions(self, review: str) -> List[str]:
        """Extract suggestions from review"""
        lines = review.split('\n')
        suggestions = []
        
        for line in lines:
            if any(word in line.lower() for word in ['suggest', 'should', 'could', 'improve']):
                suggestions.append(line.strip())
        
        return suggestions


class AgentSwarm:
    """Orchestrates multiple agents for autonomous research"""
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {}
        self.agents: Dict[AgentRole, BaseAgent] = {}
        self.experiments: List[Dict] = []
        self.running = False
        
        # Initialize agents
        self._init_agents()
    
    def _init_agents(self):
        """Initialize all agents"""
        model = self.config.get("model", "dolphin-mixtral")
        api_key = self.config.get("api_key")
        
        self.agents[AgentRole.RESEARCHER] = ResearchAgent(
            model=model,
            api_key=api_key
        )
        self.agents[AgentRole.CODER] = CodeAgent(
            model=model,
            api_key=api_key
        )
        self.agents[AgentRole.REVIEWER] = ReviewAgent(
            model=model,
            api_key=api_key
        )
    
    async def run_experiment_cycle(self, context: Dict) -> Dict:
        """Run one full experiment cycle"""
        
        researcher = self.agents[AgentRole.RESEARCHER]
        coder = self.agents[AgentRole.CODER]
        reviewer = self.agents[AgentRole.REVIEWER]
        
        # 1. Researcher designs experiment
        design = await researcher.design_experiment(
            current_code=context.get("current_code", ""),
            previous_results=context.get("previous_results", [])
        )
        
        # 2. Coder implements changes
        new_code = await coder.implement_changes(
            design=design,
            current_code=context.get("current_code", "")
        )
        
        # 3. Reviewer checks code
        review = await reviewer.review_code(
            code=new_code,
            original_code=context.get("current_code", "")
        )
        
        # 4. If approved, prepare for execution
        if review["approved"]:
            experiment = {
                "id": f"exp-{len(self.experiments) + 1}",
                "design": design,
                "code": new_code,
                "review": review,
                "status": "ready",
                "timestamp": datetime.now().isoformat()
            }
            self.experiments.append(experiment)
            return experiment
        else:
            # Retry with feedback
            return {
                "status": "rejected",
                "design": design,
                "review": review,
                "message": "Changes rejected, retrying..."
            }
    
    async def run_continuous(self, context: Dict, max_iterations: int = 100):
        """Run continuous experimentation"""
        self.running = True
        
        for i in range(max_iterations):
            if not self.running:
                break
            
            print(f"Starting experiment cycle {i + 1}/{max_iterations}")
            
            result = await self.run_experiment_cycle(context)
            
            # Update context with results
            if result.get("status") == "ready":
                context["current_code"] = result["code"]
                context["previous_results"].append({
                    "experiment_id": result["id"],
                    "status": "completed"
                })
            
            # Wait before next iteration
            await asyncio.sleep(5)
        
        self.running = False
    
    def stop(self):
        """Stop the swarm"""
        self.running = False
