#!/usr/bin/env python3
"""
LangGraph Agent for halo-gemma
Direct Ollama integration - no Claude SDK, no format conversion
"""

import json
import sys
from typing import Annotated, TypedDict, Sequence
from langchain_ollama import ChatOllama
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.prebuilt import ToolNode
import operator
import os


# ============================================================================
# Tools (same as halo-gemma provides)
# ============================================================================

@tool
def web_search(query: str) -> str:
    """Search the web for information.

    Args:
        query: The search query

    Returns:
        Search results
    """
    # TODO: Integrate with existing web-search service via IPC
    # For POC, return mock data
    return f"Search results for '{query}': [Mock results - integrate with halo web-search service]"


@tool
def browser_run(url: str, script: str) -> str:
    """Run JavaScript in the AI browser.

    Args:
        url: The URL to navigate to
        script: JavaScript code to execute

    Returns:
        Result from browser execution
    """
    # TODO: Integrate with existing browser service via IPC
    return f"Browser result from {url}: [Mock - integrate with halo browser service]"


@tool
def read_file(path: str) -> str:
    """Read a file from the filesystem.

    Args:
        path: Path to the file

    Returns:
        File contents
    """
    try:
        with open(os.path.expanduser(path), 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"


@tool
def write_file(path: str, content: str) -> str:
    """Write content to a file.

    Args:
        path: Path to the file
        content: Content to write

    Returns:
        Success message
    """
    try:
        with open(os.path.expanduser(path), 'w', encoding='utf-8') as f:
            f.write(content)
        return f"File written successfully: {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"


@tool
def list_directory(path: str) -> str:
    """List files in a directory.

    Args:
        path: Directory path

    Returns:
        List of files
    """
    try:
        import os
        files = os.listdir(os.path.expanduser(path))
        return "\n".join(files)
    except Exception as e:
        return f"Error listing directory: {str(e)}"


# ============================================================================
# Agent State
# ============================================================================

class AgentState(TypedDict):
    """State for the agent graph"""
    messages: Annotated[Sequence[BaseMessage], operator.add]


# ============================================================================
# LangGraph Agent
# ============================================================================

class GemmaAgent:
    """
    LangGraph-based agent for Gemma 4 via Ollama

    Direct replacement for Claude Code SDK - no format conversion needed
    """

    def __init__(
        self,
        model: str = "gemma4:26b",
        base_url: str = "http://localhost:11434",
        system_prompt: str = None,
        temperature: float = 0.7,
        session_db: str = "~/.halo-dev/langgraph-sessions.db"
    ):
        """
        Initialize the agent

        Args:
            model: Ollama model name (gemma4:26b, gemma4:12b, etc.)
            base_url: Ollama API URL
            system_prompt: System prompt (defaults to Gemma profile)
            temperature: Temperature for generation
            session_db: Path to SQLite database for session persistence
        """
        self.model_name = model
        self.system_prompt = system_prompt or self._get_default_system_prompt()

        # Initialize Ollama LLM
        self.llm = ChatOllama(
            model=model,
            base_url=base_url,
            temperature=temperature,
            # Note: No need for think:false hack - native control
        )

        # Define tools
        self.tools = [
            web_search,
            browser_run,
            read_file,
            write_file,
            list_directory,
        ]

        # Bind tools to LLM
        self.llm_with_tools = self.llm.bind_tools(self.tools)

        # Setup session persistence
        session_db_path = os.path.expanduser(session_db)
        os.makedirs(os.path.dirname(session_db_path), exist_ok=True)

        # Use context manager for SqliteSaver
        self._checkpointer_cm = SqliteSaver.from_conn_string(session_db_path)
        self.checkpointer = self._checkpointer_cm.__enter__()

        # Build graph
        self.graph = self._build_graph()

    def _get_default_system_prompt(self) -> str:
        """Get default system prompt for Gemma"""
        return """You are a helpful AI assistant powered by Gemma 4.

You have access to tools for web search, browser automation, and file operations.
Use these tools when needed to help the user accomplish their tasks.

Be concise and focused in your responses."""

    def _build_graph(self):
        """Build the agent workflow graph"""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("agent", self._call_model)
        workflow.add_node("tools", ToolNode(self.tools))

        # Set entry point
        workflow.set_entry_point("agent")

        # Add conditional edges
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {
                "continue": "tools",
                "end": END,
            }
        )
        workflow.add_edge("tools", "agent")

        # Compile with checkpointer for session persistence
        return workflow.compile(checkpointer=self.checkpointer)

    def _call_model(self, state: AgentState):
        """Call the LLM"""
        messages = state["messages"]

        # Add system message if not present
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=self.system_prompt)] + list(messages)

        response = self.llm_with_tools.invoke(messages)
        return {"messages": [response]}

    def _should_continue(self, state: AgentState):
        """Decide whether to continue to tools or end"""
        messages = state["messages"]
        last_message = messages[-1]

        # If the LLM makes a tool call, continue
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "continue"
        return "end"

    def chat(self, message: str, session_id: str = "default") -> str:
        """
        Send a message and get response

        Args:
            message: User message
            session_id: Session identifier for persistence

        Returns:
            Assistant response
        """
        config = {"configurable": {"thread_id": session_id}}

        response = self.graph.invoke(
            {"messages": [HumanMessage(content=message)]},
            config=config
        )

        # Return last message content
        return response["messages"][-1].content

    def stream(self, message: str, session_id: str = "default"):
        """
        Stream response chunks

        Args:
            message: User message
            session_id: Session identifier

        Yields:
            Response chunks
        """
        config = {"configurable": {"thread_id": session_id}}

        for event in self.graph.stream(
            {"messages": [HumanMessage(content=message)]},
            config=config,
            stream_mode="values"
        ):
            if "messages" in event and event["messages"]:
                last_message = event["messages"][-1]
                if isinstance(last_message, AIMessage) and last_message.content:
                    yield last_message.content

    def get_history(self, session_id: str = "default"):
        """
        Get conversation history for a session

        Args:
            session_id: Session identifier

        Returns:
            List of messages
        """
        config = {"configurable": {"thread_id": session_id}}
        state = self.graph.get_state(config)
        return state.values.get("messages", [])


# ============================================================================
# CLI Interface (for testing and Node.js bridge)
# ============================================================================

def main():
    """CLI interface for the agent"""
    import argparse

    parser = argparse.ArgumentParser(description="LangGraph Agent for halo-gemma")
    parser.add_argument("command", choices=["chat", "stream"], help="Command to execute")
    parser.add_argument("message", help="User message")
    parser.add_argument("--session-id", default="default", help="Session ID")
    parser.add_argument("--model", default="gemma4:26b", help="Model name")

    args = parser.parse_args()

    # Initialize agent
    agent = GemmaAgent(model=args.model)

    if args.command == "chat":
        # Simple chat
        response = agent.chat(args.message, args.session_id)
        print(json.dumps({"response": response}))

    elif args.command == "stream":
        # Streaming
        for chunk in agent.stream(args.message, args.session_id):
            print(json.dumps({"chunk": chunk}))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
