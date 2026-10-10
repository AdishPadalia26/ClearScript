import os
from typing import Any, Callable, Optional

import prismtrace
from langchain_core.runnables import Runnable
from prismtrace import PRISMtraceCallbackHandler


def build_prism_handler(
    *,
    api_key: Optional[str] = None,
    project_id: Optional[str] = None,
    host: Optional[str] = None,
    agent_name: Optional[str] = None,
) -> PRISMtraceCallbackHandler:
    return PRISMtraceCallbackHandler(
        api_key=api_key or os.environ["PRISMTRACE_API_KEY"],
        project_id=project_id or os.environ["PRISMTRACE_PROJECT_ID"],
        host=host or os.environ.get("PRISMTRACE_HOST", "https://prism-api-prod.up.railway.app"),
        agent_name=agent_name,
    )


def invoke_with_prism(
    runnable: Runnable,
    payload: Any,
    *,
    session_id: str,
    api_key: Optional[str] = None,
    project_id: Optional[str] = None,
    host: Optional[str] = None,
    agent_name: Optional[str] = None,
):
    handler = build_prism_handler(
        api_key=api_key,
        project_id=project_id,
        host=host,
        agent_name=agent_name,
    )
    try:
        with prismtrace.session(session_id):
            return runnable.invoke(payload, config={"callbacks": [handler]})
    finally:
        handler.close()


def example_run() -> None:
    from langchain_core.runnables import RunnableLambda

    chain = RunnableLambda(lambda x: {"output": f"Processed: {x}"})
    result = invoke_with_prism(
        chain,
        "hello world",
        session_id="staging-conversation-1",
        agent_name="document-processing-agent",
    )
    print(result)


if __name__ == "__main__":
    example_run()
